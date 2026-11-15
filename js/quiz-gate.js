// 桥本阳菜视频问答门禁 (Quiz Gate)
// 仅针对桥本阳菜的视频：确认是否为粉丝。回答“是”则解锁观看，回答“否”则返回。

const QUIZ_CONFIG = {
  // 目标成员匹配关键词（标题中包含任一即可）
  targetKeywords: ['橋本 陽菜', '橋本陽菜', 'Hashimoto Haruna'],

  // 是否在当前浏览器会话中记住已解锁状态
  rememberSession: true,

  // 问答配置
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
    lockedTitle: {
      'zh-CN': '🔒 粉丝专属确认',
      'ja': '🔒 ファン限定確認',
      'en': '🔒 Fan Confirmation'
    },
    lockedDesc: {
      'zh-CN': '本视频为 橋本 陽菜 专属内容，点击下方按钮确认后即可观看。',
      'ja': 'この動画は 橋本 陽菜 専用コンテンツです。下のボタンから確認後に視聴できます。',
      'en': 'This video is exclusive to Hashimoto Haruna. Confirm to watch.'
    },
    unlockButtonText: {
      'zh-CN': '确认粉丝身份后观看',
      'ja': 'ファン確認をして視聴',
      'en': 'Confirm Fan to Watch'
    },
    modalTitle: {
      'zh-CN': '粉丝确认',
      'ja': 'ファン確認',
      'en': 'Fan Confirmation'
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

// 初始化并展示问答门禁
function showQuizGate(videoId, title, onUnlockedCallback) {
  console.log('Video locked by Quiz Gate:', videoId, title);

  // 隐藏原本的 loading 动画
  const originalLoading = document.getElementById('loading');
  if (originalLoading) {
    originalLoading.classList.add('hidden');
  }

  // 1. 创建视频区域内的“锁定覆盖层”
  createLockedOverlay(onOpenModal);

  // 2. 创建弹窗 DOM
  createQuizModal(onUnlockedSuccess);

  function onOpenModal() {
    const backdrop = document.getElementById('quiz-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('hidden');
      const feedback = document.getElementById('quiz-feedback');
      if (feedback) feedback.className = 'quiz-feedback';
    }
  }

  function onUnlockedSuccess() {
    markVideoUnlockedInSession(videoId);
    lockedStateCache.set(videoId, false);

    // 移除锁定覆盖层与弹窗
    const overlay = document.getElementById('video-locked-overlay');
    if (overlay) overlay.remove();

    const backdrop = document.getElementById('quiz-modal-backdrop');
    if (backdrop) backdrop.remove();

    // 恢复原本的 loading 并启动播放
    if (originalLoading) {
      originalLoading.classList.remove('hidden');
    }

    if (typeof onUnlockedCallback === 'function') {
      onUnlockedCallback();
    }
  }
}

// 在视频容器内创建锁定卡片
function createLockedOverlay(onOpenModal) {
  const existing = document.getElementById('video-locked-overlay');
  if (existing) existing.remove();

  const wrapper = document.querySelector('.video-wrapper');
  if (!wrapper) return;

  const overlay = document.createElement('div');
  overlay.id = 'video-locked-overlay';
  overlay.className = 'video-locked-overlay';

  overlay.innerHTML = `
    <div class="locked-icon-wrapper">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>
    <div class="locked-title">${getQuizI18nText(QUIZ_CONFIG.quiz.lockedTitle)}</div>
    <div class="locked-desc">${getQuizI18nText(QUIZ_CONFIG.quiz.lockedDesc)}</div>
    <button id="btn-unlock-quiz" class="btn-unlock-quiz">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <span>${getQuizI18nText(QUIZ_CONFIG.quiz.unlockButtonText)}</span>
    </button>
  `;

  wrapper.appendChild(overlay);

  document.getElementById('btn-unlock-quiz').addEventListener('click', onOpenModal);
}

// 创建问答弹窗
function createQuizModal(onUnlockedSuccess, onReject) {
  const existing = document.getElementById('quiz-modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'quiz-modal-backdrop';
  backdrop.className = 'quiz-modal-backdrop hidden';

  const yesBtnText = getQuizI18nText(QUIZ_CONFIG.quiz.yesButton.text);
  const yesBtnSubtext = getQuizI18nText(QUIZ_CONFIG.quiz.yesButton.subtext);
  const noBtnText = getQuizI18nText(QUIZ_CONFIG.quiz.noButton.text);
  const noBtnSubtext = getQuizI18nText(QUIZ_CONFIG.quiz.noButton.subtext);

  backdrop.innerHTML = `
    <div class="quiz-modal-card">
      <div class="quiz-modal-header">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>${getQuizI18nText(QUIZ_CONFIG.quiz.modalTitle)}</span>
        </h3>
        <button id="quiz-modal-close" class="quiz-modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="quiz-modal-body">
        <h4 class="quiz-question-text">${getQuizI18nText(QUIZ_CONFIG.quiz.question)}</h4>
        <p class="quiz-sub-desc">${getQuizI18nText(QUIZ_CONFIG.quiz.subDesc)}</p>
        <div class="quiz-choice-group">
          <button id="btn-quiz-no" class="quiz-choice-btn btn-choice-no">
            <span class="choice-icon">❌</span>
            <span class="choice-text">${noBtnText}</span>
            <span class="choice-subtext">${noBtnSubtext}</span>
          </button>
          <button id="btn-quiz-yes" class="quiz-choice-btn btn-choice-yes">
            <span class="choice-icon">💖</span>
            <span class="choice-text">${yesBtnText}</span>
            <span class="choice-subtext">${yesBtnSubtext}</span>
          </button>
        </div>
        <div id="quiz-feedback" class="quiz-feedback"></div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeBtn = document.getElementById('quiz-modal-close');
  const yesBtn = document.getElementById('btn-quiz-yes');
  const noBtn = document.getElementById('btn-quiz-no');
  const feedback = document.getElementById('quiz-feedback');

  function closeModal() {
    backdrop.classList.add('hidden');
  }

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // 监听 ESC 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) {
      closeModal();
    }
  });

  // 点击“是”：验证成功并解锁播放
  yesBtn.addEventListener('click', () => {
    feedback.className = 'quiz-feedback success';
    feedback.textContent = getQuizI18nText(QUIZ_CONFIG.quiz.successText);
    yesBtn.disabled = true;
    noBtn.disabled = true;

    setTimeout(() => {
      onUnlockedSuccess();
    }, 500);
  });

  // 点击“否”：不做处理，关闭弹窗，保持视频锁定无法观看
  noBtn.addEventListener('click', () => {
    feedback.className = 'quiz-feedback reject';
    feedback.textContent = getQuizI18nText(QUIZ_CONFIG.quiz.rejectText);
    yesBtn.disabled = true;
    noBtn.disabled = true;

    setTimeout(() => {
      closeModal();
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
