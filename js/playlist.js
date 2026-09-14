const API_ROOT = 'https://api.kexp.org/v2/plays/';
const AIRBREAK_IMAGE = 'images/icon-large.svg';
const AIRBREAK_TYPE = 'airbreak';

const asText = value => value ? String(value) : '';
const isAirbreak = play => play.play_type === AIRBREAK_TYPE;
const joinNames = value => Array.isArray(value)
  ? value.map(asText).filter(Boolean).join(', ')
  : asText(value);

const normalizePlay = (rawPlay, show = {}) => ({
  id: rawPlay.id ?? rawPlay.airdate,
  airdate: rawPlay.airdate,
  song: isAirbreak(rawPlay) ? 'Air Break' : asText(rawPlay.song) || 'Unknown Track',
  artist: isAirbreak(rawPlay) ? joinNames(show.host_names) : asText(rawPlay.artist),
  album: isAirbreak(rawPlay) ? asText(show.program_name) : asText(rawPlay.album),
  year: asText(rawPlay.release_date),
  comment: isAirbreak(rawPlay) ? asText(show.tagline) : asText(rawPlay.comment),
  isAirbreak: isAirbreak(rawPlay),
  image_uri: isAirbreak(rawPlay)
    ? AIRBREAK_IMAGE
    : rawPlay.image_uri || rawPlay.thumbnail_uri,
});

const getShowUrl = play => play.show_url || play.show_uri;

const fetchShow = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Show HTTP ${response.status}`);
  return response.json();
};

const normalizePlays = async (rawPlays, signal) => {
  const showRequests = new Map();

  return Promise.all(rawPlays.map(async (rawPlay) => {
    if (!isAirbreak(rawPlay)) return normalizePlay(rawPlay);

    const showUrl = getShowUrl(rawPlay);
    if (!showUrl) return normalizePlay(rawPlay);

    if (!showRequests.has(showUrl)) {
      showRequests.set(showUrl, fetchShow(showUrl, signal).catch((error) => {
        if (error.name === 'AbortError') throw error;
        return null;
      }));
    }

    const show = await showRequests.get(showUrl);
    return normalizePlay(rawPlay, show || {});
  }));
};

const getPlaylistUrl = (historySize) => {
  const url = new URL(API_ROOT);
  url.search = new URLSearchParams({
    limit: String(historySize + 1),
    ordering: '-airdate',
  });
  return url;
};

export const fetchPlaylist = async ({ historySize, signal }) => {
  const response = await fetch(getPlaylistUrl(historySize), { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const plays = Array.isArray(data.results)
    ? await normalizePlays(data.results, signal)
    : [];
  if (plays.length === 0) throw new Error('No plays returned');
  return plays;
};
