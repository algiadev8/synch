# API web UI

The six existing routes (`/signin`, `/signup`, `/device`, `/vaults`,
`/organizations`, `/invitations`) are a Vite + React + TypeScript multi-page app.
Each HTML entry mounts its page; shared components, API helpers, styles, and
translation catalogs live under `src/`. There is no SPA fallback: missing API
routes must keep returning API errors on both Cloudflare and Node.

## Build and deployment

From the repository root:

```sh
pnpm -C apps/api build:public
pnpm -C apps/api check:vault-crypto
pnpm -C apps/api typecheck:web
pnpm -C apps/api test:web
```

Edit `web/`, not `public/`. `build:public` replaces `apps/api/public` with the
complete production output, including hashed JS/CSS and copied `static/` files.
`public/` is ignored by Git. Commit `web/` source, static assets, and generated
`web/vendor/` changes. `check:vault-crypto` verifies the committed crypto bundle
and declarations against the shared source without rewriting them. CI runs this
check before any build so a stale vendor artifact cannot be silently refreshed.
The unit and Node E2E test commands build the UI before testing its generated
assets. CI also checks locale keys and runs React interaction tests.

Cloudflare build/deploy scripts explicitly build the UI before invoking Wrangler.
This also supports older self-host clones whose preserved `wrangler.jsonc` lacks
the custom build hook. Current configurations retain the hook for direct Wrangler
invocations and development; package-script deployments therefore run the build
again through that hook. `build:node` builds the UI before copying `public/` into
the Node artifact, including Docker builds; `dev:node` also builds first.
Neither runtime needs Vite or React running in production.

For an older self-host clone using a direct `wrangler deploy` command, change the
deployment command to `pnpm run deploy` or add the current custom build hook.
Do not replace resource bindings in its existing `wrangler.jsonc`.

### Standalone templates and encryption

Deploy to Cloudflare copies only `apps/api`, and the Docker build also has no
shared package source. `web/vendor/vault-crypto.js` and its TypeScript declarations
are therefore committed generated artifacts of `packages/vault-crypto/src`.
In a workspace, `build:public` regenerates them and `check:vault-crypto` verifies them.
Without that package, the same commands use the committed artifacts. Do not edit
vendor files or create a separate encryption implementation here.

Vite bundles this module as a lazy, same-origin chunk. Vault password validation,
key generation, and production-strength Argon2id wrapping stay in the browser.
Only the encrypted key envelope is sent to the API. No password or unencrypted
vault key is persisted in browser storage or transmitted.

## Local development

Use two terminals after setting up the usual API local secrets and migrations:

```sh
pnpm -C apps/api dev:web:api
pnpm -C apps/api dev:web
```

Open `http://127.0.0.1:5173/signin`. Vite provides React fast refresh and proxies
`/api/*` and `/v1/*` to `http://127.0.0.1:8787`. The dedicated `dev:web:api` command
sets Better Auth's public URL to the Vite origin, keeping callback URLs and
trusted-origin checks consistent. Use `127.0.0.1`, not `localhost`, for this flow.
The ordinary `dev` command still serves the compiled UI on the API port.

For a Node backend, run it on port 8787 with
`PUBLIC_URL=http://127.0.0.1:5173` (and the normal Node configuration), then run
`dev:web`. Run `build:public` after changing shared vault crypto source so the
vendored module is refreshed before using the Vite dev server.
