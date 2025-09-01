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
