'use strict';

const ALBUM_IMAGE_CACHE = 'album-images-v2';
const ALBUM_IMAGE_STAGE_CACHE = 'album-images-stage-v2';
const ALBUM_IMAGE_CACHE_LIMIT = 15;
const ALBUM_IMAGE_CACHE_ORDER_KEY = 'albumImageCacheOrder';

const isArchiveImageRequest = (request) => {
  if (request.method !== 'GET' || request.destination !== 'image') return false;

  try {
    const { hostname } = new URL(request.url);
    return hostname === 'archive.org' || hostname.endsWith('.archive.org');
  } catch {
    return false;
  }
};

const isArchiveImageUri = (uri) => {
  try {
    const { hostname } = new URL(uri);
    return hostname === 'archive.org' || hostname.endsWith('.archive.org');
  } catch {
    return false;
  }
};

const stageAlbumImage = async (request) => {
  const imageCache = await caches.open(ALBUM_IMAGE_CACHE);
  const cachedResponse = await imageCache.match(request.url);
  if (cachedResponse) return cachedResponse;

  // Image requests are no-cors, so even an archive error response is opaque.
  // Stage the response until the popup confirms whether it decoded correctly.
  const response = await fetch(request, { cache: 'reload' });
  const stageCache = await caches.open(ALBUM_IMAGE_STAGE_CACHE);
  await stageCache.put(request.url, response.clone());

  // Bound abandoned staged responses if a popup closes before load/error fires.
  const stagedRequests = await stageCache.keys();
  const excess = stagedRequests.slice(0, -ALBUM_IMAGE_CACHE_LIMIT);
  await Promise.all(excess.map(stagedRequest => stageCache.delete(stagedRequest)));
  return response;
};

self.addEventListener('fetch', (event) => {
  if (isArchiveImageRequest(event.request)) {
    event.respondWith(stageAlbumImage(event.request));
  }
});

let cacheMutation = Promise.resolve();

const updateAlbumImageCache = (action, uri) => {
  cacheMutation = cacheMutation.then(async () => {
    if (!isArchiveImageUri(uri)) return;

    const imageCache = await caches.open(ALBUM_IMAGE_CACHE);
    const stageCache = await caches.open(ALBUM_IMAGE_STAGE_CACHE);
    const stored = await chrome.storage.local.get(ALBUM_IMAGE_CACHE_ORDER_KEY);
    let order = Array.isArray(stored[ALBUM_IMAGE_CACHE_ORDER_KEY])
      ? stored[ALBUM_IMAGE_CACHE_ORDER_KEY]
      : [];

    if (action === 'confirm') {
      const stagedResponse = await stageCache.match(uri);
      if (!stagedResponse) return;

      await imageCache.put(uri, stagedResponse);
      await stageCache.delete(uri);
      order = [uri, ...order.filter(cachedUri => cachedUri !== uri)];

      const expiredUris = order.splice(ALBUM_IMAGE_CACHE_LIMIT);
      await Promise.all(expiredUris.map(expiredUri => imageCache.delete(expiredUri)));
    } else if (action === 'evict') {
      await Promise.all([imageCache.delete(uri), stageCache.delete(uri)]);
      order = order.filter(cachedUri => cachedUri !== uri);
    }

    await chrome.storage.local.set({ [ALBUM_IMAGE_CACHE_ORDER_KEY]: order });
  });

  return cacheMutation;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'album-image-cache') return;

  updateAlbumImageCache(message.action, message.uri)
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  caches.delete('album-images-v1');
});
