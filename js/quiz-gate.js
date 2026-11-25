// 桥本阳菜视频专属粉丝确认门禁 (Quiz Gate Direct Choice)
// 仅针对桥本阳菜的视频：在视频画面上直接确认是否为粉丝。选择“是”直接解锁播放，选择“否”则保持锁定。

const QUIZ_CONFIG = {
  // 目标成员匹配关键词（标题中包含任一即可）
  targetKeywords: ['橋本 陽菜', '橋本陽菜', 'Hashimoto Haruna'],

  // 是否在当前浏览器会话中记住已解锁状态
  rememberSession: true,

  // 确认配置
  quiz: {
    question: {
      'zh-CN': '你是 橋本 陽菜 的粉丝吗？',
      'ja': '橋本 陽菜のファンですか？',
      'en': 'Are you a fan of Hashimoto Haruna?'
    },
    subDesc: {
      'zh-CN': '※ 回答“是”可观看视频，回答“否”无法观看。',
      'ja': '※「はい」で動画を視聴できます。「いいえ」では視聴できません。',
      'en': '※ "Yes" to watch the video. You cannot watch if "No".'
    },
    yesButton: {
      text: { 'zh-CN': '是', 'ja': 'はい', 'en': 'Yes' },
      subtext: { 'zh-CN': '观看视频', 'ja': '視聴する', 'en': 'Watch' }
    },
    noButton: {
      text: { 'zh-CN': '否', 'ja': 'いいえ', 'en': 'No' },
      subtext: { 'zh-CN': '无法观看', 'ja': '視聴しない', 'en': 'Cannot watch' }
    },
    rejectText: {
      'zh-CN': '非粉丝无法观看本视频。',
      'ja': 'ファン以外の方は動画をご視聴いただけません。',
      'en': 'Only fans can watch this video.'
    },
    successText: {
      'zh-CN': '🎉 欢迎！正在加载视频...',
      'ja': '🎉 ようこそ！動画を読み込んでいます...',
      'en': '🎉 Welcome! Loading video...'
    }
  }
};

// 获取当前语言对应的文本
function getQuizI18nText(textObj) {
  if (!textObj) return '';
  if (typeof textObj === 'string') return textObj;
  const currentLang = (window.i18n && window.i18n.currentLang) || 'ja';
  return textObj[currentLang] || textObj['ja'] || textObj['zh-CN'] || Object.values(textObj)[0];
}

// 检查当前视频是否为桥本阳菜的视频
function isTargetMemberVideo(title) {
  if (!title) return false;
  return QUIZ_CONFIG.targetKeywords.some(keyword => {
    const cleanTitle = title.replace(/\s+/g, '');
    const cleanKeyword = keyword.replace(/\s+/g, '');
    return title.includes(keyword) || cleanTitle.includes(cleanKeyword);
  });
}

// 检查当前视频是否已在会话中解锁
function isVideoUnlockedInSession(videoId) {
  if (!QUIZ_CONFIG.rememberSession) return false;
  try {
    return sessionStorage.getItem(`quiz_unlocked_${videoId}`) === '1';
  } catch (e) {
    return false;
  }
}

// 标记当前视频已解锁
function markVideoUnlockedInSession(videoId) {
  if (!QUIZ_CONFIG.rememberSession) return;
  try {
    sessionStorage.setItem(`quiz_unlocked_${videoId}`, '1');
  } catch (e) {
    console.error('Failed to set sessionStorage:', e);
  }
}

// 缓存每个 videoId 的判定结果，防止后续无 title 调用时丢失状态
const lockedStateCache = new Map();

// 判断当前视频是否需要被锁定
function isQuizLocked(videoId, title) {
  if (!videoId) return false;
  // 如果当前会话已解锁，直接放行
  if (isVideoUnlockedInSession(videoId)) {
    return false;
  }
  if (title) {
    const locked = isTargetMemberVideo(title);
    lockedStateCache.set(videoId, locked);
    return locked;
  }
  if (lockedStateCache.has(videoId)) {
    return lockedStateCache.get(videoId);
  }
  return false;
}

