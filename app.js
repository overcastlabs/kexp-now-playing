import { SETTINGS_DEFAULTS } from './config.js';
import { openSidePanel } from './js/platform.js';
import { fetchPlaylist } from './js/playlist.js';
import {
  loadSettings,
  normalizeSettings,
  observeSettings,
  saveSettings,
} from './js/settings.js';
import * as view from './js/view.js';

const REFRESH_INTERVAL = 6e4;
const LOADING_TRACK = Object.freeze({
  id: '-1',
  song: 'Loading',
  artist: '',
  image_uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
});

let settings = { ...SETTINGS_DEFAULTS };
let cachedKeys = null;
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
    const newKeys = plays.map(play => play.id);
    const currentChanged = !cachedKeys || newKeys[0] !== cachedKeys[0];

    if (currentChanged) view.renderCurrentTrack(plays[0]);
    view.renderHistory(plays.slice(1), settings.showHistoryComments);
    view.refreshAlbumImages(plays);
    view.prunePlayNodes(new Set(newKeys));
    cachedKeys = newKeys;

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

view.applyViewMode();
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
  settings = normalizeSettings({ ...settings, ...changedSettings });
  view.syncSettingControls(settings);

  if (
    settings.historySize !== previousSettings.historySize ||
    settings.showHistoryComments !== previousSettings.showHistoryComments
  ) {
    cachedKeys = null;
    view.resetHistory();
    load();
  }
});

const initialize = async () => {
  settings = await loadSettings();
  view.syncSettingControls(settings);
  view.renderCurrentTrack(LOADING_TRACK);
  load();
};

initialize();
