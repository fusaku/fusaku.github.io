// 字幕相关函数
function parseASSTime(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return null;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 +
    parseInt(match[3]) + parseInt(match[4]) / 100;
}

// 获取视频播放速度
function getVideoPlaybackRate() {
  const video = document.querySelector('video');
  return video ? video.playbackRate : 1.0;
}

function parseASSSubtitles(assContent) {
  const lines = assContent.split('\n');
  const subtitleLines = [];
  let inEvents = false;

  for (let line of lines) {
    line = line.trim();
    if (line === '[Events]') {
      inEvents = true;
      continue;
    }
    if (line.startsWith('[') && line !== '[Events]') {
      inEvents = false;
      continue;
    }

    if (inEvents && line.startsWith('Dialogue:')) {
      const parts = line.split(',');
      if (parts.length >= 10) {
        const startTime = parseASSTime(parts[1].trim());
        const endTime = parseASSTime(parts[2].trim());
        const style = parts[3].trim();
        const text = parts.slice(9).join(',').replace(/\\N/g, '\n').trim();

        if (text && startTime !== null && endTime !== null) {
          subtitleLines.push({
            start: startTime,
            end: endTime,
            text: text,
            style: style
          });
        }
      }
    }
  }

  return subtitleLines.sort((a, b) => a.start - b.start);
}

// 查找可用的行号和水平位置 - 支持同行多字幕不重叠
function findAvailablePosition(currentTime, textWidth, containerWidth, moveSpeed) {
  const overlay = document.getElementById('subtitle-overlay');

  // 更可靠的容器高度获取
  let containerHeight;
  if (overlay && overlay.offsetHeight > 0) {
    containerHeight = overlay.offsetHeight;
  } else {
    const videoContainer = document.getElementById('video-container');
    if (videoContainer && videoContainer.offsetHeight > 0) {
      containerHeight = videoContainer.offsetHeight;
    } else {
      containerHeight = window.innerWidth > 768 ? 675 : window.innerHeight * 0.6;
    }
  }

  const textHeight = window.innerWidth > 768 ? 20 : 16;
  const lineHeight = window.innerWidth > 768 ? 20 : 10;
  const padding = 15;

  // 清理过期的区域记录
  for (const [subId, area] of activeSubtitleAreas.entries()) {
    if (currentTime > area.endTime + 0.5) {
      activeSubtitleAreas.delete(subId);
    }
  }

  // 确保至少有足够的行数显示字幕
  const minLines = 8; // 最少保证8行
  const idealMaxLines = Math.floor((containerHeight - 40) / lineHeight);
  const maxLines = Math.max(minLines, idealMaxLines);

  // 如果容器太小，压缩行高
  const adjustedLineHeight = idealMaxLines < minLines ?
    Math.floor((containerHeight - 40) / minLines) : lineHeight;

  // 从第一行开始检查，优先使用上面的行
  for (let line = 0; line < maxLines; line++) {
    const y = 20 + line * adjustedLineHeight;

    // 确保不超出容器
    if (y + textHeight + 10 <= containerHeight) {
      lineMoveSpeeds.set(line, moveSpeed);
      // 检查这一行是否有空间
      if (!checkHorizontalOverlap(containerWidth, y, textWidth, textHeight, padding, line, moveSpeed)) {
        return {
          x: containerWidth,
          y: y,
          line: line,
          startX: containerWidth
        };
      }
    }
  }

  // 强制显示在最后一行（确保字幕一定显示）
  const forceY = Math.max(20, containerHeight - textHeight - 20);
  return {
    x: containerWidth,
    y: forceY,
    line: maxLines - 1,
    startX: containerWidth
  };
}

