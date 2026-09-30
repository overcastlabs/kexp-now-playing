import { getAlbumArt, pruneAlbumArt, refreshFailedAlbumImages } from './album-art.js';

const CLASS_HIDDEN = 'hidden';
const CLASS_LOADING = 'is-loading';
const ALBUM_FALLBACK = 'images/album-fallback.svg';
const elements = {
  currentArt: document.querySelector('.current-art'),
  currentTrack: document.getElementById('current-track'),
  defaultSidebar: document.getElementById('default-sidebar'),
  error: document.getElementById('error'),
  history: document.getElementById('history'),
  historyList: document.getElementById('history-list'),
  historySize: document.getElementById('history-size'),
  loader: document.getElementById('loader'),
  refreshIndicator: document.querySelector('.refresh-indicator'),
  settingsPanel: document.querySelector('.settings-section'),
  settingsSummary: document.querySelector('.settings-summary'),
  showHistoryComments: document.getElementById('show-history-comments'),
  sidebarButton: document.querySelector('.sidebar-button'),
  theme: document.getElementById('theme'),
};
const historyNodeCache = new Map();

const richText = (value) => {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML.replace(
    /https?:\/\/[^\s<>"]+/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
};

const formatTime = (dateString) => {
  if (typeof Temporal !== 'undefined') {
    const now = Temporal.Now.plainDateTimeISO().round('second');
    const time = Temporal.PlainDateTime.from(dateString);
    return now.since(time, {
      largestUnit: 'hours',
      smallestUnit: 'minutes',
    }).toLocaleString();
  }

  if (!dateString) return '';
  const date = new Date(dateString);
  const diffMin = Math.floor((Date.now() - date) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 120) return '1h ago';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const yearFromDateString = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !Number.isNaN(date.valueOf()) ? date.getFullYear() : '';
};

const skeletonAlbumArt = className => `
  <div class="album-art skeleton-art surface-secondary img-aspect-square ${className}">
    <img src="${ALBUM_FALLBACK}" alt="" class="img-fullsize img-aspect-square">
  </div>
`;

const skeletonHistoryItem = (index) => `
  <li class="history-item stack" aria-hidden="true">
    <div class="stack stack--horizontal stack--center">
      <div class="history-art">${skeletonAlbumArt('')}</div>
      <div class="history-meta skeleton-copy">
        <span class="skeleton skeleton--history-title skeleton--width-${index % 3}"></span>
        <span class="skeleton skeleton--history-artist"></span>
      </div>
      <span class="skeleton skeleton--history-time"></span>
    </div>
  </li>
`;

const createHistoryNode = (play, showComments) => {
  const item = document.createElement('li');
  item.className = 'history-item stack';
  item.innerHTML = `
    <div class="stack stack--horizontal stack--center">
      <div class="history-art"></div>
      <div class="history-meta">
        <h5 class="text-size-md text-weight-bold text-overflow-ellipsis">${richText(play.song)}</h5>
        ${play.artist ? `<h6 class="text-color-secondary text-size-sm text-overflow-ellipsis">${richText(play.artist)}</h6>` : ''}
      </div>
      <div class="history-time text-color-muted text-size-sm text-style-italic">${formatTime(play.airdate)}</div>
    </div>
    ${showComments && !play.isAirbreak && play.comment ? `<blockquote class="history-comment text-size-sm m-b-sm">${richText(play.comment)}</blockquote>` : ''}
  `;
  item.querySelector('.history-art').appendChild(getAlbumArt(play));
  item.title = `${play.song} - ${play.artist}`;
  return item;
};

elements.refreshIndicator.addEventListener('animationend', (event) => {
  if (event.animationName === 'refresh-feedback') {
    elements.refreshIndicator.classList.remove('is-refreshing');
  }
});

export const applyViewMode = () => {
  const viewMode = new URLSearchParams(window.location.search).get('env');
  if (viewMode) document.documentElement.classList.add(`${viewMode}-view`);
};

export const initializeResponsiveOptions = () => {
  const wideLayout = window.matchMedia('(min-width: 601px)');
  const syncOptions = ({ matches }) => {
    elements.settingsPanel.open = !matches;
    elements.settingsSummary.tabIndex = matches ? 0 : -1;
  };

  syncOptions(wideLayout);
  wideLayout.addEventListener('change', syncOptions);
};

export const syncSettingControls = (settings) => {
  elements.defaultSidebar.checked = settings.defaultView === 'sidebar';
  elements.historySize.value = String(settings.historySize);
  elements.showHistoryComments.checked = settings.showHistoryComments;
  elements.theme.value = settings.theme;
};

export const applyTheme = theme => document.documentElement.dataset.theme = theme;

export const renderInitialSkeleton = (historySize) => {
  elements.currentArt.innerHTML = skeletonAlbumArt('skeleton-art--current');
  elements.currentTrack.classList.add('is-skeleton');
  elements.currentTrack.setAttribute('aria-busy', 'true');
  elements.currentTrack.setAttribute('aria-label', 'Loading current track');
  elements.currentTrack.innerHTML = `
    <span class="skeleton skeleton--track-title" aria-hidden="true"></span>
    <span class="skeleton skeleton--track-artist" aria-hidden="true"></span>
    <span class="skeleton skeleton--track-album" aria-hidden="true"></span>
  `;

  elements.history.classList.add('is-skeleton');
  elements.history.setAttribute('aria-busy', 'true');
  elements.historyList.innerHTML = Array.from(
    { length: historySize },
    (_, index) => skeletonHistoryItem(index)
  ).join('');
  showHistory();
};

export const renderCurrentTrack = (play) => {
  elements.currentTrack.classList.remove('is-skeleton');
  elements.currentTrack.removeAttribute('aria-busy');
  elements.currentTrack.removeAttribute('aria-label');
  elements.currentTrack.innerHTML = `
    <h1 class="text-size-xl text-weight-black">${richText(play.song)}</h1>
    ${play.artist ? `<h2 class="text-color-secondary text-weight-bold">${richText(play.artist)}</h2>` : ''}
    ${play.album ? `<h3 class="text-size-sm text-style-italic text-color-muted text-weight-bold">${richText(play.album)}${play.year ? ` &ndash; ${yearFromDateString(play.year)}` : ''}</h3>` : ''}
    ${play.comment ? `<blockquote class="text-size-sm m-t-sm">${richText(play.comment)}</blockquote>` : ''}
  `;
  elements.currentArt.replaceChildren(getAlbumArt(play));
};

export const renderHistory = (plays, showComments) => {
  if (elements.history.classList.contains('is-skeleton')) {
    elements.history.classList.remove('is-skeleton');
    elements.history.removeAttribute('aria-busy');
    elements.historyList.replaceChildren();
  }

  const nodes = plays.map((play) => {
    if (!historyNodeCache.has(play.id)) {
      historyNodeCache.set(play.id, createHistoryNode(play, showComments));
    }
    const node = historyNodeCache.get(play.id);
    node.querySelector('.history-time').textContent = formatTime(play.airdate);
    return node;
  });

  nodes.forEach((node, index) => {
    if (elements.historyList.children[index] !== node) {
      elements.historyList.insertBefore(node, elements.historyList.children[index] ?? null);
    }
  });
  while (elements.historyList.children.length > nodes.length) {
    elements.historyList.removeChild(elements.historyList.lastChild);
  }
};

export const refreshAlbumImages = plays => refreshFailedAlbumImages(plays);

export const prunePlayNodes = (activeKeys) => {
  pruneAlbumArt(activeKeys);
  for (const key of historyNodeCache.keys()) {
    if (!activeKeys.has(key)) historyNodeCache.delete(key);
  }
};

export const resetHistory = () => {
  historyNodeCache.clear();
  if (!elements.history.classList.contains('is-skeleton')) {
    elements.historyList.replaceChildren();
  }
};

export const setLoading = isLoading => elements.loader.classList.toggle(CLASS_LOADING, isLoading);
export const setErrorVisible = isVisible => elements.error.classList.toggle(CLASS_HIDDEN, !isVisible);
export const showHistory = () => elements.history.classList.remove(CLASS_HIDDEN);

export const stopRefreshCountdown = () => {
  elements.refreshIndicator.classList.remove('is-counting');
};

export const startRefreshCountdown = (duration) => {
  stopRefreshCountdown();
  elements.refreshIndicator.style.setProperty('--refresh-duration', `${duration}ms`);
  void elements.refreshIndicator.offsetWidth;
  elements.refreshIndicator.classList.add('is-counting');
};

export const showRefreshFeedback = () => {
  elements.refreshIndicator.classList.remove('is-refreshing');
  void elements.refreshIndicator.offsetWidth;
  elements.refreshIndicator.classList.add('is-refreshing');
};

export const onRefresh = (listener) => {
  document.querySelectorAll('.refresh').forEach(element => element.addEventListener('click', listener));
};

export const onSettingsInput = (listener) => {
  elements.theme.addEventListener('change', () => listener({
    theme: elements.theme.value,
  }));
  elements.defaultSidebar.addEventListener('change', () => listener({
    defaultView: elements.defaultSidebar.checked ? 'sidebar' : 'popup',
  }));
  elements.historySize.addEventListener('change', () => listener({
    historySize: Number(elements.historySize.value),
  }));
  elements.showHistoryComments.addEventListener('change', () => listener({
    showHistoryComments: elements.showHistoryComments.checked,
  }));
};

export const onOpenSidePanel = listener => elements.sidebarButton?.addEventListener('click', listener);
export const closeView = () => window.close();
