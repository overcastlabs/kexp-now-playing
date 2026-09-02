'use strict';

const HISTORY_SIZE = 20;
const API_URL = `https://api.kexp.org/v2/plays/?limit=${HISTORY_SIZE + 1}&ordering=-airdate`;
const AIRBREAK_IMAGE = 'images/icon-large.svg';
const ALBUM_FALLBACK = 'images/album-fallback.svg';
const AIRBREAK_TYPE = 'airbreak';
const CLASS_HIDDEN = 'hidden';
const CLASS_REFRESH = 'refresh';
const EL_LOADER = document.getElementById('loader');
const EL_ERROR = document.getElementById('error');
const EL_CURRENT_ART = document.querySelector('.current-art');
const EL_CURRENT_TRACK = document.getElementById('current-track');
const EL_HISTORY = document.getElementById('history');
const EL_HISTORY_LIST = document.getElementById('history-list');
const REFRESH_INTERVAL = 6e4; // 1min
const TEXT_STRINGS = {
  now_playing: 'Now Playing',
  air_break: 'Air Break',
  unknown_track: 'Unknown Track',
  loading: 'Loading',
};

const urlParams = new URLSearchParams(window.location.search);
const env = urlParams.get('env');

if (env) {
  document.documentElement.classList.add(`${env}-view`);
}

