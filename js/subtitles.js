// 字幕相关函数
function parseASSTime(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return null;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 +
    parseInt(match[3]) + parseInt(match[4]) / 100;
}

// 新增：rAF 渲染引擎，让字幕位移实时匹配视频倍速
function animateSubtitleManual(element) {
  if (!element || !element.parentNode) return;

  const now = performance.now();
  // 从 player.js 的全局变量或直接从 video 标签获取倍速
  const playbackRate = getVideoPlaybackRate();

  if (!element.dataset.lastFrameTime) {
    element.dataset.lastFrameTime = now;
  }

  const deltaTime = (now - parseFloat(element.dataset.lastFrameTime)) / 1000;
  element.dataset.lastFrameTime = now;

  let progress = parseFloat(element.dataset.animProgress || 0);
  const baseDuration = parseFloat(element.dataset.baseDuration) || 5; // 如果拿不到，默认5秒

  // 核心：进度增加量随倍速实时变化
  progress += (deltaTime * playbackRate) / baseDuration;
  element.dataset.animProgress = progress;

  const startX = parseFloat(element.dataset.startX);
  const endX = parseFloat(element.dataset.endX);
  const startY = parseFloat(element.dataset.startY);
  const endY = parseFloat(element.dataset.endY);

  const currentX = startX + (endX - startX) * Math.min(progress, 1);
  const currentY = startY + (endY - startY) * Math.min(progress, 1);

  element.style.transition = 'none';
  element.style.left = `${currentX}px`;
  element.style.top = `${currentY}px`;

  if (progress < 1 && subtitlesVisible) {
    requestAnimationFrame(() => animateSubtitleManual(element));
  }
}

