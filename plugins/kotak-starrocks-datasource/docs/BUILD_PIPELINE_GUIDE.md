# Build and pipeline guide: kotak-starrocks-datasource

This guide is for an AI coding agent, such as Claude Code, running on an org PC with access to the
organisation's repositories and Azure DevOps. A human engineer can follow it too.

**Goal:** create build pipelines that turn this repository into a verified plugin zip and publish it, so the
existing delivery path (`grafana-plugin-upload.yml` → S3 → Grafana init container) can deploy it.

The guide has two parts:
1. **Investigation (§3):** what was tested on 2026-10-28 and what the results mean for pipeline design.
2. **Instructions (§4–§6):** build recipes and the step-by-step tasks to prepare the pipelines.

Related documents:
- `docs/AGENT_GUIDE.md`: what the plugin is, how to test it, and how to deploy the built zip (§10).
- `docs/QUESTIONS.md`: open questions for other teams.
- `docs/research/`: design history.

---

## 0. Rules

1. **Ask a human before outward or irreversible actions:**
   - publishing to the Azure Artifacts feed;
   - running pipelines against Prod;
   - signing with a Grafana Cloud token;
   - changing shared templates or another team's repo;
   - merging to protected branches.

   Prepare the change, show the diff or the plan, and wait.
2. **Secrets go in secret pipeline variables or variable groups only.** This covers
   `GRAFANA_ACCESS_POLICY_TOKEN` and any registry credentials. Never write them in YAML, scripts, logs or
   commit messages.
3. **Do not weaken the gates.** `scripts/verify-package.sh` must pass before anything is published. Tests
   should run in CI unless a human agrees to skip them.
4. **Do not change the build logic** in `.config/` (managed by `@grafana/create-plugin`), `webpack.config.ts`
   or `go.mod`'s `replace` line unless a build fails because of it. Explain why if you do.
5. **Use the org's own conventions.** Read the existing pipelines and templates (§5, T1) before writing YAML.
   Don't invent pool names, feed names or service connections.
6. **When information is missing, stop and ask.** Mirror URLs, package naming and agent capabilities are
   examples.

---

## 1. What the pipeline must produce

| Artifact | Name | Contents |
|---|---|---|
| Plugin package | `kotak-starrocks-datasource-<version>.zip` | One top-level folder `kotak-starrocks-datasource/` with `plugin.json`, `module.js` (+ chunks), `img/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `gpx_kotak_starrocks_linux_amd64`, `gpx_kotak_starrocks_linux_arm64`, `go_plugin_build_manifest` (mage only), and `MANIFEST.txt` (only when signed) |
| Checksum | `kotak-starrocks-datasource-<version>.zip.sha256` | `sha256sum` output |

- **Version.** It comes from `package.json` → `"version"` (currently `0.1.0`). Webpack writes it into
  `plugin.json` (`%VERSION%`), and the backend binary records it. The release must fail if `plugin.json` still
  contains `%VERSION%`; `verify-package.sh` checks this. Every release needs a new version, because the S3
  folder name and the Grafana init-container line both include it.
- **Acceptance.** `./scripts/verify-package.sh package/<zip>` prints `PASS`. It checks:
  - the checksum;
  - the single top-level folder;
  - the required files;
  - the plugin ID and version;
  - `alerting: false`;
  - both binaries present, executable, and statically linked for the right architecture.
- **Consumer.** The zip is published as a Universal Package to the Azure Artifacts feed **`Observability`**.
  `obser-aws-deploy-config/pipelines/grafana-plugin-upload.yml` downloads it, unzips it into
  `<artifact_name>/`, and uploads it to `s3://obser-<env>-obs1-common-grafana-plugins/grafana_plugins/<artifact_name>/`.
  The Grafana pod's `s3-sync-init` container then copies it to `/grafana/plugins/`. See `docs/AGENT_GUIDE.md`
  §7 and §10.

---

## 2. How the build works

