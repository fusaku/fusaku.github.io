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
  showSuccess();
  startSubtitleUpdate();
}

function onPlayerStateChange(event) {
  console.log('Player state changed:', event.data);
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