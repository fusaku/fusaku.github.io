// AI总结功能
let summaryLoaded = false;
let summaryContent = '';

// 检查总结文件是否存在
async function checkSummaryExists(videoId) {
  try {
    const response = await fetch(`../summaries/${videoId}.txt`, {
      method: 'HEAD',
      cache: 'no-cache'
    });
    return response.ok;
  } catch (error) {
    console.log('总结文件检查失败:', error);
    return false;
  }
}

// 加载总结内容
async function loadSummaryContent(videoId) {
  try {
    const response = await fetch(`../summaries/${videoId}.txt`);
    if (!response.ok) {
      throw new Error('加载失败');
    }
    return await response.text();
  } catch (error) {
    console.error('总结内容加载失败:', error);
    throw error;
  }
}

// 显示总结按钮
function showSummaryButton() {
  const actionsDiv = document.getElementById('video-actions');
  if (actionsDiv) {
    actionsDiv.style.display = 'block';
  }
}

// 切换总结展开/收起
async function toggleSummary() {
  const button = document.getElementById('summary-button');
  const contentDiv = document.getElementById('summary-content');
  const contentInner = contentDiv.querySelector('.content-inner');

  // 如果已经加载过，直接展开/收起
  if (summaryLoaded) {
    contentDiv.classList.toggle('expanded');
    button.classList.toggle('expanded');
    return;
  }

  // 第一次点击，加载内容
  try {
    // 显示加载状态
    contentInner.innerHTML = `<div class="loading">${window.i18n.t('summary.loading', '加载中...')}</div>`;
    contentDiv.classList.add('expanded');
    button.classList.add('expanded');

    // 加载总结内容
    summaryContent = await loadSummaryContent(currentVideoId);

    // 显示内容
    contentInner.textContent = summaryContent;
    summaryLoaded = true;

  } catch (error) {
    // 显示错误信息
    contentInner.innerHTML = `<div class="error">${window.i18n.t('summary.error', '加载失败')}</div>`;
  }
}

// 初始化总结功能
async function initializeSummary(videoId) {
  if (!videoId) return;

  try {
    const exists = await checkSummaryExists(videoId);
    if (exists) {
      showSummaryButton();
      
      // 绑定点击事件
      const button = document.getElementById('summary-button');
      if (button) {
        button.addEventListener('click', toggleSummary);
      }
    }
  } catch (error) {
    console.error('总结功能初始化失败:', error);
  }
}