| # | Stage | Tool | Command | Network needed | Output |
|---|---|---|---|---|---|
| 1 | Frontend deps | Node 22, npm 10 | `npm ci` | npm registry (1,164 packages; `node_modules` ≈ 832 MB) | `node_modules/` |
| 2 | Frontend checks | Node | `npm run typecheck && npm run lint && npm run test:ci` | none | — |
| 3 | Frontend build | Node (webpack 5, swc) | `npm run build` | none | `dist/module.js`, chunks, `plugin.json`, `img/`, `README.md`, `LICENSE`, `CHANGELOG.md` |
| 4 | Backend deps | Go ≥ 1.24.3 | (implicit) | Go module proxy, **unless `vendor/` exists** | module cache |
| 5 | Backend checks | Go | `go vet ./... && go test ./pkg/...` and `(cd third_party/go-sql-driver-mysql && go test -run TestAuth .)` | none once deps are present | — |
| 6 | Backend build | Go | `./scripts/build-backend.sh`, or `mage -v build:linux build:linuxARM64` | none once deps are present (mage itself must be installed) | `dist/gpx_kotak_starrocks_linux_{amd64,arm64}` (~25 MB each, static) |
| 7 | Sign (optional) | Node | `npx @grafana/sign-plugin@latest --rootUrls …` with `GRAFANA_ACCESS_POLICY_TOKEN` | grafana.com | `dist/MANIFEST.txt` |
| 8 | Package | bash, zip (or python3), sha256sum | `./scripts/package.sh` | none | `package/<id>-<ver>.zip` (≈ 18 MB) + `.sha256` |
| 9 | Verify | bash, unzip (or python3), `file` (optional) | `./scripts/verify-package.sh` | none | PASS/FAIL |

**Order constraints.**
- Step 3 must run before step 8. Steps 3 and 6 both write into `dist/`; webpack does not delete the `gpx_*`
  files, so either order works.
- Signing (7) must happen **after** both builds and **before** packaging. Any change to `dist/` after signing
  breaks the signature.

**Backend build: mage and `build-backend.sh` give the same result.**
- `mage build:linux` comes from `grafana-plugin-sdk-go/build` (v0.277.0, `common.go`) and runs:
  ```
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dist/gpx_kotak_starrocks_linux_amd64 -tags arrow_json_stdlib \
    -ldflags "-w -s -extldflags \"-static\" -X 'github.com/grafana/grafana-plugin-sdk-go/build.buildInfoJSON={\"time\":…,\"pluginID\":\"kotak-starrocks-datasource\",\"version\":\"0.1.0\"}' -X 'main.pluginID=kotak-starrocks-datasource' -X 'main.version=0.1.0'" ./pkg
  ```
- `scripts/build-backend.sh` runs the same command for amd64 and arm64. It needs no mage, so it works offline.
- The binary records its build settings (`go version -m dist/gpx_kotak_starrocks_linux_amd64`):
  `-tags=arrow_json_stdlib`, `CGO_ENABLED=0`, `GOOS=linux`, and the `-ldflags` above.
- The mage targets are `build:linux` and `build:linuxARM64`. `build:linuxAMD64` **does not exist**; mage
  prints "Unknown target".
- mage also writes `dist/go_plugin_build_manifest`. That file is only used for Grafana catalog submissions;
  Grafana does not need it to load the plugin.

**Tests that belong in CI:** stages 2 and 5, which need no services. The StarRocks integration test and the
Grafana end-to-end test (`scripts/e2e.sh`) need Docker and about 4 GB of RAM, and pull
`starrocks/allin1-ubuntu:4.0.10` (1.9 GB), `grafana/grafana-oss:12.0.1-security-01` and
`ghcr.io/navikt/mock-oauth2-server:2.1.10`. Run them as a separate, optional or nightly stage (§5, T7).

---

## 3. Investigation results (verified 2026-10-28)

Environment: Linux (WSL2, x86_64), Go 1.25.0, Node.js 22.20.0 / npm 10.9, Docker 29.1.3 with buildx 0.23.0.

**F1. A vendored Go build works with no network.**
- Setup: `go mod vendor` in the checkout, then a build inside a Linux network namespace with no interfaces
  (`unshare -rn`), with `GOPROXY=off`, `GOFLAGS=-mod=vendor`, an **empty** `GOMODCACHE` and a fresh `GOCACHE`.
- Result: `go vet` and `go test ./pkg/...` passed, and both binaries built.
- `curl https://proxy.golang.org` failed inside the namespace, confirming there was no network.
- `vendor/` is 43 MB.

