// 字幕相关函数

// ------------------------------------
// !!! 从 player.js 移动过来的全局变量 !!!
// ------------------------------------
let activeSubtitleAreas = new Map(); // Map<subId, {x, y, width, height, endTime}>
let lineMoveSpeeds = new Map(); // Map<line, speed>

// 用于跟踪已显示的字幕，避免重复创建
let activeSubtitles = new Set();
let subtitleElements = new Map(); // 存储字幕元素的引用
let displayedSubtitles = new Map(); // 记录每个时间点已显示过的字幕行：Map<时间戳, Set<字幕索引>>
let processedSubtitles = new Set(); // 跟踪已经处理过的字幕，防止重复
let playbackState = { rate: 1.0 }; // 使用对象,确保引用传递


function parseASSTime(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return null;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 +
    parseInt(match[3]) + parseInt(match[4]) / 100;
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

  return subtitleLines;
}

function extractASSMove(text) {
  const moveMatch = text.match(/\\move\((\d+),(\d+),(\d+),(\d+),?(\d*),?(\d*)\)/);
  if (moveMatch) {
    const [_, x1, y1, x2, y2, t1 = 0, t2 = 0] = moveMatch.map(Number);
    return {
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      t1: t1,
      t2: t2
    };
  }
  return null;
}

function removeASSTags(text) {
  // 移除所有 {} 标签
  return text.replace(/\{[^}]+\}/g, '');
}


async function fetchSubtitles(videoId) {
  const apiUrl = `https://api.example.com/subtitles?v=${videoId}`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.status === 'ok' && data.subtitles) {
      // 假设 data.subtitles 包含 ASS 格式的字幕内容
      window.subtitles = parseASSSubtitles(data.subtitles);
      console.log(`成功加载 ${window.subtitles.length} 条字幕。`);
    } else {
      console.log('未找到字幕或数据格式不正确。');
      window.subtitles = [];
    }

  } catch (error) {
    console.error('获取字幕失败:', error);
    window.subtitles = [];
  }
  
  if (window.subtitles.length > 0) {
    const btn = document.getElementById('subtitle-toggle');
    if (btn) btn.classList.remove('disabled');
  }
}

function initializeSubtitles() {
  const videoId = window.currentVideoId; // 假设 currentVideoId 是全局变量
  if (videoId) {
    fetchSubtitles(videoId);
  }
}

