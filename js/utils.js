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

// 获取视频标题（带多级本地缓存与超时防卡死保护）
async function fetchVideoTitle(videoId) {
  if (!videoId) return window.i18n.t('player.videoPlay', '视频播放');

  // 1. 优先从会话缓存或本地持久缓存中获取，0 毫秒秒开
  try {
    const cached = sessionStorage.getItem('video_title_' + videoId) || localStorage.getItem('video_title_' + videoId);
    if (cached) {
      console.log('Video title loaded from cache instantly:', cached);
      return cached;
    }
  } catch (e) {}

  // 2. 网络请求兜底（设置 2.5s 超时，防止第三方 noembed 卡死整个页面）
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.title) {
        try {
          localStorage.setItem('video_title_' + videoId, data.title);
        } catch (e) {}
        return data.title;
      }
    }
  } catch (error) {
    console.warn('Notice: Failed or timed out fetching video title from noembed:', error);
  }

  return window.i18n.t('player.videoPlay', '视频播放');
}