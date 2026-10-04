# @synch/cli

Headless CLI for Synch, the end-to-end encrypted Obsidian Sync alternative. It
drives `@synch/sync-client` with Node host adapters so a vault directory can be
synchronized from servers, containers, or scripts without Obsidian.

Requires Node.js >= 22.13 (`node:sqlite`, global `fetch`/`WebSocket`/WebCrypto).

## Installation

Once `@synch/cli` is published to the npm registry:

```sh
pnpm add -g @synch/cli
synch --help
```

Update with `pnpm add -g @synch/cli@latest`, or remove with
`pnpm remove -g @synch/cli`. If pnpm has no global bin directory configured,
run `pnpm setup` and restart your shell first.

The package includes the sync client and third-party dependencies in one bundle;
it does not require the source repository or private workspace packages.
Bundled dependency license notices are included in `dist/THIRD_PARTY_LICENSES.txt`.

Set `SYNCH_API_URL` to your Synch API server URL before signing in. The default
is `http://127.0.0.1:8787` for local development.

## Commands

```sh
synch login                          # device-code sign-in (prints URL + code)
synch logout                         # sign out, clear stored keys
synch vault connect --vault-id <id>  # unlock a remote vault for a directory
synch pull                           # download only; never upload local changes
synch sync                           # one-shot synchronization
synch watch                          # keep syncing until interrupted or stopped by a terminal sync error
synch status                         # account, vault, and sync state
```

`synch pull` never scans for local changes and never uploads pending local
mutations. Remote versions replace differing files in the target directory, so
use it only for read-only replicas or backup staging directories.

Common options: `--vault <path>` (default: current directory) and
`--api-url <url>` (or the `SYNCH_API_URL` environment variable).

## State layout

- `<vault>/.synch/sync.sqlite` — local sync store (`node:sqlite`), never synced.
- `<vault>/.synch/cli.lock` — exclusive per-vault process lock with stale-lock
  recovery.
- `~/.config/synch/credentials.json` (XDG-aware, `chmod 600`) — session token
  and per-vault remote vault keys, stored outside the vault.

## Development

```sh
pnpm -C apps/cli dev -- status       # run from sources via tsx
pnpm -C apps/cli test                # vitest
pnpm -C apps/cli typecheck           # tsgo
pnpm -C apps/cli build               # bundle to dist/synch.js
pnpm -C apps/cli test:package        # pack and verify an isolated offline install
```

## Publishing (maintainers)

Before the first release:

1. Confirm ownership of the `@synch` npm scope and availability of `@synch/cli`.
   If another package name is needed, update this manifest and installation docs
   before merging. Other workspace packages stay private.
2. Create the GitHub environment `npm-cli` in `hjinco/synch`, restrict it to
   `main`, and configure required reviewers as appropriate.
3. Add an environment secret `NPM_TOKEN` with npm publish access to this package.
   Use a granular token with the permissions and 2FA policy required by npm for
   unattended publishing; renew it before expiration. For a new package, ensure
   the token can create the package in the scope.

For each release, update the version in `apps/cli/package.json` in a reviewed PR.
The CLI version is derived from that manifest during bundling. After merging,
run **Release CLI** (`release-cli.yml`) on `main` in the upstream repository.
The workflow runs tests, verifies an offline installation, uploads the tarball,
and publishes it. Forks cannot run the publish job. Existing versions cannot be
republished: use a new version for each release. Prerelease publishing and dist-tag
selection are not provided by this workflow.

To inspect a release locally without publishing:

```sh
pnpm install --frozen-lockfile
pnpm -C apps/cli test --run
pnpm -C apps/cli test:package
pnpm -C apps/cli pack --pack-destination /tmp/synch-cli-release
```

`prepack` builds from source, so packing never relies on a previously built
bundle. Package verification checks the file allowlist, absence of runtime
dependencies, and the installed `synch --version` and `synch --help` commands.
