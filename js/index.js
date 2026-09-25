// 首页脚本 - index.js

// 全局变量
let allVideos = [];
const batchSize = 15;
const displayStep = 12;
let filteredVideos = [];
let loadedBatches = 0;
let displayedCount = 0;
let currentFilters = {
  year: null,
  month: null,
  tag: null,
  search: ''
};
let isLoading = false; // 新增：防止重复触发加载


// DOM元素引用
const filterInput = document.getElementById('filter');
const videoGrid = document.getElementById('video-grid');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const mainContent = document.getElementById('main-content');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const menuToggleBtn = document.getElementById('menu-toggle');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const clearFilterContainer = document.getElementById('clear-filter-container');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const activeFilterBadge = document.getElementById('active-filter-badge');
const activeFilterTags = document.getElementById('active-filter-tags');

// 移动端抽屉控制
function openSidebar() {
  if (sidebar) sidebar.classList.add('open');
  if (sidebarOverlay) sidebarOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// 初始化多语言
async function initializeI18n() {
  await window.i18n.loadLanguage();
  window.i18n.updatePageTexts();
}

// 从外部jsonl文件加载视频数据
// 修改后的加载函数
async function loadVideoData() {
  try {
    showLoading();
    // 1. 获取 fetch 的响应流
    const response = await fetch('../videos.jsonl'); 
    if (!response.ok) {
      throw new Error(window.i18n.t('error.dataLoadFailed', '无法加载视频数据'));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let partialLine = ''; 
    allVideos = [];
    let initialRenderDone = false; // 标记是否进行了首屏渲染

    // 2. 循环读取流数据
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码当前块并合并上一块残留的文本
      const chunk = decoder.decode(value, { stream: true });
      const lines = (partialLine + chunk).split('\n');

      // 最后一行可能是不完整的，保留到下一轮处理
      partialLine = lines.pop();

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          try {
            const video = JSON.parse(trimmedLine);
            allVideos.push(video);

            // 优化：当加载到第一批(batchSize)数据时，立刻渲染，提升首屏速度
            if (!initialRenderDone && allVideos.length >= batchSize) {
              filteredVideos = [...allVideos];
              generateCategories(); // 提前生成分类
              resetAndLoad();       // 提前渲染首屏
              initialRenderDone = true;
            }
          } catch (e) {
            console.error('解析JSONL行失败:', e, trimmedLine);
          }
        }
      }
    }

    // 处理最后残留的行
    if (partialLine.trim()) {
      try {
        allVideos.push(JSON.parse(partialLine));
      } catch (e) {
        console.error('解析最后一行失败:', e);
      }
    }

    // 3. 最终同步状态
    filteredVideos = [...allVideos];
    generateCategories(); // 确保分类包含所有数据
    
    // 如果文件太小没触发 batchSize 逻辑，则在这里进行最终渲染
    if (!initialRenderDone) {
      resetAndLoad();
    }
    
    hideLoading();

  } catch (error) {
    console.error('加载视频数据失败:', error);
    hideLoading();
    loadFallbackData();
  }
}

// 备用示例数据
function loadFallbackData() {
  allVideos = [];
  for (let i = 1; i <= 50; i++) {
    allVideos.push({
      id: "dQw4w9WgXcQ",
      title: window.i18n.t('video.example', '示例视频') + " #" + i,
      date: "2025-08-0" + ((i % 5) + 1),
      tags: [window.i18n.t('tags.example', '示例'), i % 3 === 0 ? window.i18n.t('tags.hot', '热门') : window.i18n.t('tags.normal', '普通')],
      description: window.i18n.t('video.exampleDesc', '这是示例视频的描述')
    });
  }
  filteredVideos = [...allVideos];
  generateCategories();
  resetAndLoad();
}

