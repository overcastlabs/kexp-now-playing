'use strict';

globalThis.APP_CONFIG = Object.freeze({
  ALBUM_IMAGE_CACHE_BUFFER: 5,
  HISTORY_SIZE_OPTIONS: Object.freeze([10, 20, 40]),
  POPUP_PATH: 'app.html?env=popup',
  SETTINGS_DEFAULTS: Object.freeze({
    defaultView: 'popup',
    historySize: 20,
    showHistoryComments: false,
  }),
});
