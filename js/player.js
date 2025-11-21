// 播放页面脚本 - player.js

// 全局变量
let currentVideoId = '';
let subtitles = [];
let subtitlesVisible = true;
let player = null;
let updateInterval = null;
let loadingTimeout = null;
let usingFallback = false;
let apiReady = false;
// 新增：字幕行占用管理和移动计算
let activeSubtitleAreas = new Map(); // Map<subId, {x, y, width, height, endTime}>
// 新增：跟踪每行字幕的移动速度
let lineMoveSpeeds = new Map(); // Map<line, speed>

// 用于跟踪已显示的字幕，避免重复创建
let activeSubtitles = new Set();
let subtitleElements = new Map(); // 存储字幕元素的引用
let displayedSubtitles = new Map(); // 记录每个时间点已显示过的字幕行：Map<时间戳, Set<字幕索引>>
let processedSubtitles = new Set(); // 跟踪已经处理过的字幕，防止重复
let playbackRate = 1.0; // 添加这行,跟踪播放速度

// 初始化多语言
async function initializeI18n() {
  await window.i18n.loadLanguage();
  window.i18n.updatePageTexts();
}

// 工具函数
function getVideoIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

function updateLoadingStatus(status) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = status;
  console.log('Loading status:', status);
}

function showSuccess() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');

  if (usingFallback) {
    document.getElementById('fallback-iframe').classList.remove('hidden');
    const notice = document.createElement('div');
    notice.className = 'fallback-notice';
    notice.textContent = window.i18n.t('subtitles.fallbackNotice', '使用备用播放器 - 字幕可能不完全同步');
    document.getElementById('video-container').appendChild(notice);
  } else {
    document.getElementById('youtube-player').classList.remove('hidden');
  }

  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  console.log('Player loaded successfully, using fallback:', usingFallback);
}

function showError(message) {
  console.error('Showing error:', message);
  document.getElementById('error-message').textContent = message;
  document.getElementById('error').classList.remove('hidden');
  document.getElementById('loading').classList.add('hidden');
}

function retryLoad() {
  location.reload();
}

// 获取视频标题
async function fetchVideoTitle(videoId) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      return data.title || window.i18n.t('player.videoPlay', '视频播放');
    }
  } catch (error) {
    console.error('Failed to fetch video title:', error);
  }
  return window.i18n.t('player.videoPlay', '视频播放');
}

// 字幕相关函数
function parseASSTime(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return null;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 +
    parseInt(match[3]) + parseInt(match[4]) / 100;
}