// ------------------------------------
// !!! 从 player.js 移动过来的函数逻辑 !!!
// ------------------------------------
function displayCurrentSubtitle(currentTime) {
  if (!window.subtitlesVisible || !window.subtitles || window.subtitles.length === 0) {
    // 隐藏所有字幕元素
    document.querySelectorAll('.subtitle-container .subtitle').forEach(el => el.remove());
    activeSubtitles.clear();
    subtitleElements.clear();
    activeSubtitleAreas.clear();
    lineMoveSpeeds.clear();
    return;
  }

  const container = document.querySelector('.subtitle-container');
  if (!container) return;

  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;
  const subtitlesToKeep = new Set();
  
  // ------------------------------------
  // !!! 从 player.js 移动过来的速度监听 !!!
  // ------------------------------------
  if (window.player && typeof window.player.getPlaybackRate === 'function') {
      const newRate = window.player.getPlaybackRate();
      if (newRate !== playbackState.rate) {
          console.log(`🎬 播放速度变化: ${playbackState.rate} -> ${newRate}`);
          playbackState.rate = newRate;
      }
  }
  // ------------------------------------

  window.subtitles.forEach((sub, index) => {
    const subId = `sub-${index}`;
    const isCurrentlyActive = currentTime >= sub.start && currentTime <= sub.end;

    if (isCurrentlyActive) {
      subtitlesToKeep.add(subId);

      // 如果字幕已存在，则保持
      if (activeSubtitles.has(subId)) {
        return;
      }

      // 检查是否已处理过，防止快进/快退后重复处理
      if (processedSubtitles.has(subId)) {
          // 如果字幕已存在于 DOM 但不在 activeSubtitles 中 (例如被手动移除), 
          // 并且是移动或默认弹幕，我们需要重新触发其动画以处理变速。
          const existingDiv = subtitleElements.get(subId);
          if (existingDiv && existingDiv.dataset.startAnimTime && existingDiv.parentNode) {
              const startAnimTime = parseFloat(existingDiv.dataset.startAnimTime);
              const baseDuration = parseFloat(existingDiv.dataset.baseDuration);
              
              if (baseDuration > 0) {
                  // 重新计算当前动画进度
                  const now = performance.now();
                  const elapsed = (now - startAnimTime) * playbackState.rate;
                  const progress = Math.min(elapsed / baseDuration, 1);
                  
                  // 如果动画未完成，且位置不对，则重新启动
                  if (progress < 1) {
                      // 重新启动 move 动画
                      if (existingDiv.dataset.endY) {
                          function animateMoveSubtitle() {
                              if (!existingDiv.parentNode) return;
                              const now = performance.now();
                              const elapsed = (now - startAnimTime) * playbackState.rate;
                              const progress = Math.min(elapsed / baseDuration, 1);

                              const currentX = parseFloat(existingDiv.dataset.startX) +
                                  (parseFloat(existingDiv.dataset.endX) - parseFloat(existingDiv.dataset.startX)) * progress;
                              const currentY = parseFloat(existingDiv.dataset.startY) +
                                  (parseFloat(existingDiv.dataset.endY) - parseFloat(existingDiv.dataset.startY)) * progress;

                              existingDiv.style.left = `${currentX}px`;
                              existingDiv.style.top = `${currentY}px`;

                              if (progress < 1) {
                                  requestAnimationFrame(animateMoveSubtitle);
                              }
                          }
                          requestAnimationFrame(animateMoveSubtitle);
                      } else {
                          // 重新启动默认弹幕动画
                          function animateSubtitle() {
                              if (!existingDiv.parentNode) return;

                              const now = performance.now();
                              const elapsed = (now - startAnimTime) * playbackState.rate;
                              const progress = Math.min(elapsed / baseDuration, 1);

                              const currentX = parseFloat(existingDiv.dataset.startX) +
                                  (parseFloat(existingDiv.dataset.endX) - parseFloat(existingDiv.dataset.startX)) * progress;

                              existingDiv.style.left = `${currentX}px`;

                              if (progress < 1) {
                                  requestAnimationFrame(animateSubtitle);
                              }
                          }
                          requestAnimationFrame(animateSubtitle);
                      }
                  }
              }

              // 重新加入 activeSubtitles 集合
              activeSubtitles.add(subId);
          }
          return;
      }

      // 创建新的字幕元素
      const div = document.createElement('div');
      div.className = 'subtitle ' + sub.style.toLowerCase();
      div.textContent = removeASSTags(sub.text);
      div.dataset.subId = subId;
      div.dataset.endTime = sub.end;
      div.dataset.index = index;
      
      // 添加到 DOM
      container.appendChild(div);
      
      const textWidth = div.offsetWidth;

      const moveData = extractASSMove(sub.text);
      const duration = sub.end - sub.start;

      if (moveData) {
        // ASS \move 标签动画处理
        let { x1, y1, x2, y2, t1, t2 } = moveData;
        
        // 转换坐标为像素
        const startX = x1;
        const startY = y1;
        const endX = x2;
        const endY = y2;
        const animDuration = (t2 > t1) ? (t2 - t1) / 1000 : duration;

        div.style.left = `${startX}px`;
        div.style.top = `${startY}px`;
        div.style.position = 'absolute';
        
        // --- 核心改动：使用 requestAnimationFrame 实现动画 (从 player.js 移入) ---
        const startAnimTime = performance.now();
        const baseDuration = animDuration * 1000;

        div.dataset.startX = startX;
        div.dataset.endX = endX;
        div.dataset.startY = startY;
        div.dataset.endY = endY;
        div.dataset.startAnimTime = startAnimTime;
        div.dataset.baseDuration = baseDuration;

        function animateMoveSubtitle() {
          if (!div.parentNode) return;

          const now = performance.now();
          // 关键：elapsed 乘以 playbackState.rate
          const elapsed = (now - parseFloat(div.dataset.startAnimTime)) * playbackState.rate;
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
        // -------------------------------------------------------------------
        
        // 将字幕添加到活跃区域，不占用行
        activeSubtitleAreas.set(subId, {
            x: startX,
            y: startY,
            width: textWidth,
            height: div.offsetHeight,
            endTime: sub.end
        });

      } else {
        // 默认弹幕：从右到左滚动
        
        // 1. 计算弹幕应该在哪一行
        const lineHeight = 30; // 假设每行高度
        let selectedLine = 0;
        let finalSpeed = 0;

        // 尝试找到最慢的可用行，或者新行
        let bestLine = -1;
        let slowestSpeed = Infinity;

        // 检查已有行
        for (const [line, speed] of lineMoveSpeeds.entries()) {
          if (speed < slowestSpeed) {
            slowestSpeed = speed;
            bestLine = line;
          }
        }
        
        // 如果找到行，并且速度低于某一阈值（例如 200px/s），则使用新行
        if (bestLine === -1 || slowestSpeed > 200) {
          // 寻找一个全新的行
          let newLine = 0;
          while (lineMoveSpeeds.has(newLine)) {
            newLine++;
          }
          selectedLine = newLine;
          finalSpeed = (containerWidth + textWidth) / duration;
        } else {
          selectedLine = bestLine;
          finalSpeed = slowestSpeed;
        }

        // 更新行速度
        lineMoveSpeeds.set(selectedLine, finalSpeed);

        const finalDuration = (containerWidth + textWidth + 50) / finalSpeed; // 加上 50px 缓冲

        const position = selectedLine * lineHeight;
        div.style.top = `${position}px`;
        div.style.right = '0'; // 从右侧开始

        // --- 核心改动：使用 requestAnimationFrame 实现动画 (从 player.js 移入) ---
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
          if (!div.parentNode) return;

          const now = performance.now();
          // 关键：elapsed 乘以 playbackState.rate
          const elapsed = (now - parseFloat(div.dataset.startAnimTime)) * playbackState.rate;
          const progress = Math.min(elapsed / parseFloat(div.dataset.baseDuration), 1);

          const currentX = parseFloat(div.dataset.startX) +
            (parseFloat(div.dataset.endX) - parseFloat(div.dataset.startX)) * progress;

          div.style.left = `${currentX}px`;

          if (progress < 1) {
            requestAnimationFrame(animateSubtitle);
          }
        }

        requestAnimationFrame(animateSubtitle);
        // -------------------------------------------------------------------

        // 将字幕添加到活跃区域，并标记占用的行
        activeSubtitleAreas.set(subId, {
            x: containerWidth,
            y: position,
            width: textWidth,
            height: div.offsetHeight,
            endTime: sub.end,
            line: selectedLine // 记录行号
        });
      }

      // 记录为活跃和已处理
      activeSubtitles.add(subId);
      subtitleElements.set(subId, div);
      processedSubtitles.add(subId);

    }
  });

  // 移除不再活跃的字幕
  const subtitlesToRemove = [];
  subtitleElements.forEach((element, subId) => {
    if (!subtitlesToKeep.has(subId)) {
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

  // ------------------------------------------------------
  // !!! 从 player.js 移动过来的清理逻辑 (确保和动画逻辑同步) !!!
  // ------------------------------------------------------
  subtitlesToRemove.forEach(subId => {
    activeSubtitles.delete(subId);
    subtitleElements.delete(subId);
    processedSubtitles.delete(subId); // 清理已处理记录，允许重新播放

    // 清理区域记录
    activeSubtitleAreas.delete(subId);
    // 清理速度记录
    // 这里的 area 应该是旧的 area 记录，需要重新从 activeSubtitleAreas 中获取或使用一个临时变量
    // 为了安全，我们检查 lineMoveSpeeds
    const area = activeSubtitleAreas.get(subId); // 此时 area 应该已经被 delete 了，需要重写检查逻辑
    
    // 重新检查哪一行可以被释放：遍历所有剩余的 activeSubtitleAreas
    let remainingLines = new Set();
    activeSubtitleAreas.forEach(area => {
        if (area.line !== undefined) {
            remainingLines.add(area.line);
        }
    });

    // 移除所有不再被占用的行
    for (const line of lineMoveSpeeds.keys()) {
        if (!remainingLines.has(line)) {
            lineMoveSpeeds.delete(line);
        }
    }
    // ------------------------------------------------------
  });
}

// 字幕切换
function toggleSubtitles() {
  const btn = document.getElementById('subtitle-toggle');
  if (btn.classList.contains('disabled') || window.subtitles.length === 0) return;
  // 切换字幕显示状态
  window.subtitlesVisible = !window.subtitlesVisible;

  btn.textContent = window.subtitlesVisible ?
    window.i18n.t('subtitles_on') :
    window.i18n.t('subtitles_off');

  // 如果关闭了字幕，则清除所有显示的字幕
  if (!window.subtitlesVisible) {
    document.querySelectorAll('.subtitle-container .subtitle').forEach(el => el.remove());
    activeSubtitles.clear();
    subtitleElements.clear();
  }
}