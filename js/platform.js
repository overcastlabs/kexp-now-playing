const chromeApi = globalThis.chrome;
const hasExtensionStorage = Boolean(
  chromeApi?.storage?.local?.get &&
  chromeApi?.storage?.local?.set &&
  chromeApi?.storage?.onChanged?.addListener
);
export const isExtensionContext = hasExtensionStorage;
const previewStorageKey = 'kexp-now-playing-settings';
const previewStorageListeners = new Set();
let previewSettings = {};

if (!hasExtensionStorage) {
  try {
    const storedPreviewSettings = JSON.parse(localStorage.getItem(previewStorageKey));
    if (
      storedPreviewSettings &&
      typeof storedPreviewSettings === 'object' &&
      !Array.isArray(storedPreviewSettings)
    ) {
      previewSettings = storedPreviewSettings;
    }
  } catch {
    // Some browser previews disable localStorage. Settings will remain in memory.
  }
}

const previewStorage = {
  async get(defaults = {}) {
    return { ...defaults, ...previewSettings };
  },

  async set(values) {
    const changes = {};

    for (const [key, newValue] of Object.entries(values)) {
      const oldValue = previewSettings[key];
      if (!Object.is(oldValue, newValue)) changes[key] = { oldValue, newValue };
    }

    previewSettings = { ...previewSettings, ...values };
    try {
      localStorage.setItem(previewStorageKey, JSON.stringify(previewSettings));
    } catch {
      // Retain the in-memory copy when persistence is unavailable.
    }

    if (Object.keys(changes).length > 0) {
      previewStorageListeners.forEach(listener => listener(changes, 'local'));
    }
  },
};

const storage = hasExtensionStorage ? chromeApi.storage.local : previewStorage;
const storageChanges = hasExtensionStorage ? chromeApi.storage.onChanged : {
  addListener(listener) {
    previewStorageListeners.add(listener);
  },
};

export const readStorage = defaults => storage.get(defaults);
export const writeStorage = values => storage.set(values);
export const observeStorage = listener => storageChanges.addListener(listener);

export const sendExtensionMessage = chromeApi?.runtime?.sendMessage
  ? message => chromeApi.runtime.sendMessage(message)
  : async () => {};

export const openSidePanel = chromeApi?.sidePanel?.open && chromeApi?.windows
  ? () => chromeApi.sidePanel.open({ windowId: chromeApi.windows.WINDOW_ID_CURRENT })
  : null;
