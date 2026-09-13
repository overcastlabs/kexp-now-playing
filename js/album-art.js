import { sendExtensionMessage } from './platform.js';

const ALBUM_FALLBACK = 'images/album-fallback.svg';
const failedImageUris = new Set();
const imageElementCache = new Map();

const updateAlbumImageCache = async (action, uri) => {
  try {
    await sendExtensionMessage({ type: 'album-image-cache', action, uri });
  } catch {
    // Images still work if the service worker is unavailable; they simply are
    // not retained in the extension cache for this request.
  }
};

const showAlbumImage = async (albumArt, uri, forceRefresh = false) => {
  const img = albumArt.querySelector('img');
  const requestId = crypto.randomUUID();
  albumArt.dataset.imageUri = uri || '';
  albumArt.dataset.requestId = requestId;
  albumArt.dataset.state = uri ? 'loading' : 'fallback';

  if (!uri) {
    img.src = ALBUM_FALLBACK;
    albumArt.classList.remove('img-loader');
    return;
  }

  albumArt.classList.add('img-loader');

  if (uri.startsWith('images/') || uri.startsWith('data:')) {
    const localImage = new Image();
    localImage.onload = () => {
      if (albumArt.dataset.requestId !== requestId) return;
      img.src = uri;
      albumArt.dataset.state = 'loaded';
      albumArt.classList.remove('img-loader');
    };
    localImage.onerror = () => {
      if (albumArt.dataset.requestId !== requestId) return;
      img.src = ALBUM_FALLBACK;
      albumArt.dataset.state = 'error';
      albumArt.classList.remove('img-loader');
    };
    localImage.src = uri;
    return;
  }

  if (forceRefresh) await updateAlbumImageCache('evict', uri);

  const remoteImage = new Image();
  remoteImage.onload = async () => {
    if (albumArt.dataset.requestId !== requestId) return;

    // The service worker stages the opaque response. Promote it only after the
    // browser confirms that it decoded as an image.
    await updateAlbumImageCache('confirm', uri);
    if (albumArt.dataset.requestId !== requestId) return;

    img.src = uri;
    albumArt.dataset.state = 'loaded';
    failedImageUris.delete(uri);
    albumArt.classList.remove('img-loader');
  };
  remoteImage.onerror = async () => {
    if (albumArt.dataset.requestId !== requestId) return;

    await updateAlbumImageCache('evict', uri);
    if (albumArt.dataset.requestId !== requestId) return;

    img.src = ALBUM_FALLBACK;
    albumArt.dataset.state = 'error';
    failedImageUris.add(uri);
    albumArt.classList.remove('img-loader');
  };
  remoteImage.src = uri;
};

// One element per play is moved from current track to history when needed,
// preserving the decoded image and avoiding another network request.
export const getAlbumArt = (play) => {
  if (!imageElementCache.has(play.id)) {
    const albumArt = document.createElement('div');
    albumArt.className = 'album-art img-loader surface-secondary img-aspect-square';

    const img = document.createElement('img');
    img.src = ALBUM_FALLBACK;
    img.alt = `${play.song} ${play.artist}`;
    img.className = 'img-fullsize img-aspect-square';
    albumArt.appendChild(img);

    showAlbumImage(albumArt, play.image_uri);
    imageElementCache.set(play.id, albumArt);
  }
  return imageElementCache.get(play.id);
};

export const refreshFailedAlbumImages = (plays) => {
  const activeUris = new Set(plays.map(play => play.image_uri).filter(Boolean));
  for (const uri of failedImageUris) {
    if (!activeUris.has(uri)) failedImageUris.delete(uri);
  }

  plays.forEach((play) => {
    const albumArt = imageElementCache.get(play.id);
    if (!albumArt) return;

    const imageChanged = albumArt.dataset.imageUri !== (play.image_uri || '');
    const shouldRetry = failedImageUris.has(play.image_uri);
    if (imageChanged || shouldRetry) showAlbumImage(albumArt, play.image_uri, shouldRetry);
  });
};

export const pruneAlbumArt = (activeKeys) => {
  for (const key of imageElementCache.keys()) {
    if (!activeKeys.has(key)) imageElementCache.delete(key);
  }
};