// 动态生成分类导航
function generateCategories() {
  const years = [...new Set(allVideos.map(v => v.date?.substring(0, 4)).filter(Boolean))].sort().reverse();
  const months = [...new Set(allVideos.map(v => v.date?.substring(5, 7)).filter(Boolean))].sort();
  let tags = [...new Set(allVideos.flatMap(v => v.tags || []))].sort();

  // 将「橋本陽菜」强制固定在标签列表第一位
  const primaryTag = '橋本陽菜';
  if (tags.length > 0) {
    tags = [primaryTag, ...tags.filter(t => t !== primaryTag)];
  }

  // 生成年份导航
  const yearList = document.getElementById('yearList');
  yearList.innerHTML = years.map(year =>
    `<li data-filter="${year}" class="${currentFilters.year === year ? 'active' : ''}">${year}${window.i18n.t('date.year', '年')}</li>`
  ).join('');

  // 生成月份导航
  const monthList = document.getElementById('monthList');
  monthList.innerHTML = months.map(month => {
    const monthKey = month.padStart(2, '0');
    const monthName = window.i18n.t(`months.${monthKey}`, `${parseInt(month)}月`);
    return `<li data-filter="${month}" class="${currentFilters.month === month ? 'active' : ''}">${monthName}</li>`;
  }).join('');

  // 生成标签导航
  const tagList = document.getElementById('tagList');
  tagList.innerHTML = tags.map(tag =>
    `<li data-filter="${tag}" class="${currentFilters.tag === tag ? 'active' : ''}">${tag}</li>`
  ).join('');
}

// 创建视频项目元素 (已优化：使用缩略图，移除实时抓取)
function createVideoItem(video) {
  const div = document.createElement('div');
  div.className = 'video-item';

  // 格式化日期
  const dateStr = video.date ? new Date(video.date).toLocaleDateString(window.i18n.currentLang) : '';

  // 获取 YouTube 缩略图 (mqdefault 是中等质量，加载快)
  // 如果你想更清晰，可以用 'hqdefault.jpg'，但 'mqdefault.jpg' 即使有黑边也能保证加载
  const thumbnailUrl = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;

  // 注意：这里把 iframe 换成了 img，并移除了 fetchYouTubeTitle 的调用
  div.innerHTML = `
    <div class="video-thumbnail">
      <img src="${thumbnailUrl}" alt="${video.title}" loading="lazy">
      <div class="play-icon">▶</div>
    </div>
    <div class="video-title" title="${video.title}">${video.title || window.i18n.t('video.untitled', '无标题视频')}</div>
    ${dateStr ? `<div class="video-date">${dateStr}</div>` : ''}
  `;

  // 点击整个卡片跳转
  div.addEventListener('click', () => {
    window.location.href = `player.html?v=${video.id}`;
  });

  return div;
}

// 加载下一批视频数据
function loadNextBatch() {
  // 既然是本地数据筛选，不需要模拟网络延迟，直接返回已完成
  return Promise.resolve().then(() => {
    loadedBatches++;
  });
}

// 显示更多视频
// 显示更多视频 (优化版：使用 DocumentFragment 减少重绘)
function showMoreVideos() {
  const totalLoadedVideos = loadedBatches * batchSize;

  // 检查是否还有数据
  if (displayedCount >= filteredVideos.length) return;
  // 检查是否超过当前批次限制（如果是一次性加载全部则不需要这行，但保留逻辑也没错）
  // 注意：由于我们移除了 setTimeout，逻辑可以简化，只要有数据就渲染

  const nextCount = Math.min(displayedCount + displayStep, filteredVideos.length);

  // 如果没有新数据要显示，直接返回
  if (nextCount <= displayedCount) return;

  // === 核心优化开始 ===
  // 创建一个文档片段，把所有新卡片先放到这里
  const fragment = document.createDocumentFragment();

  for (let i = displayedCount; i < nextCount; i++) {
    fragment.appendChild(createVideoItem(filteredVideos[i]));
  }

  // 一次性将所有卡片插入页面，只触发一次重绘
  videoGrid.appendChild(fragment);
  // === 核心优化结束 ===

  displayedCount = nextCount;
}

