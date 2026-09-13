const API_ROOT = 'https://api.kexp.org/v2/plays/';
const AIRBREAK_IMAGE = 'images/icon-large.svg';
const AIRBREAK_TYPE = 'airbreak';

const asText = value => value ? String(value) : '';
const isAirbreak = play => play.play_type === AIRBREAK_TYPE;

const normalizePlay = rawPlay => ({
  id: rawPlay.id ?? rawPlay.airdate,
  airdate: rawPlay.airdate,
  song: isAirbreak(rawPlay) ? 'Air Break' : asText(rawPlay.song) || 'Unknown Track',
  artist: asText(rawPlay.artist),
  album: asText(rawPlay.album),
  year: asText(rawPlay.release_date),
  comment: asText(rawPlay.comment),
  image_uri: isAirbreak(rawPlay)
    ? AIRBREAK_IMAGE
    : rawPlay.image_uri || rawPlay.thumbnail_uri,
});

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
  const plays = Array.isArray(data.results) ? data.results.map(normalizePlay) : [];
  if (plays.length === 0) throw new Error('No plays returned');
  return plays;
};