**F2. The driver patch survives vendoring.**
- `vendor/modules.txt` records `# github.com/go-sql-driver/mysql v1.10.0 => ./third_party/go-sql-driver-mysql`.
- The patched sources are copied into `vendor/github.com/go-sql-driver/mysql`.
- Re-run `go mod vendor` after any `go.mod` change, or Go stops with "inconsistent vendoring".

**F3. mage cannot run from `vendor/`.** Only the libraries the SDK build package imports (`mage/mg`,
`mage/sh`) are vendored, not mage's `main` package. Offline builds use `scripts/build-backend.sh` (same
flags, §2), or a mage binary copied to the server (`go install github.com/magefile/mage@v1.15.0` on a
connected machine; it's a static binary).

**F4. The frontend can be rebuilt offline from a bundled npm cache.**
- On the connected machine: `npm ci --cache <dir>`.
- On the server, inside a no-network namespace: `npm ci --offline --cache <dir>`. It "added 1164 packages in
  26s"; then 9/9 test suites (57 tests) passed and webpack built `dist/`.

**F5. The built frontend is platform-independent.** `dist/*.js` is plain JavaScript. Building it once on any
machine and shipping `dist/` is valid, and is the default in the offline bundle.

**F6. npm installs are platform-specific.**
- `.npmrc` sets `ignore-scripts=true` (supply-chain hardening); the build needs no install scripts.
- The `@swc/core` compiler comes as a per-platform optional package (`@swc/core-linux-x64-gnu`). So a
  `node_modules/` or npm cache made on Linux x86_64 with glibc works only on Linux x86_64 with glibc.
- Alpine (musl), arm64 or macOS build hosts need their own `npm ci`.

**F7. The container build works.**
- `docker build -f ci/Dockerfile.build --target artifact --output type=local,dest=out .` ran:
  - in the Node stage: `npm ci`, typecheck, lint, jest (9 suites, 57 tests), the webpack build;
  - in the Go stage: `go vet`, `go test`, the driver tests, `build-backend.sh`, `package.sh`, `verify-package.sh` → `PASS`.
- It wrote `kotak-starrocks-datasource-0.1.0.zip` (18 MB) and the `.sha256` to `out/`. Images used:
  `node:22-bookworm-slim` and `golang:1.25-bookworm`.
- **`golang:1.25-bookworm` has `python3` but no `zip`, `unzip` or `file`.**
  - `package.sh` falls back to `python3 -m zipfile`, which keeps the binaries' `0755` mode in the zip.
  - `verify-package.sh` reads the executable bit from the zip entry's metadata, not from extracted files,
    because Python does not restore permissions on extraction.
  - The static-ELF check is skipped when `file` is missing.
- The first container run failed on exactly this, before the metadata check was added. That shows the gate
  works.
- The same zip, re-checked on a host with `file`, showed both binaries are static ELFs for the right
  architecture. See §4, R2.

**F8. Toolchain versions.**

| Tool | Requirement | Notes |
|---|---|---|
| Go | ≥ 1.24.3 (`go.mod`), tested 1.25.0 | 1.26 is fine. Set `GOTOOLCHAIN=local` so Go never tries to download a toolchain; the scripts do this |
| Node.js | 22.x (`.nvmrc` says 22) | npm prints an `EBADENGINE` warning because a dev dependency (`which@7`) wants ≥ 22.22.2. It is harmless; prefer the latest 22.x on build agents |
| mage | v1.15.0 | Optional. `scripts/build-backend.sh` replaces it |
| zip/unzip, sha256sum, file | coreutils / distro packages | `package.sh` and `verify-package.sh` fall back to `python3 -m zipfile` if zip/unzip are missing. `file` is optional |
| Docker | BuildKit (Docker ≥ 23 or buildx) | Only for R2 and the integration/e2e tests |

The scripts assume **Linux**: GNU coreutils and `sha256sum`.

**F9. Network endpoints an online build uses.**

| Purpose | Default endpoint | Corporate alternative |
|---|---|---|
| npm packages | `https://registry.npmjs.org/` | npm mirror or proxy (Artifactory/Nexus, or an Azure Artifacts npm feed with an npmjs upstream); set `registry=` in `.npmrc` or `npm_config_registry` |
| Go modules | `https://proxy.golang.org`, checksums at `https://sum.golang.org` | Go proxy (Artifactory/Nexus/Athens) via `GOPROXY`; set `GONOSUMDB`/`GOSUMDB` as the mirror requires. **Or vendor (F1) and need nothing** |
| mage (if used) | proxy.golang.org (`go run github.com/magefile/mage@v1.15.0`) | Pre-install the binary, or use `build-backend.sh` |
| Node.js / Go toolchains | `GoTool@0` / `NodeTool@0` download from the internet | Pre-install on agents, or use tool caches |
| Signing | `https://grafana.com` (sign-plugin API) | No alternative; only needed for a private signature |
| Docker base images | Docker Hub `node`, `golang` | Mirror them into the org's ECR and pass `NODE_IMAGE` / `GO_IMAGE` |

**F10. Sizes.**
- `node_modules` ≈ 832 MB.
- The bundled npm cache is most of the offline bundle's size.
- `vendor/` is 43 MB.
- The offline bundle with npm cache is 127 MB.
- The plugin zip is 18 MB.
- Each binary is ~25 MB.

**F11. Jest needs `--forceExit`.** `@grafana/ui` leaves timers open after the tests finish. `npm run test:ci`
already includes `--forceExit`; without it the job hangs after printing the results.

**F12. Delivery-side facts** (from `docs/AGENT_GUIDE.md` §7 and §10; verify in the org repos):
- Feed: `Observability`.
- Upload pipeline: `pipelines/grafana-plugin-upload.yml`. It uses `UniversalPackages@0` download → unzip →
  `S3Upload@1`, service connections `GrafanaS3Upload{Dev,Uat,Prod}`, and agent pools `OnPremUnix`,
  `OnPrimeProdUnix`, `OnPremDRUnix`. It has no DR bucket mapping.
- The image pipelines in `blessed-images` call the shared template
  `Builder Tools/cicd-templates@tar-change-fed-attestation` →
  `templates/custom-stage/push-image-to-central-ecr.yaml`, with `trigger: none` and an `environment:
  Non-Prod | Prod` parameter. Their Dockerfiles pass `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` build args, which
  implies agents sit behind a corporate proxy.
- The deployment doc lists "check build agents can reach npm/Go module sources (internal mirrors)" as an open
  item. **This is the main unknown for pipeline design (§5, T1).**

---

## 4. Build recipes

Pick the recipe that matches what the build agents can do (§5, T2).

### R1. Native: agent has Go and Node.js, plus internet or mirrors

```bash
npm ci --no-audit --no-fund
npm run typecheck && npm run lint && npm run test:ci
go vet ./... && go test ./pkg/... && (cd third_party/go-sql-driver-mysql && go test -run TestAuth .)
npm run build && ./scripts/build-backend.sh
# optional: npx @grafana/sign-plugin@latest --rootUrls <urls>   (GRAFANA_ACCESS_POLICY_TOKEN in env)
./scripts/package.sh && ./scripts/verify-package.sh
```
Pipeline draft: `ci/azure-pipelines.yml`.

### R2. Container: agent has Docker only

```bash
docker build -f ci/Dockerfile.build --target artifact --output type=local,dest=out .
# behind the corporate network:
docker build -f ci/Dockerfile.build --target artifact --output type=local,dest=out \
  --build-arg NODE_IMAGE=<ecr>/node:22-bookworm-slim --build-arg GO_IMAGE=<ecr>/golang:1.25-bookworm \
  --build-arg NPM_REGISTRY=https://<npm-mirror>/ --build-arg GOPROXY=https://<go-mirror> \
  [--build-arg HTTPS_PROXY=… --build-arg NO_PROXY=…] .
```
- With `vendor/` in the build context (`go mod vendor` first), the Go stage needs no module proxy.
- `--build-arg RUN_TESTS=false` skips the checks. Use it only with human agreement.
- The output is unsigned. To sign, use R1, or add a stage that runs `sign-plugin` on `dist/` before
  `package.sh`, passing the token as a BuildKit secret (`--secret id=…`), never as a build arg.

Pipeline draft: `ci/azure-pipelines-docker.yml`.

### R3. Air-gapped server: no internet and no mirrors

**On a connected Linux x86_64 machine:**
```bash
./scripts/make-offline-bundle.sh                    # source + vendor/ + prebuilt frontend dist/   (small)
./scripts/make-offline-bundle.sh --with-npm-cache   # + npm cache, so the server can rebuild the frontend (127 MB)
# → offline-bundle/kotak-starrocks-datasource-<ver>-offline-src.tar.gz (+ .sha256)
```
- The bundle contains **git-tracked files only**, so commit or stage changes first.
- Vendoring goes straight into the bundle; nothing is added to the working tree.

**On the server** (Go ≥ 1.24.3; Node 22 only to rebuild the frontend):
```bash
sha256sum -c kotak-starrocks-datasource-<ver>-offline-src.tar.gz.sha256
tar xzf kotak-starrocks-datasource-<ver>-offline-src.tar.gz && cd kotak-starrocks-datasource-<ver>
./scripts/build-offline.sh                          # tests + build + package + verify, with GOPROXY=off
#   REBUILD_FRONTEND=1 ./scripts/build-offline.sh   # rebuild dist/ from npm-cache/ (needs Node 22, Linux x86_64 glibc)
#   SKIP_TESTS=1 ./scripts/build-offline.sh
```
Both modes were verified with no network (F1, F4).

### R4. Hybrid: connected stage → restricted stage

A first job on a connected pool runs `make-offline-bundle.sh` and publishes the tarball as a pipeline
artifact. A second job on the restricted pool downloads it and runs `build-offline.sh`. Use this when only
some agents can reach mirrors.

---

## 5. Tasks: preparing the pipelines

### T1. Discover the org's conventions (read-only)

Read these and write down the answers before writing any YAML:

| Where | What to find |
|---|---|
| `obser-aws-deploy-config/pipelines/grafana-plugin-upload.yml` | - How plugins are named in the feed: package name, version format, zip file name. The `plugin` parameter values look like `grafana-lokiexplore-app-1.0.26` and `yesoreyeram-infinity-datasource-2.11.1.linux_amd64`.<br>- The download task inputs.<br>- The unzip target (`<artifact_name>`).<br>- Pools and service connections. |
| `obser-aws-deploy-config/pipelines/grafana-deploy.yml`, `grafana-deploydev.yml` | Pipeline style: parameters, pools, templates, approvals |
| `Builder Tools/cicd-templates` (branch used: `tar-change-fed-attestation`) | - Templates for building and publishing non-image artifacts, e.g. a Universal Package or attestation step.<br>- Whether builds **must** go through a template.<br>- Required stages (scans, attestation, SBOM). |
| `blessed-images/grafana-oss/*/` pipeline YAMLs | How proxy settings, environments (`Non-Prod`/`Prod`) and approvals are handled |
| Any existing Go or Node.js build pipeline in the org's build repos | - Which pool has Go/Node.<br>- `GOPROXY`, npm registry, `.npmrc` handling (`npmAuthenticate@0`).<br>- Tool caches. |
| Azure DevOps project settings, if accessible | Agent pool capabilities (`docker`, `go`, `node`), variable groups, the feed's upstream sources, service connections |

**Decide from the findings:**
- Can agents reach the npm registry and the Go proxy, directly, through a proxy, or through mirrors?
- Do agents have Docker?
- Is a shared template mandatory?
- What exact package naming does the upload pipeline expect?

### T2. Choose the recipe

| Agents can… | Recipe |
|---|---|
| Run Go + Node and reach npm/Go (internet or mirrors) | **R1** (`ci/azure-pipelines.yml`) |
| Run Docker and pull base images (from ECR) and reach mirrors, or use vendored Go | **R2** (`ci/azure-pipelines-docker.yml`) |
| Reach nothing external | **R3** with a bundle made elsewhere, or **R4** if one pool is connected |
| Only run builds through a mandatory shared template | Fit R1 or R2 into that template's extension points. Do not bypass the template |

### T3. Put the source in the org's source control
The canonical repo today is GitHub `sirjebbington/grafana-custom-mysql-plugin`. A human must decide where the
source lives for org pipelines, for example a new Azure Repos repo imported from GitHub. Also confirm branch
policies (PR validation build, reviewers).

### T4. Configure mirrors and proxies (R1/R2)

- **Go:** pipeline variable `GOPROXY=https://<go-mirror>`. Set `GOSUMDB`/`GONOSUMDB` as the mirror requires.
  Keep `GOTOOLCHAIN=local`. If there is no Go mirror, commit or generate `vendor/` and build with
  `-mod=vendor` (F1).
- **npm:** set the registry, for example in a pipeline-generated `.npmrc` or `npm_config_registry`. For Azure
  Artifacts npm feeds, use `npmAuthenticate@0`. Do not commit registry credentials. Keep `ignore-scripts=true`.
- **Docker (R2):** mirror `node:22-bookworm-slim` and `golang:1.25-bookworm` into ECR and pass `NODE_IMAGE`,
  `GO_IMAGE`, and the proxy build args the org uses (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`).

### T5. CI (validation) pipeline
- Trigger on PRs to the main branch.
- Stages:
  1. install;
  2. typecheck, lint, `test:ci`;
  3. go vet/test plus the driver tests;
  4. build;
  5. package;
  6. `verify-package.sh`;
  7. publish the zip as a **pipeline artifact**.
- No publishing to the feed.
- Start from `ci/azure-pipelines.yml` or `ci/azure-pipelines-docker.yml`.

### T6. Release pipeline
- **Manual trigger, or on tag `v<version>`.** Add a guard step that fails if the tag does not equal
  `package.json`'s version.
- **Optional signing**, depending on the signing decision (`docs/QUESTIONS.md` G1, `docs/AGENT_GUIDE.md` §8):
  - Needs the `GRAFANA_ACCESS_POLICY_TOKEN` secret.
  - The plugin ID prefix must match the Grafana Cloud org slug.
  - Root URLs must match each environment's `server.root_url`.
- **Gate:** `verify-package.sh`. When signing, also check that `MANIFEST.txt` exists.
- **Publish** the Universal Package to `Observability` using the naming found in T1. Use
  `UniversalPackages@0`, or the shared template if one exists. **Needs approval.** Use an Azure DevOps
  environment with approvers, as the org does for Prod.
- **Notes:** record the zip's sha256 in the release notes or build summary.

### T7. Optional integration stage (nightly or before a release)
On a pool with Docker and about 4 GB of RAM:
```bash
npm run build && ./scripts/build-backend.sh amd64
./scripts/e2e.sh up && ./scripts/e2e.sh test && ./scripts/e2e.sh down
STARROCKS_IT_ADDR=127.0.0.1:19030 STARROCKS_IT_KEY=$PWD/dev/jwt/key.pem go test ./pkg/mysql -run TestIntegrationStarRocksJWT -count=1
```
- The images must be pullable; mirror them if needed.
- When the StarRocks team confirms their real version (`docs/QUESTIONS.md` S3), update the image tag in
  `dev/e2e/docker-compose.yaml`.

### T8. Connect to delivery (in `obser-aws-deploy-config`)
- Add `kotak-starrocks-datasource-<version>`, using the naming from T1, to the `plugin` parameter values of
  `pipelines/grafana-plugin-upload.yml`.
- Optionally chain the release pipeline to it as a pipeline resource. **Needs approval.**
- The Helm values, init container and datasource changes are described in `docs/AGENT_GUIDE.md` §10. They
  belong to deployment, not the build.

### T9. Security and compliance
- Run any scanning or attestation the org's templates require. The template branch name
  `tar-change-fed-attestation` suggests attestation.
- Optionally add `govulncheck ./...` and `npm audit --omit=dev` as informational steps.
- Keep `.npmrc` `ignore-scripts=true`.
- Never echo secrets. Sign-plugin reads the token from its environment.

### T10. Validate
- Run the CI pipeline on a feature branch and download the `plugin-zip` artifact.
- Run `./scripts/verify-package.sh <zip>` locally. Optionally unzip it into `dist/` and run `scripts/e2e.sh`.
- Report:
  - pipeline links;
  - run times;
  - artifact name, sha256 and size;
  - every decision taken in T1 and T2.

---

## 6. Troubleshooting builds

| Error | Cause | Fix |
|---|---|---|
| `Unknown target specified: "build:linuxAMD64"` (mage) | Wrong target name | `mage build:linux build:linuxARM64`, or `./scripts/build-backend.sh` |
| `go: inconsistent vendoring` / `… is replaced in go.mod, but not marked as replaced in vendor/modules.txt` | `vendor/` is out of date with `go.mod` | Re-run `go mod vendor`, or `make-offline-bundle.sh` |
| `main module … does not contain package …/third_party/go-sql-driver-mysql` | Ran `go test ./third_party/...` from the repo root; the driver is its own module | `(cd third_party/go-sql-driver-mysql && go test -run TestAuth .)` |
| Login fails at runtime with `unknown auth plugin` / `StarRocks requested an auth plugin the driver refused` | The `replace` line in `go.mod` was removed or vendoring skipped it | Restore `replace github.com/go-sql-driver/mysql => ./third_party/go-sql-driver-mysql`, re-vendor, rebuild |
| `go: downloading go1.x … toolchain` or `toolchain not available` | Go tried to fetch a newer toolchain | `GOTOOLCHAIN=local` and Go ≥ 1.24.3 |
| `npm ERR! code ENOTCACHED` with `--offline` | npm cache incomplete or from another platform (F6) | Recreate with `make-offline-bundle.sh --with-npm-cache` on Linux x86_64 glibc |
| `npm warn EBADENGINE … which@7.0.0 … node ^22.22.2` | Older Node 22 patch release | Harmless; upgrade Node 22 when convenient |
| Jest prints results but the job never ends | Open handles from `@grafana/ui` | Use `npm run test:ci` (has `--forceExit`) |
| ESLint `'React' must be in scope when using JSX` | Lint config without the repo's overrides | Run `npm run lint` from the repo root; `eslint.config.mjs` turns this off for the automatic JSX runtime |
| webpack `unable to locate '…/README.md' glob` | `README.md`, `LICENSE` or `CHANGELOG.md` missing at the repo root | Keep these files; they are copied into the package |
| webpack `Can't resolve 'grafana-public-path'` for a path outside `src/` | A copy of the repo (e.g. a staging folder) inside the working tree; webpack globs `**/module.ts` | Stage copies outside the repo; `make-offline-bundle.sh` uses a temp dir |
| `verify-package.sh`: `plugin.json version … FAIL` | `%VERSION%` was not replaced, or `package.json` changed after the build | Rebuild the frontend after bumping the version |
| `verify-package.sh`: binary not executable | Packaged on a filesystem without exec bits | Build on Linux. `package.sh` runs `chmod 0755` before zipping |
| Grafana rejects the signature | Root URL mismatch, or files changed after signing | Sign last, before `package.sh`; root URLs must equal `server.root_url` |

---

## 7. Build-related files

| File | Purpose |
|---|---|
| `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc` | Frontend dependencies, scripts (`build`, `typecheck`, `lint`, `test:ci`, `sign`), Node version, `ignore-scripts=true` |
| `webpack.config.ts`, `jest.config.js`, `eslint.config.mjs`, `tsconfig.json` | Extend `.config/` for Grafana 12.0 (bundle `react/jsx-runtime`, automatic JSX runtime) |
| `.config/` | Scaffolded by `@grafana/create-plugin` 7.16.0. Do not edit |
| `go.mod`, `go.sum`, `Magefile.go` | Go module (SDK v0.277.0), the `replace` for the patched driver, mage targets |
| `third_party/go-sql-driver-mysql/` | Patched MySQL driver, its own Go module (`KOTAK_PATCH.md`) |
| `scripts/plugin-meta.sh` | Reads ID, executable and version without python or jq; sourced by the other scripts |
| `scripts/build-backend.sh` | `go build` equivalent of `mage build:linux build:linuxARM64`; works offline with `vendor/` |
| `scripts/package.sh` | Creates the zip in the delivery layout, plus `.sha256` |
| `scripts/verify-package.sh` | Release gate for the zip |
| `scripts/make-offline-bundle.sh`, `scripts/build-offline.sh` | Air-gapped build (R3/R4) |
| `ci/azure-pipelines.yml` | Draft native pipeline (R1) |
| `ci/azure-pipelines-docker.yml`, `ci/Dockerfile.build`, `.dockerignore` | Draft container pipeline (R2) |
| `scripts/e2e.sh`, `dev/e2e/`, `pkg/mysql/starrocks_integration_test.go`, `tools/devjwt/` | Integration and e2e tests (T7) |
