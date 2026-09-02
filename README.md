# KEXP Now Playing

A lightweight Chrome extension for seeing what is currently playing on [KEXP 90.3 FM Seattle](https://www.kexp.org/). It presents the current track and recent playlist history in either the extension popup or Chrome's side panel.

## Features

- Current song, artist, album, release year, and DJ comment
- Ten recently played tracks with relative timestamps
- Album artwork with a local fallback and bounded browser cache
- Automatic playlist refresh every 60 seconds
- Manual refresh and error recovery
- Popup and persistent side-panel layouts
- Direct link to the full KEXP playlist
- Manifest V3 service worker

## Install locally

This project has no build step or package dependencies.

1. Clone the repository:

   ```sh
   git clone git@github.com:overcastlabs/kexp-now-playing.git
   cd kexp-now-playing
   ```

2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the repository directory.
5. Pin **KEXP Now Playing** to the toolbar or open it from Chrome's Extensions menu.

After editing a file, return to `chrome://extensions` and reload the extension. Refresh an already-open popup or side panel to see UI changes.

## Development

The extension is written in plain HTML, CSS, and JavaScript:

```text
.
├── app.html                 Popup and side-panel markup
├── app.css                  Shared interface styles
├── app.js                   Playlist fetching and rendering
├── service-worker.js        Album-art caching
├── manifest.json            Chrome extension manifest
├── images/                  Icons, logos, and fallback artwork
├── Makefile                 Local packaging and release commands
├── scripts/                 Versioning, packaging, and publishing tools
└── .github/workflows/       Release and Chrome Web Store automation
```

Playlist data comes from the [KEXP public API](https://api.kexp.org/v2/plays/). The UI requests the eleven latest entries: one current play and ten history items.

### Permissions

The extension requests only the capabilities used by its interface:

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Opens the persistent Chrome side panel |
| `storage` | Tracks the bounded album-art cache order |
| `https://*.archive.org/*` | Retrieves and caches album artwork hosted by Internet Archive |

## Package the extension

Run the packaging command from the repository root:

```sh
make package
```

The resulting ZIP contains only the runtime files needed by Chrome. Generated ZIP files and the `dist/` directory are ignored by Git.

## Release and publish

Releases are initiated from the terminal:

```sh
make release-patch
make release-minor
make release-major
```

Each command updates `manifest.json`, creates a release commit and annotated version tag, and atomically pushes both. The tag triggers GitHub Actions to package the extension, create a GitHub Release, upload it to Chrome Web Store API v2, and submit it for review and automatic publishing after approval.

Retry Chrome publishing for an existing release without opening GitHub:

```sh
make publish TAG=v1.2.3
```

Chrome Web Store and Google Cloud authentication require one-time repository configuration. See [Releasing KEXP Now Playing](docs/RELEASING.md) for setup instructions, required environment variables, and retry procedures.

## Data and caching

The popup fetches current playlist information directly from KEXP. Remote album images are staged by the service worker and retained only after Chrome confirms that they decode successfully. The cache keeps at most 15 confirmed images and removes failed or expired entries.

No analytics or advertising code is included in this repository.
