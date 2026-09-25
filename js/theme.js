/**
 * 主题管理系统 (Dark / Light Theme Controller)
 * 2026 现代双主题引擎：支持持久化存储与系统偏好自动感知
 */
(function () {
  const STORAGE_KEY = 'kg46_theme';

  function getSystemPreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    // 影音流媒体站点默认推荐深色体验，若系统未指定则优先深色
    return getSystemPreference();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    
    // 更新所有主题切换按钮的状态与提示
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.setAttribute('aria-label', theme === 'dark' ? '切换为浅色模式' : '切换为深色模式');
      btn.setAttribute('title', theme === 'dark' ? '切换为浅色模式' : '切换为深色模式');
    });
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getInitialTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
  }

  // 立即在 head 执行一次，杜绝白屏闪烁 (FOUC)
  const initialTheme = getInitialTheme();
  applyTheme(initialTheme);

  // 监听系统主题变化（若用户未手动锁定）
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // DOM 就绪后绑定页面所有切换按钮
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleTheme();
      });
    });
  });

  window.themeManager = {
    getTheme: () => document.documentElement.getAttribute('data-theme'),
    setTheme,
    toggleTheme
  };
})();
