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