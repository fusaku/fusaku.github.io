// 初始化多语言
async function initializeI18n() {
  await window.i18n.loadLanguage();
  window.i18n.updatePageTexts();
}

// 页面初始化
async function initializePage() {
  try {
    currentVideoId = getVideoIdFromUrl();
    if (!currentVideoId) {
      throw new Error(window.i18n.t('error.noVideoId', '未提供视频ID'));
    }

    console.log('Initializing page for video:', currentVideoId);

    // 0毫秒立即渲染缓存标题（消除“加载中...”闪烁）
    try {
      const immediateTitle = sessionStorage.getItem('video_title_' + currentVideoId) || localStorage.getItem('video_title_' + currentVideoId);
      if (immediateTitle) {
        document.getElementById('video-title').textContent = immediateTitle;
        document.title = `${immediateTitle} - ${window.i18n.t('player.videoPlay', '视频播放')}`;
      }
    } catch (e) {}

    updateLoadingStatus(window.i18n.t('loading.videoInfo', '加载视频信息...'));

    // 性能优化：将 YouTube API 预加载与页面数据获取并行并发进行
    const ytApiPromise = loadYouTubeAPI().catch(err => {
      console.warn('YouTube API preloading notice:', err);
    });

    // 并行加载视频标题和字幕
    const [title] = await Promise.all([
      fetchVideoTitle(currentVideoId),
      loadSubtitles(currentVideoId),
      initializeSummary(currentVideoId)
    ]);

    document.getElementById('video-title').textContent = title;
    document.title = `${title} - ${window.i18n.t('player.videoPlay', '视频播放')}`;

    // 检查是否需要触发问答门禁（仅桥本阳菜的视频，其他成员不受影响）
    if (window.QuizGate && window.QuizGate.isLocked(currentVideoId, title)) {
      window.QuizGate.showGate(currentVideoId, title, () => {
        startVideoPlayback(ytApiPromise);
      });
      return;
    }

    startVideoPlayback(ytApiPromise);

  } catch (err) {
    console.error('Page initialization error:', err);
    showError(err.message);
  }
}

// 真正加载与启动播放器
async function startVideoPlayback(ytApiPromise) {
  updateLoadingStatus(window.i18n.t('loading.ytApi', '加载YouTube API...'));

  try {
    if (ytApiPromise) {
      await ytApiPromise;
    } else {
      await loadYouTubeAPI();
    }

    if (apiReady) {
      initializeYouTubePlayer();
    } else {
      setTimeout(() => tryFallbackPlayer(), 1000);
    }
  } catch (error) {
    console.error('YouTube API loading failed:', error);
    setTimeout(() => tryFallbackPlayer(), 1000);
  }
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