// 检查水平重叠 - 基于字幕左边缘与屏幕右边缘的距离
function checkHorizontalOverlap(startX, y, textWidth, textHeight, padding, line, moveSpeed) {
  const minDistance = 120; // 前一个字幕左边缘需要离开屏幕右边缘的最小距离

  const newRect = {
    x: startX,
    y: y,
    width: textWidth + padding,
    height: textHeight + padding
  };

  for (const [subId, area] of activeSubtitleAreas.entries()) {
    // 检查是否在同一行（垂直重叠）
    const verticalOverlap = !(newRect.y + newRect.height < area.y || area.y + area.height < newRect.y);
    const currentLineSpeed = lineMoveSpeeds.get(line);

    if (currentLineSpeed && moveSpeed > currentLineSpeed * 1.03) { // 3%的容差
      console.log(`速度冲突 - 当前行速度: ${currentLineSpeed}, 新字幕速度: ${moveSpeed}, 跳过第${line}行`);
      return true; // 跳过这一行，寻找下一行
    }
    if (verticalOverlap) {
      // 同一行，获取前一个字幕的当前位置
      const previousSubElement = subtitleElements.get(subId);
      if (previousSubElement && previousSubElement.parentNode) {
        // 获取前一个字幕的当前左边缘位置
        const computedStyle = window.getComputedStyle(previousSubElement);
        const currentLeft = parseFloat(computedStyle.left) || parseFloat(previousSubElement.style.left) || area.x;

        // 计算左边缘与屏幕右边缘的距离
        const distanceFromRightEdge = startX - currentLeft; // startX 就是屏幕右边缘

        // 如果距离不够，就有冲突
        if (distanceFromRightEdge < minDistance) {
          return true; // 有冲突，需要换行
        }

        // 距离够了，再做体积检测
        const updatedArea = {
          x: currentLeft,
          y: area.y,
          width: area.width,
          height: area.height
        };

        if (isRectOverlapping(newRect, updatedArea)) {
          return true; // 体积重叠
        }
      }
    } else {
      // 不同行，直接体积检测
      if (isRectOverlapping(newRect, area)) {
        return true;
      }
    }
  }

  return false; // 没有重叠
}

