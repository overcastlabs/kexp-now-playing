# Releasing KEXP Now Playing

Local Make commands increment the extension version and push a release tag. That tag triggers GitHub Actions to create a GitHub Release with a ZIP artifact and submit it to Chrome Web Store API v2. Chrome still reviews submissions when required; `DEFAULT_PUBLISH` makes an approved submission go live automatically.

## One-time Chrome Web Store setup

1. Register a Chrome Web Store developer account and create the extension item manually.
2. Complete the Store listing and Privacy tabs. The API cannot publish a new item until these are complete.
3. In a Google Cloud project, enable **Chrome Web Store API**.
4. Create a Google Cloud service account. No Google Cloud project role is required for Chrome Web Store access.
5. In the Chrome Web Store Developer Dashboard, open **Account** and add that service account email. Chrome currently allows one service account per publisher.
6. Configure GitHub Actions to impersonate that service account through [Google Cloud Workload Identity Federation](https://github.com/google-github-actions/auth#setup). Restrict the provider to this repository: `overcastlabs/kexp-now-playing`.

The GitHub OIDC principal needs `roles/iam.workloadIdentityUser` on the service account. Workload Identity Federation avoids storing a long-lived service-account key in GitHub.

## GitHub environment

Create an environment named `chrome-web-store` under **Settings → Environments**. Add these environment variables:

| Variable | Value |
| --- | --- |
| `CWS_PUBLISHER_ID` | Publisher ID from Chrome Developer Dashboard → Publisher → Settings |
| `CWS_EXTENSION_ID` | The extension's Chrome Web Store item ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider name, such as `projects/123456789/locations/global/workloadIdentityPools/github/providers/kexp-now-playing` |
| `GCP_SERVICE_ACCOUNT` | Service account email added to the Chrome Web Store publisher |

Optionally add required reviewers to this environment if Chrome publishing should require an approval click.

## Local prerequisites

- Git
- Node.js 20 or newer
- GNU Make
- [GitHub CLI](https://cli.github.com/) for watching runs and retrying a publish from the terminal

Authenticate GitHub CLI once:

```sh
gh auth login
```

Creating and pushing a release works without GitHub CLI. When `gh` is installed and authenticated, the release command also follows the GitHub Actions run until it finishes.

## Create a release

Start with a clean `main` branch containing all intended changes, then run one of:

```sh
make release-patch
make release-minor
make release-major
```

Starting from `1.1`, the choices produce:

| Choice | Next version |
| --- | --- |
| `patch` | `1.1.1` |
| `minor` | `1.2.0` |
| `major` | `2.0.0` |

The local command:

1. Verifies that the working tree is clean and local `main` contains the latest `origin/main` commit.
2. Updates `manifest.json`.
3. Creates a release commit and annotated `vX.Y.Z` tag.
4. Atomically pushes `main` and the tag.

The tag triggers GitHub Actions, which validates that the tag matches the manifest and points to a commit on `main`, packages only the extension runtime files, creates a GitHub Release, and submits it to Chrome Web Store.

The workflow needs repository **Actions → General → Workflow permissions** set to **Read and write permissions**. If `main` or `v*` tags are protected by rulesets, make sure your GitHub account is allowed to push the release commit and create release tags.

To build a ZIP without releasing it:

```sh
make package
```

## Retry Chrome publishing

If the GitHub Release succeeds but the Chrome upload fails, retry it entirely from the terminal:

```sh
make publish TAG=v1.2.3
```

`make republish TAG=v1.2.3` is an alias. The command verifies that the GitHub Release exists, starts the manual publishing workflow, and watches it until completion. It does not increment the version or create another release.

To reconnect to an existing run without starting a new one:

```sh
make release-status TAG=v1.2.3
make publish-status TAG=v1.2.3
```

## Important Chrome behavior

- Uploads fail when the ZIP's manifest version is not newer than the current store version.
- Publishing submits the extension for review when Chrome requires review. It goes live automatically after approval.
- If visibility settings are changed manually, Chrome requires one manual publish with those settings before API publishing works again.
- The initial extension item and its required listing/privacy information must be created in the Developer Dashboard.

References: [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/api), [service-account setup](https://developer.chrome.com/docs/webstore/service-accounts), and [publishing API guide](https://developer.chrome.com/docs/webstore/using-api).
