import { HISTORY_SIZE_OPTIONS, SETTINGS_DEFAULTS, THEME_OPTIONS } from '../config.js';
import { observeStorage, readStorage, writeStorage } from './platform.js';

export const normalizeSettings = (storedSettings) => {
  const parsedHistorySize = Number(storedSettings.historySize);
  return {
    defaultView: storedSettings.defaultView === 'sidebar' ? 'sidebar' : 'popup',
    historySize: HISTORY_SIZE_OPTIONS.includes(parsedHistorySize)
      ? parsedHistorySize
      : SETTINGS_DEFAULTS.historySize,
    showHistoryComments: storedSettings.showHistoryComments === true,
    theme: THEME_OPTIONS.includes(storedSettings.theme)
      ? storedSettings.theme
      : SETTINGS_DEFAULTS.theme,
  };
};

export const loadSettings = async () => normalizeSettings(
  await readStorage(SETTINGS_DEFAULTS)
);

export const saveSettings = values => writeStorage(values);

export const observeSettings = (listener) => {
  observeStorage((changes, areaName) => {
    if (areaName !== 'local') return;

    const changedSettings = {};
    for (const key of Object.keys(SETTINGS_DEFAULTS)) {
      if (changes[key]) changedSettings[key] = changes[key].newValue;
    }

    if (Object.keys(changedSettings).length > 0) listener(changedSettings);
  });
};