// 改进的ASS字幕解析
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

        console.log(`同行检测 - 前字幕左边缘: ${currentLeft}, 屏幕右边: ${startX}, 距离: ${distanceFromRightEdge}, 需要: ${minDistance}`);

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
  const lineHeight = window.innerWidth > 768 ? 20 : 10;
  const textHeight = window.innerWidth > 768 ? 20 : 16;

  // 清理过期的时间记录（超过当前时间10秒的记录）
  for (const [timeKey, lineSet] of displayedSubtitles.entries()) {
    const recordTime = parseFloat(timeKey);
    if (currentTime - recordTime > 10) {
      displayedSubtitles.delete(timeKey);
    }
  }

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
        const containerWidth = overlay.offsetWidth || (window.innerWidth > 768 ? 1200 : window.innerWidth);
        const containerHeight = overlay.offsetHeight || (window.innerWidth > 768 ? 675 : window.innerHeight * 0.6);
        const duration = sub.end - sub.start;

        const baseWidth = window.innerWidth > 768 ? 640 : 360;
        const baseHeight = window.innerWidth > 768 ? 360 : 200;

        const scaleX = containerWidth / baseWidth;
        const scaleY = containerHeight / baseHeight;

        const startX = Math.max(0, Math.min(moveData.x1 * scaleX, containerWidth - 100));
        const startY = Math.max(0, Math.min(moveData.y1 * scaleY, containerHeight - 30));
        const endX = Math.max(-200, Math.min(moveData.x2 * scaleX, containerWidth));
        const endY = Math.max(0, Math.min(moveData.y2 * scaleY, containerHeight - 30));

        div.style.left = `${startX}px`;
        div.style.top = `${startY}px`;

        // 使用JavaScript动画
        const startAnimTime = performance.now();
        const baseDuration = duration * 1000;

        div.dataset.startX = startX;
        div.dataset.endX = endX;
        div.dataset.startY = startY;
        div.dataset.endY = endY;
        div.dataset.startAnimTime = startAnimTime;
        div.dataset.baseDuration = baseDuration;

        function animateMoveSubtitle() {
          if (!div.parentNode) return;

          const now = performance.now();
          const elapsed = (now - parseFloat(div.dataset.startAnimTime)) * playbackRate;
          const progress = Math.min(elapsed / parseFloat(div.dataset.baseDuration), 1);

          const currentX = parseFloat(div.dataset.startX) +
            (parseFloat(div.dataset.endX) - parseFloat(div.dataset.startX)) * progress;
          const currentY = parseFloat(div.dataset.startY) +
            (parseFloat(div.dataset.endY) - parseFloat(div.dataset.startY)) * progress;

          div.style.left = `${currentX}px`;
          div.style.top = `${currentY}px`;

          if (progress < 1) {
            requestAnimationFrame(animateMoveSubtitle);
          }
        }

        requestAnimationFrame(animateMoveSubtitle);
      } else {
        // 默认弹幕处理 - 从右到左移动
        const containerWidth = overlay.offsetWidth || (window.innerWidth > 768 ? 1200 : window.innerWidth);
        const fontSize = window.innerWidth > 768 ? 16 : 14;

        const cleanTextForMeasure = line.replace(/\{[^}]*\}/g, '').trim();
        const textWidth = calculateSubtitleWidth(cleanTextForMeasure, fontSize);

        const totalMoveDistance = containerWidth + textWidth + 50;
        const pixelsPerSecond = window.innerWidth > 768 ? 180 : 150;
        const calculatedDuration = totalMoveDistance / pixelsPerSecond;

        const originalDuration = sub.end - sub.start;
        const minDuration = Math.max(3, originalDuration * 0.8);
        const maxDuration = originalDuration * 2.5;
        const finalDuration = Math.max(minDuration, Math.min(maxDuration, calculatedDuration));

        const moveSpeed = totalMoveDistance / finalDuration;

        const position = findAvailablePosition(currentTime, textWidth, containerWidth, moveSpeed);

        const endTime = currentTime + finalDuration;
        activeSubtitleAreas.set(subId, {
          x: containerWidth,
          y: position.y,
          width: textWidth + padding,
          height: (window.innerWidth > 768 ? 20 : 16) + 10,
          endTime: endTime,
          line: position.line,
          subId: subId
        });

        div.style.fontSize = `${fontSize}px`;
        div.style.left = `${containerWidth}px`;
        div.style.top = `${position.y}px`;

        console.log(`弹幕 "${cleanTextForMeasure.substring(0, 20)}..." - 行: ${position.line}, 起始X: ${containerWidth}, 宽度: ${textWidth}, 时长: ${finalDuration.toFixed(1)}s`);

        // 使用JavaScript动画代替CSS transition
        const startX = containerWidth;
        const endX = -(textWidth + 50);
        const startAnimTime = performance.now();
        const baseDuration = finalDuration * 1000; // 转为毫秒

        // 保存动画信息到元素
        div.dataset.startX = startX;
        div.dataset.endX = endX;
        div.dataset.startAnimTime = startAnimTime;
        div.dataset.baseDuration = baseDuration;

        // 开始动画
        function animateSubtitle() {
          if (!div.parentNode) return; // 元素已移除

          const now = performance.now();
          const elapsed = (now - parseFloat(div.dataset.startAnimTime)) * playbackRate; // 应用播放速度
          const progress = Math.min(elapsed / parseFloat(div.dataset.baseDuration), 1);

          const currentX = parseFloat(div.dataset.startX) +
            (parseFloat(div.dataset.endX) - parseFloat(div.dataset.startX)) * progress;

          div.style.left = `${currentX}px`;

          if (progress < 1) {
            requestAnimationFrame(animateSubtitle);
          }
        }

        requestAnimationFrame(animateSubtitle);

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

// YouTube API相关函数
function onYouTubeIframeAPIReady() {
  console.log('YouTube API ready');
  apiReady = true;
  if (currentVideoId) {
    initializeYouTubePlayer();
  }
}

function onPlayerReady(event) {
  console.log('YouTube player ready');
  // 添加这几行 - 获取初始播放速度
  if (player && typeof player.getPlaybackRate === 'function') {
    playbackRate = player.getPlaybackRate();
  }
  showSuccess();
  startSubtitleUpdate();
}

function onPlayerStateChange(event) {
  console.log('Player state changed:', event.data);
  // 添加这几行 - 监听播放速度变化
  if (player && typeof player.getPlaybackRate === 'function') {
    playbackRate = player.getPlaybackRate();
    console.log('Playback rate:', playbackRate);
  }
  if (event.data === YT.PlayerState.PLAYING) {
    startSubtitleUpdate();
  }
}

function onPlayerError(event) {
  console.error('YouTube player error:', event.data);
  tryFallbackPlayer();
}

