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