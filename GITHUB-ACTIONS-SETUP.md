# GitHub Actions: CI, the plugin build and Docker Hub

The repository has three workflows. This page covers what each does, the one-time Docker Hub setup, and how to make a release. What the tests check is in [TESTING.md](TESTING.md); what's in the image and how to build it by hand is in [DOCKER.md](DOCKER.md).

| Workflow                                               | Runs on                                                           | What it does                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI** (`ci.yml`)                                      | pull requests, pushes to `main`                                   | Lint, format, unit tests, CRAP check, build, then the plugin and every end-to-end test against its own Jellyfin 12.1 ([TESTING.md](TESTING.md#ci)). Needs no secrets |
| **Jellyfin plugin** (`jellyfin-plugin.yml`)            | pull requests and pushes to `main` that change `jellyfin-plugin/` | Builds `Jellyfin.Plugin.KaraokeCdg.dll` and uploads it as the `jellyfin-plugin-karaoke-cdg` artifact                                                                 |
| **Build and Push Docker Image** (`docker-publish.yml`) | pull requests, pushes to `main`, `v*` tags, or by hand            | Builds the image (amd64 on pull requests); on `main` and tags, also arm64, and publishes to Docker Hub when the secrets below are set                                |

A newer push to the same branch cancels a run still in progress.

## One-time setup: publishing to Docker Hub

Without these secrets the Docker workflow still builds the image (which checks the Dockerfile) and leaves a "built without publishing" notice.

1. **Docker Hub:** create a repository (for example `your-username/karaoke-for-jellyfin`), then **Account Settings → Security → New Access Token** with Read & Write access. Copy the token.
2. **GitHub:** **Settings → Secrets and variables → Actions**:
   - Secrets: `DOCKERHUB_USERNAME` (your Docker Hub user) and `DOCKERHUB_TOKEN` (the token).
   - Variable (optional): `DOCKER_IMAGE`, the repository to publish to. The default is `mrorbitman/karaoke-for-jellyfin`, the original author's account, so set it to your own.

**Tags published:** `latest` from `main`; for a Git tag `v0.2.0`, the tags `0.2.0` and `0.2`. Images are cached between runs with the GitHub Actions cache.

The Docker Hub page's description isn't updated by the workflow: copy [README-DOCKERHUB.md](README-DOCKERHUB.md) into it by hand.

## Making a release

1. Bump the versions: the app in `package.json` (`npm version <x.y.z> --no-git-tag-version`); the plugin, if it changed, in `jellyfin-plugin/build.yaml`, the `.csproj` (`AssemblyVersion`, `FileVersion`), the `KaraokeCdg_<version>` folder in `ci.yml` and the docs (HOWTO.md, the plugin README), and the version line in README.md.
2. Log the features, changes and fixes in [CHANGES.md](CHANGES.md).
3. Merge to `main`, then tag it: `git tag v0.2.0 && git push origin v0.2.0`. The Docker workflow publishes the versioned image.
4. Attach the plugin DLL from the **Jellyfin plugin** workflow's artifact to a GitHub release, if you publish one.

## When a workflow fails

- **CI:** download the `test-results` artifact (the Playwright report, test results and Jellyfin's log). [TESTING.md](TESTING.md#running-them-locally-against-a-jellyfin-in-docker) shows how to run the same tests locally.
- **Docker, "Username and password required":** the Docker Hub secrets are missing or wrong.
- **Docker, arm64 only:** a dependency without an arm64 build; the pull-request build is amd64 only, so this shows up first on `main`.