// 初始化并展示直接选择门禁
function showQuizGate(videoId, title, onUnlockedCallback) {
  console.log('Video locked by Quiz Gate (Direct Choice):', videoId, title);

  // 隐藏原本的 loading 动画
  const originalLoading = document.getElementById('loading');
  if (originalLoading) {
    originalLoading.classList.add('hidden');
  }

  // 直接在视频容器内创建确认卡片（无需二次弹窗）
  createDirectChoiceOverlay(videoId, originalLoading, onUnlockedCallback);
}

// 在视频容器内创建内嵌确认卡片
function createDirectChoiceOverlay(videoId, originalLoading, onUnlockedCallback) {
  const existing = document.getElementById('video-locked-overlay');
  if (existing) existing.remove();

  const wrapper = document.querySelector('.video-wrapper');
  if (!wrapper) return;

  const overlay = document.createElement('div');
  overlay.id = 'video-locked-overlay';
  overlay.className = 'video-locked-overlay';

  const yesBtnText = getQuizI18nText(QUIZ_CONFIG.quiz.yesButton.text);
  const yesBtnSubtext = getQuizI18nText(QUIZ_CONFIG.quiz.yesButton.subtext);
  const noBtnText = getQuizI18nText(QUIZ_CONFIG.quiz.noButton.text);
  const noBtnSubtext = getQuizI18nText(QUIZ_CONFIG.quiz.noButton.subtext);

  overlay.innerHTML = `
    <div class="locked-card">
      <div class="locked-icon-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <h3 class="locked-question">${getQuizI18nText(QUIZ_CONFIG.quiz.question)}</h3>
      <p class="locked-desc">${getQuizI18nText(QUIZ_CONFIG.quiz.subDesc)}</p>
      <div class="quiz-choice-group">
        <button id="btn-quiz-no" class="quiz-choice-btn btn-choice-no" type="button">
          <span class="choice-icon">❌</span>
          <span class="choice-text">${noBtnText}</span>
          <span class="choice-subtext">${noBtnSubtext}</span>
        </button>
        <button id="btn-quiz-yes" class="quiz-choice-btn btn-choice-yes" type="button">
          <span class="choice-icon">💖</span>
          <span class="choice-text">${yesBtnText}</span>
          <span class="choice-subtext">${yesBtnSubtext}</span>
        </button>
      </div>
      <div id="quiz-feedback" class="quiz-feedback"></div>
    </div>
  `;

  wrapper.appendChild(overlay);

  const yesBtn = document.getElementById('btn-quiz-yes');
  const noBtn = document.getElementById('btn-quiz-no');
  const feedback = document.getElementById('quiz-feedback');

  // 点击“是”：直接解锁并开始加载播放
  yesBtn.addEventListener('click', () => {
    feedback.className = 'quiz-feedback success';
    feedback.textContent = getQuizI18nText(QUIZ_CONFIG.quiz.successText);
    yesBtn.disabled = true;
    noBtn.disabled = true;

    markVideoUnlockedInSession(videoId);
    lockedStateCache.set(videoId, false);

    setTimeout(() => {
      overlay.remove();
      if (originalLoading) {
        originalLoading.classList.remove('hidden');
      }
      if (typeof onUnlockedCallback === 'function') {
        onUnlockedCallback();
      }
    }, 400);
  });

  // 点击“否”：直接提示无法观看，保持锁定
  noBtn.addEventListener('click', () => {
    feedback.className = 'quiz-feedback reject';
    feedback.textContent = getQuizI18nText(QUIZ_CONFIG.quiz.rejectText);
    yesBtn.disabled = true;
    noBtn.disabled = true;

    setTimeout(() => {
      yesBtn.disabled = false;
      noBtn.disabled = false;
    }, 800);
  });
}

// 导出全局对象
window.QuizGate = {
  isLocked: isQuizLocked,
  showGate: showQuizGate,
  config: QUIZ_CONFIG
};
