# Building it from the same repo and pipelines as the datasource

**Verdict: feasible, and this repository already uses the layout.** Two plugin folders and one parametrized
set of build steps work. Verified on 2026-11-19 by building, testing and running both plugins' end-to-end
suites from this layout. The org repo (`kotak-custom-grafana-plugins`) needs the changes listed below.

## Layout

```
kotak-custom-grafana-plugins/
├── plugins/
│   ├── kotak-starrocks-datasource/   ← today's repo root, moved with git mv (no code change)
│   └── kotak-starrocks-logs-app/     ← this repo
└── pipelines/
    ├── templates/build-steps.yml     ← gains pluginDir + hasBackend parameters
    ├── kotak-starrocks-datasource.yml
    └── kotak-starrocks-logs-app.yml
```

Each folder keeps its own `package.json`, lock file, `.config/`, lint/test config and scripts. They share
nothing at build time, so a change in one does not rebuild or risk the other (path triggers).

**Both plugins must be in sub-folders.** Keeping the datasource at the repo root and adding the app in a
sub-folder breaks the datasource build: the scaffolded webpack config discovers plugins with the glob
`**/src/**/plugin.json`, so the datasource build picks up the app as a nested plugin and fails
(`Can't resolve 'grafana-public-path'`, reproduced locally). The root's tsconfig/eslint/jest would also scan
the app. Sub-folders avoid all of it without touching the datasource's configuration.

## What was verified

| Check | Result |
|---|---|
| App: typecheck, lint, 45 unit tests, build, package, verify from `plugins/kotak-starrocks-logs-app` | pass |
| Datasource: typecheck, lint, 57 tests, build, `go vet`, Go tests, both Linux binaries, package, verify from `plugins/kotak-starrocks-datasource`, using its own unchanged scripts | pass |
| One script for both, Go steps switched on by `"backend": true` in `src/plugin.json` | pass |
| Datasource at root + app in a sub-folder | **fails** (nested plugin glob) |
| App zip layout = datasource zip layout (`<id>-<v>.zip`, top-level `<id>/`, `.sha256`) | yes; same S3 / init-container flow |

## Changes needed in the org repo and pipelines

1. **Move** the datasource into `plugins/kotak-starrocks-datasource/` (`git mv`, one commit, no code change).
   Update any paths in the pipelines and docs that assume the root.
2. **`pipelines/templates/build-steps.yml`**: add `pluginDir` (used as `workingDirectory` of every step) and
   `hasBackend` (wraps GoTool, vendored-modules, `go vet`/`go test` and `build-backend.sh`). The ready
   template is [`pipelines/templates/build-plugin-steps.yml`](../../../pipelines/templates/build-plugin-steps.yml),
   with one thin pipeline per plugin next to it; `scripts/build-plugin.sh` at the repo root runs the same steps.
3. **Packaging scripts**: no change. Each folder runs its own `scripts/package.sh` / `verify-package.sh`
   (same zip contract); the template calls them in `pluginDir`.
4. **Tags / version check**: with two plugins in one repo, use per-plugin tags (`kotak-starrocks-logs-app/v0.1.0`)
   and make `requireTagMatchesVersion` read `<pluginDir>/package.json`.
5. **Triggers**: path filters per pipeline (`plugins/<id>/*`) so a change to one plugin does not build or
   release the other. PR build validation: one policy per path.
6. **Feed and upload**: same Observability feed (package name = plugin id), same
   `grafana-plugin-upload.yml` with a new parameter value, same buckets, service connections and pools.

## Same resources, confirmed

| Resource | Reused as is? |
|---|---|
| ADO project, repo, pool `CI_Shared_Linux`, `cicd-templates` (security attestation, approvals) | yes |
| npm mirror | yes; needs `@grafana/scenes@6.20.2` and its dependencies available (check with `npm view @grafana/scenes@6.20.2 version` on an agent) |
| Node 22/24 | yes (`engines.node >=22`) |
| Go toolchain | not used by the app |
| Feed `Observability`, upload pipeline, S3 buckets, `s3-sync-init` | yes (one more plugin value / copy line) |
| Signing decision | same as the datasource (unsigned + `allow_loading_unsigned_plugins`, or a private signature) |

## Risks

- `npm ci` time doubles when both pipelines run (separate lock files); path triggers keep it to one in
  practice.
- The app depends on the datasource's query contract (`rawSql`, `format: table`, `$__timeFilter`). Keep that
  contract stable; the app's smoke tests (`./scripts/e2e.sh smoke`) exercise it against a real datasource
  build and are worth running in the datasource's pipeline too.