// 重置并加载
function resetAndLoad() {
  videoGrid.innerHTML = "";
  loadedBatches = 0;
  displayedCount = 0;

  if (filteredVideos.length === 0) {
    videoGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px; font-size: 16px;">${window.i18n.t('search.noResults', '没有找到相关视频')}</div>`;
    return;
  }

  loadNextBatch().then(() => {
    showMoreVideos();
  });
}

// 显示加载状态
function showLoading() {
  loading.style.display = 'block';
  errorDiv.style.display = 'none';
}

// 隐藏加载状态
function hideLoading() {
  loading.style.display = 'none';
}

// 显示错误状态
function showError(message) {
  const errorText = message || window.i18n.t('error.dataLoadFailed', '数据加载失败，请稍后重试');
  errorDiv.style.display = 'block';
  hideLoading();
}

// 更新筛选状态UI（徽章、标签条、清除按钮）
function updateFilterUI() {
  const activeFilters = [];
  if (currentFilters.year) {
    activeFilters.push({ type: 'year', label: `${currentFilters.year}${window.i18n.t('date.year', '年')}` });
  }
  if (currentFilters.month) {
    const monthKey = currentFilters.month.padStart(2, '0');
    const monthName = window.i18n.t(`months.${monthKey}`, `${parseInt(currentFilters.month)}月`);
    activeFilters.push({ type: 'month', label: monthName });
  }
  if (currentFilters.tag) {
    activeFilters.push({ type: 'tag', label: currentFilters.tag });
  }

  // 手机端分类按钮上的数字徽章
  if (activeFilterBadge) {
    if (activeFilters.length > 0) {
      activeFilterBadge.textContent = activeFilters.length;
      activeFilterBadge.style.display = 'inline-block';
    } else {
      activeFilterBadge.style.display = 'none';
    }
  }

  // 侧边栏内的清除筛选按钮
  if (clearFilterContainer) {
    clearFilterContainer.style.display = (activeFilters.length > 0 || currentFilters.search) ? 'block' : 'none';
  }

  // 顶部筛选胶囊条
  if (activeFilterTags) {
    if (activeFilters.length > 0) {
      activeFilterTags.style.display = 'flex';
      activeFilterTags.innerHTML = activeFilters.map(f => `
        <span class="active-tag-chip">
          <span>${f.label}</span>
          <span class="remove-chip" data-type="${f.type}">✕</span>
        </span>
      `).join('');
    } else {
      activeFilterTags.style.display = 'none';
      activeFilterTags.innerHTML = '';
    }
  }
}

// 清除导航栏激活状态
function clearActiveNav() {
  document.querySelectorAll('#sidebar li.active').forEach(li => li.classList.remove('active'));
  currentFilters = {
    year: null,
    month: null,
    tag: null,
    search: ''
  };
  filterInput.value = '';
  filteredVideos = [...allVideos];
  updateFilterUI();
  resetAndLoad();
}

// 分类点击处理
function onCategoryClick(type, value, element) {
  // 如果点击已激活的项目，则取消该筛选
  if (element.classList.contains('active')) {
    currentFilters[type] = null;
    element.classList.remove('active');
  } else {
    // 否则设置新的筛选条件
    currentFilters[type] = value;
    // 清除同类型的其他激活状态
    document.querySelectorAll(`#${type}List li.active`).forEach(li => li.classList.remove('active'));
    element.classList.add('active');
  }

  applyFilters();

  // 移动端选择后自动收起抽屉
  if (window.innerWidth <= 768) {
    setTimeout(closeSidebar, 200);
  }
}