// 播放器初始化
function initializeYouTubePlayer() {
  if (!apiReady || !currentVideoId) {
    console.log('API or video ID not ready');
    return;
  }

  try {
    updateLoadingStatus(window.i18n.t('loading.createPlayer', '创建YouTube播放器...'));
    console.log('Creating YouTube player for video:', currentVideoId);

    player = new YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      videoId: currentVideoId,
      playerVars: {
        'playsinline': 1,
        'autoplay': 1,
        'controls': 1,
        'rel': 0,
        'modestbranding': 1,
        'fs': 1,
        'enablejsapi': 1
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });

    loadingTimeout = setTimeout(() => {
      console.log('YouTube player timeout, trying fallback');
      tryFallbackPlayer();
    }, 10000);

  } catch (error) {
    console.error('Error creating YouTube player:', error);
    tryFallbackPlayer();
  }
}

function tryFallbackPlayer() {
  if (usingFallback) return;

  console.log('Using fallback player');
  usingFallback = true;
  updateLoadingStatus(window.i18n.t('loading.fallbackPlayer', '使用备用播放器...'));

  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  const fb = document.getElementById('fallback-iframe');
  fb.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&controls=1&rel=0&modestbranding=1&fs=1`;
  fb.onload = () => {
    showSuccess();
    startBasicSubtitleUpdate();
  };
}

function startBasicSubtitleUpdate() {
  if (subtitles.length === 0) return;

  console.log('Starting basic subtitle update');
  let startTime = Date.now();

  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    displayCurrentSubtitle(elapsed);
  }, 500);
}

function startSubtitleUpdate() {
  if (subtitles.length === 0) return;

  console.log('Starting YouTube subtitle update');
  if (updateInterval) clearInterval(updateInterval);

  updateInterval = setInterval(() => {
    if (player && typeof player.getCurrentTime === 'function') {
      try {
        // 添加这几行 - 持续监听播放速度变化
        if (typeof player.getPlaybackRate === 'function') {
          const newRate = player.getPlaybackRate();
          if (newRate !== playbackRate) {
            console.log(`Playback rate changed: ${playbackRate} -> ${newRate}`);
            playbackRate = newRate;
          }
        }
        const currentTime = player.getCurrentTime();
        displayCurrentSubtitle(currentTime);
      } catch (error) {
        console.error('Error getting current time:', error);
      }
    }
  }, 100);
}

// API加载
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      console.log('YouTube API already loaded');
      apiReady = true;
      resolve();
      return;
    }

    console.log('Loading YouTube API...');
    window.onYouTubeIframeAPIReady = () => {
      console.log('YouTube API callback triggered');
      apiReady = true;
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onload = () => {
      console.log('YouTube API script loaded');
    };
    script.onerror = () => {
      console.error('Failed to load YouTube API script');
      reject(new Error(window.i18n.t('error.ytApiLoadFailed', 'YouTube API脚本加载失败')));
    };
    document.head.appendChild(script);

    setTimeout(() => {
      if (!apiReady) {
        console.error('YouTube API initialization timeout');
        reject(new Error(window.i18n.t('error.ytApiTimeout', 'YouTube API初始化超时')));
      }
    }, 15000);
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

// 页面初始化
async function initializePage() {
  try {
    currentVideoId = getVideoIdFromUrl();
    if (!currentVideoId) {
      throw new Error(window.i18n.t('error.noVideoId', '未提供视频ID'));
    }

    console.log('Initializing page for video:', currentVideoId);
    updateLoadingStatus(window.i18n.t('loading.videoInfo', '加载视频信息...'));

    // 并行加载视频标题和字幕
    const [title] = await Promise.all([
      fetchVideoTitle(currentVideoId),
      loadSubtitles(currentVideoId)
    ]);

    document.getElementById('video-title').textContent = title;
    document.title = `${title} - ${window.i18n.t('player.videoPlay', '视频播放')}`;

    updateLoadingStatus(window.i18n.t('loading.ytApi', '加载YouTube API...'));

    try {
      await loadYouTubeAPI();
      if (apiReady) {
        initializeYouTubePlayer();
      }
    } catch (error) {
      console.error('YouTube API loading failed:', error);
      setTimeout(() => tryFallbackPlayer(), 1000);
    }

  } catch (err) {
    console.error('Page initialization error:', err);
    showError(err.message);
  }
}

// 事件绑定
function bindEvents() {
  // 字幕切换按钮
  document.getElementById('subtitle-toggle').addEventListener('click', toggleSubtitles);

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.key === 's' || e.key === 'S') && subtitles.length > 0) {
      e.preventDefault();
      toggleSubtitles();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      window.location.href = 'index.html';
    }
  });
  initTitleScroll();

  window.addEventListener('resize', () => {
    // 清空当前区域占用，让字幕重新分配
    activeSubtitleAreas.clear();
    console.log('Window resized, cleared subtitle areas');
  });
}

// 新增函数：初始化标题滚动
function initTitleScroll() {
  const titleElement = document.getElementById('video-title');
  let isScrolling = false;
  let startX = 0;
  let scrollLeft = 0;

  // 检查标题是否需要滚动
  function checkScrollable() {
    const isScrollable = titleElement.scrollWidth > titleElement.clientWidth;
    titleElement.classList.toggle('scrollable', isScrollable);
    return isScrollable;
  }

  // 鼠标事件（桌面端）
  titleElement.addEventListener('mousedown', (e) => {
    if (!checkScrollable()) return;

    isScrolling = true;
    titleElement.style.cursor = 'grabbing';
    startX = e.pageX - titleElement.offsetLeft;
    scrollLeft = titleElement.scrollLeft;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isScrolling) return;
    e.preventDefault();

    const x = e.pageX - titleElement.offsetLeft;
    const walk = (x - startX) * 2; // 滚动速度倍数
    titleElement.scrollLeft = scrollLeft - walk;
  });

  document.addEventListener('mouseup', () => {
    if (isScrolling) {
      isScrolling = false;
      titleElement.style.cursor = 'grab';
    }
  });

  // 触摸事件（移动端）
  let touchStartX = 0;
  let touchScrollLeft = 0;

  titleElement.addEventListener('touchstart', (e) => {
    if (!checkScrollable()) return;

    touchStartX = e.touches[0].clientX;
    touchScrollLeft = titleElement.scrollLeft;
  }, { passive: true });

  titleElement.addEventListener('touchmove', (e) => {
    if (!checkScrollable()) return;

    const touchX = e.touches[0].clientX;
    const walk = (touchStartX - touchX) * 1.5; // 滚动速度
    titleElement.scrollLeft = touchScrollLeft + walk;
  }, { passive: true });

  // 监听窗口大小变化，重新检查是否需要滚动
  window.addEventListener('resize', checkScrollable);

  // 初始检查
  setTimeout(checkScrollable, 100);
}

// 清理资源
function cleanupResources() {
  if (updateInterval) clearInterval(updateInterval);
  if (loadingTimeout) clearTimeout(loadingTimeout);
  if (player && typeof player.destroy === 'function') {
    try {
      player.destroy();
    } catch (error) {
      console.error('Error destroying player:', error);
    }
  }
}

// 暴露全局函数供HTML调用
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
window.retryLoad = retryLoad;

// 页面卸载时清理资源
window.addEventListener('beforeunload', cleanupResources);

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing player...');
  // 初始化多语言
  await initializeI18n();
  bindEvents();
  initializePage();
});

// 移动端横屏标题自动隐藏功能
// iPhone Safari 兼容的横屏标题自动隐藏功能
let headerTimeout = null;
let isLandscape = false;

// 检查是否为移动端横屏 - iPhone Safari 兼容版本
function checkLandscapeMode() {
  const isMobile = window.innerWidth <= 926; // iPhone 14 Pro Max 宽度
  const isLandscapeOrientation = window.innerWidth > window.innerHeight;
  const isShortHeight = window.innerHeight <= 428; // iPhone 横屏高度

  return isMobile && isLandscapeOrientation && isShortHeight;
}

// 隐藏标题
function hideHeader() {
  const header = document.getElementById('header');
  if (header && isLandscape) {
    header.classList.remove('show');
  }

  if (headerTimeout) {
    clearTimeout(headerTimeout);
    headerTimeout = null;
  }
}

// 处理屏幕方向变化 - iPhone Safari 特殊处理
function handleOrientationChange() {
  // 延迟检查，确保屏幕尺寸变化完成
  setTimeout(() => {
    const wasLandscape = isLandscape;
    isLandscape = checkLandscapeMode();

    console.log('方向变化检测:', {
      width: window.innerWidth,
      height: window.innerHeight,
      isLandscape: isLandscape,
      wasLandscape: wasLandscape
    });

    const header = document.getElementById('header');

    if (isLandscape && !wasLandscape) {
      // 切换到横屏：隐藏标题
      console.log('切换到横屏模式');
      hideHeader();
    } else if (!isLandscape && wasLandscape) {
      // 切换到竖屏：隐藏标题
      console.log('切换到竖屏模式');
      hideHeader();
    }
  }, 200); // 增加延迟时间，确保iPhone Safari完成方向切换
}