// 获取视频播放速度
function getVideoPlaybackRate() {
    let rate = 1.0;
    // 尝试寻找页面上所有的 video 标签（兼容某些播放器框架）
    const videos = document.getElementsByTagName('video');
    if (videos.length > 0) {
        rate = videos[0].playbackRate;
    } 
    // 尝试 YouTube API
    else if (window.player && typeof window.player.getPlaybackRate === 'function') {
        rate = window.player.getPlaybackRate();
    }
    
    // 调试用：如果速度不是1，就在控制台打印，确认逻辑生效
    if (rate !== 1) {
        console.log("当前捕捉到的倍速:", rate); 
    }
    return rate || 1.0;
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

// 字幕显示函数
function displayCurrentSubtitle(currentTime) {
  const padding = 15;
  const overlay = document.getElementById('subtitle-overlay');

  // 确保容器有有效的高度
  if (!overlay || overlay.offsetHeight === 0) {
    return;
  }
  if (!subtitlesVisible || subtitles.length === 0) {
    // 清除所有字幕
    overlay.innerHTML = '';
    activeSubtitles.clear();
    subtitleElements.clear();
    return;
  }

  // 检测时间跳跃，清理过时的显示记录
  if (typeof displayCurrentSubtitle.lastTime === 'undefined') {
    displayCurrentSubtitle.lastTime = currentTime;
  }

  const timeDiff = Math.abs(currentTime - displayCurrentSubtitle.lastTime);
  if (timeDiff > 1) { // 降低到1秒阈值
    console.log(`Time jump detected: ${displayCurrentSubtitle.lastTime} -> ${currentTime}`);
    displayedSubtitles.clear();
  }
  displayCurrentSubtitle.lastTime = currentTime;

  // 获取当前应该显示的字幕
  const currentSubs = subtitles.filter(sub =>
    currentTime >= sub.start && currentTime <= sub.end
  );

  // 创建当前应该显示的字幕ID集合
  const currentSubIds = new Set();

  currentSubs.forEach((sub, index) => {
    const lines = sub.text.split('\n');
    lines.forEach((line, lineIndex) => {
      if (!line.trim()) return;

      // 使用字幕在原数组中的真实索引作为唯一标识
      const realSubIndex = subtitles.indexOf(sub);
      const subId = `sub_${realSubIndex}_${lineIndex}_${sub.start}_${sub.end}`;
      const timeKey = `${sub.start.toFixed(1)}`; // 更准确的时间表示

      currentSubIds.add(subId);

      // 检查这个时间点的这一行字幕是否已经显示过
      if (!displayedSubtitles.has(timeKey)) {
        displayedSubtitles.set(timeKey, new Set());
      }

      const displayedAtTime = displayedSubtitles.get(timeKey);
      const lineKey = `${realSubIndex}_${lineIndex}`;

      // 如果字幕已经存在或这一行在这个时间点已经显示过，跳过创建
      if (activeSubtitles.has(subId) || displayedAtTime.has(lineKey)) {
        return;
      }

      // 标记这一行字幕在这个时间点已显示
      displayedAtTime.add(lineKey);
      // 标记为已处理
      processedSubtitles.add(subId);
      // 标记为活跃字幕
      activeSubtitles.add(subId);

      // 创建字幕元素
      const div = document.createElement('div');
      div.className = 'danmaku-subtitle';
      div.dataset.subtitleId = subId;
      div.dataset.startTime = sub.start;
      div.dataset.endTime = sub.end;
      div.dataset.animationStartTime = currentTime;

      // 存储元素引用
      subtitleElements.set(subId, div);

      // 解析ASS标签
      let cleanText = line;
      let moveData = null;

      // 提取移动标签
      const moveMatch = line.match(/\\move\((\d+),(\d+),(\d+),(\d+)\)/);
      const alphaMatch = line.match(/\\alpha&H([0-9A-Fa-f]+)&/);

      if (moveMatch) {
        moveData = {
          x1: parseInt(moveMatch[1]),
          y1: parseInt(moveMatch[2]),
          x2: parseInt(moveMatch[3]),
          y2: parseInt(moveMatch[4])
        };
      }

      // 设置基本样式
      div.style.position = 'absolute';
      div.style.color = '#fff';
      div.style.fontSize = '16px';
      div.style.fontWeight = '600';
      div.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px rgba(0,0,0,0.8)';
      div.style.whiteSpace = 'nowrap';
      div.style.pointerEvents = 'none';
      div.style.zIndex = '100';

      // 设置透明度
      if (alphaMatch) {
        const alpha = parseInt(alphaMatch[1], 16);
        div.style.opacity = (255 - alpha) / 255;
      }

      if (moveData) {
        // 弹幕动画：使用ASS坐标系统
        const containerWidth = overlay.offsetWidth || (window.innerWidth > 768 ? 1200 : window.innerWidth);
        const containerHeight = overlay.offsetHeight || (window.innerWidth > 768 ? 675 : window.innerHeight * 0.6);
        const playbackRate = getVideoPlaybackRate();

        // 移动端适配：使用更小的基准分辨率
        const baseWidth = window.innerWidth > 768 ? 640 : 360;
        const baseHeight = window.innerWidth > 768 ? 360 : 200;

        const scaleX = containerWidth / baseWidth;
        const scaleY = containerHeight / baseHeight;

        const startX = Math.max(0, Math.min(moveData.x1 * scaleX, containerWidth - 100));
        const startY = Math.max(0, Math.min(moveData.y1 * scaleY, containerHeight - 30));
        const endX = Math.max(-200, Math.min(moveData.x2 * scaleX, containerWidth));
        const endY = Math.max(0, Math.min(moveData.y2 * scaleY, containerHeight - 30));

        // 设置初始位置
        div.style.left = `${startX}px`;
        div.style.top = `${startY}px`;
        // 关键修改：存入数据供 animateSubtitleManual 使用
        div.dataset.startX = startX;
        div.dataset.startY = startY;
        div.dataset.endX = endX;
        div.dataset.endY = endY;
        div.dataset.animProgress = 0;
        div.dataset.baseDuration = (sub.end - sub.start); // 使用原始秒数
        div.dataset.endTime = sub.end;

        // 启动手动动画
        requestAnimationFrame(() => animateSubtitleManual(div));
      } else {
        // 默认弹幕处理 - 从右到左移动
        const containerWidth = overlay.offsetWidth || (window.innerWidth > 768 ? 1200 : window.innerWidth);
        const fontSize = window.innerWidth > 768 ? 16 : 14;

        // 计算字幕文本宽度
        const cleanTextForMeasure = line.replace(/\{[^}]*\}/g, '').trim();
        const textWidth = calculateSubtitleWidth(cleanTextForMeasure, fontSize);

        // 计算移动参数
        const totalMoveDistance = containerWidth + textWidth + 50; // 完全移出屏幕的距离
        const pixelsPerSecond = window.innerWidth > 768 ? 180 : 150; // 恒定速度
        const calculatedDuration = totalMoveDistance / pixelsPerSecond;

        // 限制动画时间
        const playbackRate = getVideoPlaybackRate();
        const originalDuration = sub.end - sub.start;
        const minDuration = Math.max(3, originalDuration * 0.8);
        const maxDuration = originalDuration * 2.5;
        const baseDuration = Math.max(minDuration, Math.min(maxDuration, calculatedDuration));
        // 根据播放速度调整动画时长
        const finalDuration = baseDuration / playbackRate;

        // 计算移动速度 (像素/秒)
        const moveSpeed = totalMoveDistance / finalDuration;

        // 查找可用的行位置（传入移动速度）
        const position = findAvailablePosition(currentTime, textWidth, containerWidth, moveSpeed);

        // 记录字幕占用的区域和结束时间
        const endTime = currentTime + finalDuration;
        // 记录字幕移动轨迹占用的空间
        activeSubtitleAreas.set(subId, {
          x: containerWidth, // 起始位置
          y: position.y,
          width: textWidth + padding,
          height: (window.innerWidth > 768 ? 20 : 16) + 10,
          endTime: endTime,
          line: position.line,
          subId: subId // 添加subId，用于查找DOM元素
        });

        // 设置初始样式和位置
        div.dataset.startX = containerWidth;
        div.dataset.endX = -(textWidth + 50);
        div.dataset.startY = position.y;
        div.dataset.endY = position.y;
        div.dataset.animProgress = 0;
        div.dataset.baseDuration = baseDuration; // 存储不含倍速的原始耗时
        div.dataset.endTime = sub.end;

        div.style.fontSize = `${fontSize}px`;
        div.style.left = `${div.dataset.startX}px`;
        div.style.top = `${div.dataset.startY}px`;

        // 启动手动逐帧动画
        requestAnimationFrame(() => animateSubtitleManual(div));
      }

      // 处理文本样式标签
      cleanText = line.replace(/\{[^}]*\}/g, (match) => {
        if (match.includes('\\b1')) div.style.fontWeight = 'bold';
        if (match.includes('\\i1')) div.style.fontStyle = 'italic';
        if (match.includes('\\u1')) div.style.textDecoration = 'underline';
        if (match.includes('\\s1')) div.style.textDecoration = 'line-through';

        // 颜色标签
        const colorMatch = match.match(/\\c&H([0-9A-Fa-f]{6})&/);
        if (colorMatch) {
          const color = colorMatch[1];
          const r = parseInt(color.substr(4, 2), 16);
          const g = parseInt(color.substr(2, 2), 16);
          const b = parseInt(color.substr(0, 2), 16);
          div.style.color = `rgb(${r}, ${g}, ${b})`;
        }

        return '';
      });

      div.textContent = cleanText.trim();
      overlay.appendChild(div);
    });
  });

  // 清除真正过期的字幕（基于时间判断，而不是当前显示状态）
  const subtitlesToRemove = [];
  activeSubtitles.forEach(subId => {
    const element = subtitleElements.get(subId);
    if (element) {
      const endTime = parseFloat(element.dataset.endTime);
      // 只有当字幕真正结束时才移除，给一点缓冲时间
      if (currentTime > endTime + 0.5) {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        subtitlesToRemove.push(subId);
      }
    }
  });

  // 从集合中移除已删除的字幕
  subtitlesToRemove.forEach(subId => {
    activeSubtitles.delete(subId);
    subtitleElements.delete(subId);
    processedSubtitles.delete(subId); // 清理已处理记录，允许重新播放

    // 清理区域记录
    activeSubtitleAreas.delete(subId);
    // 清理速度记录
    const area = activeSubtitleAreas.get(subId);
    if (area && area.line !== undefined) {
      // 检查这一行是否还有其他活跃字幕
      const hasOtherActiveOnLine = Array.from(activeSubtitleAreas.values())
        .some(otherArea => otherArea.line === area.line && otherArea.subId !== subId);

      if (!hasOtherActiveOnLine) {
        lineMoveSpeeds.delete(area.line);
      }
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