// 计算字幕文本的实际宽度
function calculateSubtitleWidth(text, fontSize = 16) {
  // 创建一个临时的测量元素
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = `600 ${fontSize}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;

  // 测量文本宽度
  const metrics = context.measureText(text);
  return metrics.width;
}

// 计算弹幕需要的移动距离
function calculateMoveDistance(text, containerWidth) {
  const fontSize = window.innerWidth > 768 ? 16 : 14;
  const textWidth = calculateSubtitleWidth(text, fontSize);
  const baseDistance = 200; // 基础移动距离
  const padding = 50; // 额外的缓冲距离

  // 移动距离 = 容器宽度 + 文本宽度 + 缓冲距离
  const totalDistance = containerWidth + textWidth + padding;

  console.log(`Text: "${text}", width: ${textWidth}, move distance: ${totalDistance}`);
  return totalDistance;
}

// 检查两个矩形是否重叠
function isRectOverlapping(rect1, rect2) {
  return !(rect1.x + rect1.width < rect2.x ||
    rect2.x + rect2.width < rect1.x ||
    rect1.y + rect1.height < rect2.y ||
    rect2.y + rect2.height < rect1.y);
}

// 查找不重叠的位置
function findNonOverlappingPosition(textWidth, textHeight, containerWidth, containerHeight, currentTime) {
  const padding = 10; // 字幕间距
  const lineHeight = window.innerWidth > 768 ? 20 : 10;

  // 清理过期的区域记录
  for (const [subId, area] of activeSubtitleAreas.entries()) {
    if (currentTime > area.endTime + 0.5) {
      activeSubtitleAreas.delete(subId);
    }
  }

  // 尝试不同的垂直位置
  for (let line = 0; line < 30; line++) { // 增加可尝试的行数
    const y = 20 + line * lineHeight;
    if (y + textHeight + 20 > containerHeight) break; // 超出容器底部

    // 在这一行尝试不同的水平位置
    for (let x = containerWidth; x >= -textWidth; x -= 20) {
      const newRect = {
        x: x,
        y: y,
        width: textWidth + padding,
        height: textHeight + padding
      };

      // 检查是否与现有字幕重叠
      let hasOverlap = false;
      for (const area of activeSubtitleAreas.values()) {
        if (isRectOverlapping(newRect, area)) {
          hasOverlap = true;
          break;
        }
      }

      if (!hasOverlap) {
        return { x: x, y: y };
      }
    }
  }

  // 如果找不到不重叠的位置，返回默认位置
  return { x: containerWidth, y: 20 };
}

// 改进的字幕加载
async function loadSubtitles(videoId) {
  const video = document.querySelector('video');
  if (video && !window.playbackRateListenerSetup) {
    setupPlaybackRateListener(); // 直接挂载，不需要 wait
    window.playbackRateListenerSetup = true;
  }
  try {
    console.log('Loading subtitles for:', videoId);
    const response = await fetch(`../subtitles/${videoId}.ass`);

    if (!response.ok) {
      throw new Error(window.i18n.t('subtitles.fileNotFound', `字幕文件不存在 (${response.status})`));
    }

    const assContent = await response.text();
    console.log('ASS content loaded, length:', assContent.length);

    subtitles = parseASSSubtitles(assContent);
    console.log('Parsed subtitles:', subtitles.length);

    if (subtitles.length > 0) {
      document.getElementById('subtitle-status').innerHTML = `${window.i18n.t('subtitles.status', '字幕')}: ${subtitles.length} ${window.i18n.t('subtitles.loadingCount', '行')}`;
      document.getElementById('subtitle-toggle').classList.remove('disabled');
      document.getElementById('subtitle-toggle').textContent = window.i18n.t('subtitles.hide', '隐藏字幕');
      return true;
    } else {
      throw new Error(window.i18n.t('subtitles.fileEmpty', '字幕文件为空或格式不正确'));
    }
  } catch (error) {
    console.error('Subtitle loading error:', error);
    document.getElementById('subtitle-status').innerHTML = `${window.i18n.t('subtitles.status', '字幕')}: ${window.i18n.t('subtitles.none', '无')}`;
    document.getElementById('subtitle-toggle').classList.add('disabled');
    document.getElementById('subtitle-toggle').textContent = window.i18n.t('subtitles.noSubtitles', '无字幕');
    subtitles = [];
    subtitlesVisible = false;
    return false;
  }
}
// 监听视频播放速度变化
function setupPlaybackRateListener() {
  const video = document.querySelector('video');
  if (!video) {
    console.warn('Video element not found');
    return;
  }

  video.addEventListener('ratechange', () => {
    const newRate = video.playbackRate;
    console.log(`播放速度改变为: ${newRate}x`);

    // 更新所有正在播放的弹幕速度
    updateActiveSubtitlesSpeeds(newRate);
  });

  console.log('Playback rate listener setup complete');
}

// 更新所有活跃弹幕的动画速度
function updateActiveSubtitlesSpeeds(playbackRate) {
  console.log("正在同步活跃弹幕速度, 倍速:", playbackRate);
  
  subtitleElements.forEach((element, subId) => {
    if (!element || !element.parentNode) return;

    // 1. 获取当前实时位置
    const computedStyle = window.getComputedStyle(element);
    const currentLeft = parseFloat(computedStyle.left);
    
    // 2. 立即停止当前动画
    element.style.transition = 'none';
    element.style.left = `${currentLeft}px`;
    
    // 强制浏览器重绘 (关键步骤)
    element.offsetHeight; 

    // 3. 读取终点位置，如果读取不到则手动补算一个
    let targetLeft = parseFloat(element.dataset.targetLeft);
    if (isNaN(targetLeft)) {
      targetLeft = -(element.offsetWidth + 50);
    }

    // 4. 计算剩余路程
    const remainingDistance = currentLeft - targetLeft;

    if (remainingDistance > 0) {
      // 5. 根据新倍速计算剩余时间
      const baseSpeed = window.innerWidth > 768 ? 180 : 150;
      const actualSpeed = baseSpeed * playbackRate;
      const newDuration = remainingDistance / actualSpeed;

      // 6. 重新应用动画
      requestAnimationFrame(() => {
        element.style.transition = `left ${newDuration}s linear`;
        element.style.left = `${targetLeft}px`;
      });
    }
  });
}
// 字幕显示函数
function displayCurrentSubtitle(currentTime) {
  if (!subtitlesVisible || !subtitles.length) return;

  const container = document.getElementById('subtitle-container');
  if (!container) return;

  const playbackRate = getVideoPlaybackRate();

  subtitles.forEach((subtitle, index) => {
    // 检查时间是否匹配，且该弹幕未在显示中
    if (currentTime >= subtitle.startTime && currentTime <= subtitle.endTime && !activeSubtitles.has(index)) {
      
      const div = document.createElement('div');
      div.className = 'danmaku-subtitle';
      div.id = `sub-${index}`;
      
      // 处理 ASS 特效代码 (去除 {\...} 标签)
      const cleanText = subtitle.text.replace(/\{[^}]+\}/g, '');
      div.textContent = cleanText;

      // 应用样式
      if (subtitle.color) div.style.color = subtitle.color;
      if (subtitle.fontSize) div.style.fontSize = `${subtitle.fontSize}px`;
      
      container.appendChild(div);

      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;
      const textWidth = div.offsetWidth;
      const textHeight = div.offsetHeight || 30;

      // --- 关键逻辑 1: 处理 \move 特效坐标 ---
      const moveMatch = subtitle.text.match(/\\move\(([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)/);
      let targetLeft, finalDuration, startY;

      if (moveMatch) {
        // ASS 坐标系转换逻辑
        const scaleX = containerWidth / 384; 
        const scaleY = containerHeight / 288;
        const startX = parseFloat(moveMatch[1]) * scaleX;
        startY = parseFloat(moveMatch[2]) * scaleY;
        const endX = parseFloat(moveMatch[3]) * scaleX;
        const endY = parseFloat(moveMatch[4]) * scaleY;

        div.style.left = `${startX}px`;
        div.style.top = `${startY}px`;
        
        targetLeft = endX;
        div.dataset.targetLeft = endX;
        div.dataset.targetTop = endY;
        div.dataset.isMoveEffect = "true";
        
        // 特效弹幕的时间由字幕本身起止差决定，同时受倍速影响
        finalDuration = (subtitle.endTime - subtitle.startTime) / playbackRate;
      } else {
        // --- 关键逻辑 2: 普通滚动弹幕 (带防重叠) ---
        // 寻找不重叠的行号 (y坐标)
        const position = findAvailablePosition(textWidth, textHeight, containerWidth, containerHeight, subtitle.endTime);
        startY = position.y;
        
        div.style.top = `${startY}px`;
        div.style.left = `${containerWidth}px`; // 从右侧进入

        targetLeft = -(textWidth + 100); // 飞出左侧
        div.dataset.targetLeft = targetLeft;
        div.dataset.isMoveEffect = "false";

        // 计算普通滚动弹幕的时间 (基准速度 180px/s)
        const baseSpeed = window.innerWidth > 768 ? 180 : 150;
        const actualSpeed = baseSpeed * playbackRate;
        const totalDistance = containerWidth + textWidth + 100;
        finalDuration = totalDistance / actualSpeed;

        // 记录区域信息，用于下一条弹幕的碰撞检测
        activeSubtitleAreas.set(index, {
          x: containerWidth,
          y: startY,
          width: textWidth,
          height: textHeight,
          endTime: subtitle.endTime,
          line: position.line
        });
      }

      // --- 关键逻辑 3: 启动动画 ---
      div.dataset.endTime = subtitle.endTime;
      activeSubtitles.add(index);
      subtitleElements.set(index, div);

      requestAnimationFrame(() => {
        div.style.transition = `all ${finalDuration}s linear`;
        div.style.left = `${targetLeft}px`;
        if (div.dataset.isMoveEffect === "true") {
          div.style.top = `${div.dataset.targetTop}px`;
        }
      });
    }
  });
}

// 字幕切换
function toggleSubtitles() {
  const btn = document.getElementById('subtitle-toggle');
  if (btn.classList.contains('disabled') || subtitles.length === 0) return;
  // 切换字幕显示状态
  subtitlesVisible = !subtitlesVisible;

  btn.textContent = subtitlesVisible ?
    window.i18n.t('subtitles.hide', '隐藏字幕') :
    window.i18n.t('subtitles.show', '显示字幕');

  if (!subtitlesVisible) {
    // 清理所有字幕状态
    document.getElementById('subtitle-overlay').innerHTML = '';
    activeSubtitles.clear();
    subtitleElements.clear();
  }

  console.log('Subtitles toggled:', subtitlesVisible);
}