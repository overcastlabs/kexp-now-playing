SHELL := /bin/bash
.DEFAULT_GOAL := help
BUMP ?= patch

.PHONY: help package version release release-patch release-minor release-major publish republish release-status publish-status

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

package: ## Build an extension ZIP at dist/kexp-now-playing.zip
	@scripts/package-extension.sh dist/kexp-now-playing.zip

version: ## Print the current manifest version
	@node -p "require('./manifest.json').version"

release: ## Bump, commit, tag, and push (BUMP=patch|minor|major)
	@scripts/release.sh "$(BUMP)"

release-patch: ## Create and push a patch release
	@scripts/release.sh patch

release-minor: ## Create and push a minor release
	@scripts/release.sh minor

release-major: ## Create and push a major release
	@scripts/release.sh major

publish: ## Retry Chrome publishing for an existing release (TAG=v1.2.3)
	@scripts/publish-release.sh "$(TAG)"

republish: publish ## Alias for publish

release-status: ## Watch a tag-triggered release run (TAG=v1.2.3; requires gh)
	@scripts/watch-workflow.sh release.yml "Release $(TAG)"

publish-status: ## Watch a manual publishing run (TAG=v1.2.3; requires gh)
	@scripts/watch-workflow.sh publish-chrome.yml "Publish $(TAG)"