// 新增函数：应用所有筛选条件
function applyFilters() {
  filteredVideos = allVideos.filter(video => {
    // 年份筛选
    if (currentFilters.year && (!video.date || !video.date.startsWith(currentFilters.year))) {
      return false;
    }

    // 月份筛选 (从 YYYY-MM-DD 直接截取，避免 new Date 在西半球时区产生一天偏差)
    if (currentFilters.month) {
      if (!video.date || video.date.length < 7) return false;
      const vMonth = parseInt(video.date.substring(5, 7), 10);
      if (vMonth !== parseInt(currentFilters.month, 10)) {
        return false;
      }
    }

    // 标签筛选
    if (currentFilters.tag && (!video.tags || !video.tags.includes(currentFilters.tag))) {
      return false;
    }

    // 搜索文本筛选
    if (currentFilters.search) {
      const searchText = currentFilters.search.toLowerCase();
      const matchTitle = (video.title && video.title.toLowerCase().includes(searchText)) ||
        (video.displayTitle && video.displayTitle.toLowerCase().includes(searchText));
      const matchDesc = video.description && video.description.toLowerCase().includes(searchText);
      const matchTags = video.tags && video.tags.some(tag => tag.toLowerCase().includes(searchText));

      if (!matchTitle && !matchDesc && !matchTags) {
        return false;
      }
    }

    return true;
  });

  updateFilterUI();
  resetAndLoad();
}

// 搜索过滤
function handleSearch() {
  currentFilters.search = filterInput.value.trim();
  applyFilters();
}

// 滚动加载处理
function handleScroll() {
  if (isLoading) return; // 如果正在加载，直接退出，防止重复触发

  // 兼容桌面端内部容器滚动与移动端整页自然滚动
  const isWindowScroll = window.innerWidth <= 768;
  const scrollTop = isWindowScroll ? (window.pageYOffset || document.documentElement.scrollTop) : mainContent.scrollTop;
  const scrollHeight = isWindowScroll ? document.documentElement.scrollHeight : mainContent.scrollHeight;
  const clientHeight = isWindowScroll ? window.innerHeight : mainContent.clientHeight;

  // 这里的 400 是预加载距离，让用户还没到底就开始加载，体验更流畅
  if (scrollTop + clientHeight >= scrollHeight - 400) {

    // 如果还有未显示的视频
    if (displayedCount < filteredVideos.length) {
      isLoading = true; // 上锁

      loadNextBatch().then(() => {
        showMoreVideos();
        isLoading = false; // 解锁
      });
    }
  }
}

function throttle(func, limit) {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

// 事件绑定
function bindEvents() {
  // 搜索框事件
  filterInput.addEventListener('input', handleSearch);

  // 分类导航事件
  document.getElementById('yearList').addEventListener('click', e => {
    if (e.target.tagName === 'LI') {
      onCategoryClick('year', e.target.dataset.filter, e.target);
    }
  });

  document.getElementById('monthList').addEventListener('click', e => {
    if (e.target.tagName === 'LI') {
      onCategoryClick('month', e.target.dataset.filter, e.target);
    }
  });

  document.getElementById('tagList').addEventListener('click', e => {
    if (e.target.tagName === 'LI') {
      onCategoryClick('tag', e.target.dataset.filter, e.target);
    }
  });

  // 滚动加载事件 (桌面端与移动端双向监听)
  mainContent.addEventListener('scroll', throttle(handleScroll, 200));
  window.addEventListener('scroll', throttle(handleScroll, 200));

  // 移动端抽屉导航控制
  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', openSidebar);
  }
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      clearActiveNav();
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  }

  // 顶部筛选标签点击移除
  if (activeFilterTags) {
    activeFilterTags.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-chip');
      if (removeBtn) {
        const type = removeBtn.dataset.type;
        currentFilters[type] = null;
        document.querySelectorAll(`#${type}List li.active`).forEach(li => li.classList.remove('active'));
        applyFilters();
      }
    });
  }

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
      } else if (filterInput.value) {
        filterInput.value = '';
        handleSearch();
      }
    } else if (e.key === '/' && e.target !== filterInput) {
      e.preventDefault();
      filterInput.focus();
    }
  });
}

// 初始化应用
async function initializeApp() {
  console.log('初始化首页应用...');

  // 新增：初始化多语言
  await initializeI18n();

  // 绑定事件
  bindEvents();

  // 加载视频数据
  loadVideoData();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializeApp);