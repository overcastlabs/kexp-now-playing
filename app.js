import { SETTINGS_DEFAULTS } from './config.js';
import { isExtensionContext, openSidePanel } from './js/platform.js';
import { fetchPlaylist } from './js/playlist.js';
import {
  loadSettings,
  normalizeSettings,
  observeSettings,
  saveSettings,
} from './js/settings.js';
import * as view from './js/view.js';

const REFRESH_INTERVAL = 6e4;

let settings = { ...SETTINGS_DEFAULTS };
let cachedKeys = null;
let cachedPlays = null;
let refreshTimer = null;
let activeRequest = null;

const scheduleRefresh = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(load, REFRESH_INTERVAL);
  view.startRefreshCountdown(REFRESH_INTERVAL);
};

async function load() {
  clearTimeout(refreshTimer);
  view.stopRefreshCountdown();
  view.showRefreshFeedback();
  view.setLoading(true);

  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;

  try {
    const plays = await fetchPlaylist({
      historySize: settings.historySize,
      signal: request.signal,
    });
    const visiblePlays = plays.slice(0, settings.historySize + 1);
    const newKeys = visiblePlays.map(play => play.id);
    const currentChanged = !cachedKeys || newKeys[0] !== cachedKeys[0];

    if (currentChanged) view.renderCurrentTrack(visiblePlays[0]);
    view.renderHistory(visiblePlays.slice(1), settings.showHistoryComments);
    view.refreshAlbumImages(visiblePlays);
    view.prunePlayNodes(new Set(newKeys));
    cachedKeys = newKeys;
    cachedPlays = visiblePlays;

    view.showHistory();
    view.setErrorVisible(false);
  } catch (error) {
    if (error.name === 'AbortError') return;
    view.setErrorVisible(true);
  } finally {
    if (activeRequest === request) {
      activeRequest = null;
      view.setLoading(false);
      scheduleRefresh();
    }
  }
}

view.applyViewMode(isExtensionContext);
view.initializeResponsiveOptions();
view.onRefresh(load);
view.onSettingsInput(saveSettings);
view.onOpenSidePanel(() => {
  if (!openSidePanel) return;

  openSidePanel()
    .then(view.closeView)
    .catch(error => console.error('Unable to open the side panel', error));
});

observeSettings((changedSettings) => {
  const previousSettings = settings;
  const hasLoadedPlaylist = cachedPlays !== null;
  settings = normalizeSettings({ ...settings, ...changedSettings });
  view.syncSettingControls(settings);
  view.applyTheme(settings.theme);

  if (settings.showHistoryComments !== previousSettings.showHistoryComments) {
    view.setHistoryCommentsVisible(settings.showHistoryComments);
  }

  if (settings.historySize !== previousSettings.historySize) {
    if (settings.historySize > previousSettings.historySize) {
      view.renderHistorySkeleton(settings.historySize);
      load();
    } else if (hasLoadedPlaylist) {
      const visiblePlays = cachedPlays.slice(0, settings.historySize + 1);
      const visibleKeys = visiblePlays.map(play => play.id);
      view.renderHistory(visiblePlays.slice(1), settings.showHistoryComments);
      view.prunePlayNodes(new Set(visibleKeys));
      cachedKeys = visibleKeys;
      cachedPlays = visiblePlays;
    } else {
      view.renderHistorySkeleton(settings.historySize);
    }
  }
});

const initialize = async () => {
  settings = await loadSettings();
  view.applyTheme(settings.theme);
  view.syncSettingControls(settings);
  view.renderInitialSkeleton(settings.historySize);
  load();
};

initialize();