const esc = (str) => {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML.replace(
    /https?:\/\/[^\s<>"]+/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
};

const formatTime = (dateStr) => {
  if (typeof Temporal !== 'undefined') {
    const now = Temporal.Now.plainDateTimeISO().round('second');
    let time = Temporal.PlainDateTime.from(dateStr);
    const duration = now.since(time, {
      largestUnit: 'hours',
      smallestUnit: 'minutes',
    });
    return duration.toLocaleString();
  } else {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diffMin = Math.floor((Date.now() - date) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 120) return '1h ago';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
};

const yearFromDateString = (dateStr) => {
  const date = new Date(dateStr);
  if (date instanceof Date && !isNaN(date)) {
    return date.getFullYear();
  } else {
    return '';
  }
};

const isAirbreak = (play) => play.play_type === AIRBREAK_TYPE;

const hydratePlay = (rawPlay) => ({
  id: rawPlay.id ?? rawPlay.airdate,
  airdate: rawPlay.airdate,
  song: isAirbreak(rawPlay) ? TEXT_STRINGS.air_break : esc(rawPlay.song) || TEXT_STRINGS.unknown_track,
  artist: esc(rawPlay.artist),
  album: esc(rawPlay.album),
  year: esc(rawPlay.release_date),
  comment: esc(rawPlay.comment),
  image_uri: isAirbreak(rawPlay)
    ? AIRBREAK_IMAGE
    : rawPlay.image_uri || rawPlay.thumbnail_uri,
});

const failedImageUris = new Set();

const updateAlbumImageCache = async (action, uri) => {
  try {
    await chrome.runtime.sendMessage({ type: 'album-image-cache', action, uri });
  } catch {
    // The image can still be displayed if the service worker is unavailable;
    // it just will not be retained in the extension cache for this request.
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
    // browser confirms that it decoded as an image, then use that cached copy
    // for the visible element.
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

// One album-art element per play, shared across current-track and history.
// appendChild moves the element rather than cloning it, so the already-loaded
// image travels from current-track → history with zero network requests.
const imgElementCache = new Map(); // play.id → album-art element

const getImg = (play) => {
  if (!imgElementCache.has(play.id)) {
    const albumArt = document.createElement('div');
    albumArt.className = 'album-art img-loader surface-secondary img-aspect-square';

    const img = document.createElement('img');
    img.src = ALBUM_FALLBACK;
    img.alt = `${play.song} ${play.artist}`;
    img.className = 'img-fullsize img-aspect-square';
    albumArt.appendChild(img);

    showAlbumImage(albumArt, play.image_uri);

    imgElementCache.set(play.id, albumArt);
  }
  return imgElementCache.get(play.id);
};

const renderCurrentTrack = (play) => {
  EL_CURRENT_TRACK.innerHTML = `
    <h1 class="text-size-xl text-weight-black">${play.song}</h1>
    ${play.artist ? `<h2 class="text-color-secondary text-weight-bold">${play.artist}</h2>` : ''}
    ${play.album ? `<h3 class="text-size-sm text-style-italic text-color-muted text-weight-bold">${play.album}${play.year ? ' &ndash; ' + yearFromDateString(play.year) : ''}</h3>` : ''}
    ${play.comment ? `<blockquote class="text-size-sm m-t-sm">${play.comment}</blockquote>` : ''}
  `;
  EL_CURRENT_ART.replaceChildren(getImg(play));
};

const historyNodeCache = new Map(); // play.id → <li>

const createHistoryNode = (play) => {
  const li = document.createElement('li');
  li.className = 'history-item stack';
  li.innerHTML = `
    <div class="stack stack--horizontal stack--center">
      <div class="history-art"></div>
      <div class="history-meta">
        <h5 class="text-size-md text-weight-bold text-overflow-ellipsis">${play.song}</h5>
        ${play.artist ? `<h6 class="text-color-secondary text-size-sm text-overflow-ellipsis">${play.artist}</h6>` : ''}
      </div>
      <div class="text-color-muted text-size-sm text-style-italic">${formatTime(play.airdate)}</div>
    </div>
    `;
    // ${play.comment ? `<blockquote class="current-info--comment text-size-sm m-b-md">${play.comment}</blockquote>` : ''}
  li.querySelector('.history-art').appendChild(getImg(play));
  li.title = `${play.song} - ${play.artist}`;
  return li;
};

const renderHistory = (plays) => {
  const nodes = plays.map(play => {
    if (!historyNodeCache.has(play.id)) historyNodeCache.set(play.id, createHistoryNode(play));
    return historyNodeCache.get(play.id);
  });

  // Reconcile positions without replacing existing nodes
  nodes.forEach((node, i) => {
    if (EL_HISTORY_LIST.children[i] !== node) EL_HISTORY_LIST.insertBefore(node, EL_HISTORY_LIST.children[i] ?? null);
  });
  while (EL_HISTORY_LIST.children.length > nodes.length) EL_HISTORY_LIST.removeChild(EL_HISTORY_LIST.lastChild);
};

const refreshFailedAlbumImages = (plays) => {
  const activeUris = new Set(plays.map(play => play.image_uri).filter(Boolean));
  for (const uri of failedImageUris) {
    if (!activeUris.has(uri)) failedImageUris.delete(uri);
  }

  plays.forEach(play => {
    const albumArt = imgElementCache.get(play.id);
    if (!albumArt) return;

    const imageChanged = albumArt.dataset.imageUri !== (play.image_uri || '');
    const shouldRetry = failedImageUris.has(play.image_uri);
    if (imageChanged || shouldRetry) showAlbumImage(albumArt, play.image_uri, shouldRetry);
  });
};

let cachedKeys = null;
async function load() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const plays = data.results.map(hydratePlay) || [];

    if (plays.length === 0) throw new Error('No plays returned');

    // Look for updated keys and render
    const newKeys = plays.map(play => play.id);
    const currentChanged = !cachedKeys || newKeys[0] !== cachedKeys[0];
    const historyChanged = !cachedKeys || newKeys.slice(1).some((k, i) => k !== cachedKeys[i + 1]);
    if (currentChanged) renderCurrentTrack(plays[0]);
    if (historyChanged) renderHistory(plays.slice(1));
    refreshFailedAlbumImages(plays);
    cachedKeys = newKeys;

    // Prune keys no longer in the window
    const activeKeys = new Set(newKeys);
    for (const k of imgElementCache.keys()) {
      if (!activeKeys.has(k)) {
        imgElementCache.delete(k);
        historyNodeCache.delete(k);
      }
    }

    EL_HISTORY.classList.remove(CLASS_HIDDEN);
    EL_ERROR.classList.add(CLASS_HIDDEN);
  } catch (err) {
    EL_ERROR.classList.remove(CLASS_HIDDEN);
  } finally {
    EL_LOADER.classList.add(CLASS_HIDDEN);
  }

  setTimeout(load, REFRESH_INTERVAL);
}

document.querySelectorAll(`.${CLASS_REFRESH}`).forEach(el => el.addEventListener('click', () => {
  EL_LOADER.classList.remove(CLASS_HIDDEN);
  load();
}));

document.querySelector('.sidebar-button')?.addEventListener('click', () => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
    .then(() => window.close())
    .catch((err) => {
      console.error('Unable to open the side panel', err);
    });
});

renderCurrentTrack({
  id: '-1',
  song: TEXT_STRINGS.loading,
  image_uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
});

load();
