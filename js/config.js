// 全局变量
let currentVideoId = '';
let subtitles = [];
let subtitlesVisible = true;
let player = null;
let updateInterval = null;
let loadingTimeout = null;
let usingFallback = false;
let apiReady = false;
// 新增：字幕行占用管理和移动计算
let activeSubtitleAreas = new Map(); // Map<subId, {x, y, width, height, endTime}>
// 新增：跟踪每行字幕的移动速度
let lineMoveSpeeds = new Map(); // Map<line, speed>

// 用于跟踪已显示的字幕，避免重复创建
let activeSubtitles = new Set();
let subtitleElements = new Map(); // 存储字幕元素的引用
let displayedSubtitles = new Map(); // 记录每个时间点已显示过的字幕行：Map<时间戳, Set<字幕索引>>
let processedSubtitles = new Set(); // 跟踪已经处理过的字幕，防止重复

// 移动端横屏标题自动隐藏功能
// iPhone Safari 兼容的横屏标题自动隐藏功能
let headerTimeout = null;
let isLandscape = false;