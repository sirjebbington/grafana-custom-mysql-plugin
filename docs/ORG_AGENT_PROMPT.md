# Prompt for the org Claude agent

Copy everything below the line into Claude Code, started in the root of this repository on the org PC.
Fill in the **INPUTS** block first. Leave a value as `unknown` if you don't have it; the agent will ask or
work around it.

---

You are working in the `kotak-starrocks-datasource` repository: a Grafana backend datasource plugin that queries
StarRocks as the signed-in user by forwarding their IDAM JWT. The plugin is already implemented and tested. Your
job is to:
1. verify it builds on this PC;
2. learn the organisation's build and deployment conventions;
3. prepare the build pipelines;
4. prepare, but not apply, the UAT deployment change.

Work step by step. Stop at every **CHECKPOINT** and wait for me to reply "continue" before going on.

## INPUTS (filled in by me)

```
PLUGIN_REPO_PATH        = <path of this repo on this PC>
DEPLOY_CONFIG_REPO      = <path to obser-aws-deploy-config>          BRANCH = <main>
CICD_TEMPLATES_REPO     = <path to "Builder Tools/cicd-templates">   BRANCH = <tar-change-fed-attestation>
BLESSED_IMAGES_REPO     = <path to blessed-images>                   BRANCH = <main>
HELM_CHART_REPO         = <path to helm-charts/grafana, tag 8.3.4>
OTHER_BUILD_REPOS       = <paths of repos with existing Go or Node.js Azure pipelines, to copy conventions from>
AZURE_DEVOPS            = <org/project URL>; az CLI logged in: <yes/no>
AWS_READ_ACCESS         = <yes/no; profile name>  (only used for read-only `aws s3 ls`)
PLUGIN_SOURCE_HOME      = <Azure Repos repo where the plugin source should live, or "decide later">
SIGNING                 = <unsigned-allowlist | private-signature | unknown>
TOKEN_SOURCE            = <id_token | access_token | unknown>
USERNAME_CLAIM          = <sub | user_name | unknown>
ANSWERS_FROM_TEAMS      = <answers to docs/QUESTIONS.md by ID, e.g. "I1: grafana-uat client id = …; S7: SAN includes …", or "none yet">
```

## Rules (apply to every step)

1. Read `CLAUDE.md` first. Follow the rules in `docs/AGENT_GUIDE.md` §0 and `docs/BUILD_PIPELINE_GUIDE.md` §0.
   If anything here conflicts with them, they win.
2. **Ask me before every outward or irreversible action:**
   - pushing to any remote or opening a PR;
   - creating or running Azure DevOps pipelines;
   - publishing to the `Observability` feed;
   - signing with a Grafana Cloud token;
   - running `grafana-plugin-upload.yml` or `grafana-deploy.yml`;
   - changing shared templates.

   Read-only commands and local builds don't need approval.
3. Work on new branches only. Never commit to `main` or to another team's protected branch.
4. **Secrets:**
   - Never print, log or commit secrets or tokens.
   - Mask account IDs as `****1234`.
   - Secrets belong in Azure DevOps secret variables or variable groups only.
5. **Do not change product code** (`pkg/`, `src/`, `third_party/`, `go.mod`, `webpack.config.ts`, `.config/`).
   If a change seems necessary, explain why, propose the patch, and wait.
6. **Do not invent values.** If something isn't in the INPUTS, the repos or the docs, write it as
   `TODO(<question id or owner>)` and list it in the open items. That covers pool names, feed naming,
   hostnames, client IDs, issuers, user-name formats and CA paths.
7. **Keep a running log** in `docs/ORG_ROLLOUT_LOG.md` on branch `chore/org-rollout-log`. Record:
   - every step's commands, results and durations;
   - findings, with evidence as `repo@branch:path:line`;
   - decisions and open items.

   Update it at each checkpoint.
8. Cite evidence for every claim about the org repos. Mark guesses with `INFERRED:`.

## Step 1: Orient (read-only)

1. Read these in full:
   - `CLAUDE.md`, `README.md`
   - `docs/AGENT_GUIDE.md`
   - `docs/BUILD_PIPELINE_GUIDE.md`
   - `docs/QUESTIONS.md`
   - `docs/research/README.md`, `docs/research/06-starrocks-jwt-auth-source-analysis.md`
2. Check the toolchain and record versions:
   - `go version`, `node -v`, `npm -v`
   - `docker version` and `docker buildx version`
   - `git --version`, `az --version`, `aws --version`
   - `command -v zip unzip python3 file sha256sum`
3. Check network reach without changing anything:
   - Can `npm view react version` reach a registry, and which one (`npm config get registry`)?
   - Can `go list -m github.com/grafana/grafana-plugin-sdk-go@v0.277.0` reach a module proxy
     (`go env GOPROXY`)?
   - Is a proxy configured (`env | grep -i _proxy`, values masked)?
4. Write a 10–15 bullet summary of the plugin, the build, and the deployment path into the log.

## Step 2: Verify the plugin builds and passes tests on this PC

Choose the recipe from `docs/BUILD_PIPELINE_GUIDE.md` §4 that fits what Step 1 found.

- **Internet or mirrors reachable (R1):**
  ```bash
  npm ci --no-audit --no-fund
  npm run typecheck && npm run lint && npm run test:ci
  go vet ./... && go test ./pkg/... && (cd third_party/go-sql-driver-mysql && go test -run TestAuth .)
  npm run build && ./scripts/build-backend.sh
  ./scripts/package.sh && ./scripts/verify-package.sh
  ```
- **Only Docker works (R2):**
  `docker build -f ci/Dockerfile.build --target artifact --output type=local,dest=out .`, adding the mirror
  build args if needed. Then `./scripts/verify-package.sh out/*.zip`.
- **No network at all:** tell me. I will bring an offline bundle made with `scripts/make-offline-bundle.sh`
  (R3), and you run `./scripts/build-offline.sh`.

If Docker is available with at least 4 GB free RAM and the images can be pulled, also run the end-to-end test
(`docs/AGENT_GUIDE.md` §5.3): `./scripts/e2e.sh up && ./scripts/e2e.sh test && ./scripts/e2e.sh down`.

If anything fails, use the troubleshooting tables (`BUILD_PIPELINE_GUIDE.md` §6, `AGENT_GUIDE.md` §11).
Record:
- which recipe was used;
- results and durations;
- the zip's name, size and sha256.

**CHECKPOINT 1:** report build and test results, toolchain and network findings. Wait.

## Step 3: Discover the org's conventions (read-only)

Do `docs/BUILD_PIPELINE_GUIDE.md` §5 task T1 completely, using the repos in INPUTS. At minimum, answer each of
these with evidence:

1. `grafana-plugin-upload.yml`:
   - the exact Universal Package name, version and zip naming the existing plugins use;
   - the download and unzip steps;
   - the `<artifact_name>` folder;
   - pools and service connections;
   - whether there is a DR mapping.
2. Whether pipelines must use templates from `cicd-templates`. Which template fits building and publishing a
   non-image artifact, and which stages it requires (scans, attestation, SBOM, approvals/environments).
3. How existing pipelines reach npm and Go: mirrors, `.npmrc` handling, `npmAuthenticate`, `GOPROXY`, proxy
   variables, tool installation.
4. Which agent pools have Docker, Go and Node, as far as the YAML and capabilities show.
5. How the org handles approvals (`Non-Prod`/`Prod` environments), variable groups and secret variables.

Then read the deployment side for `docs/AGENT_GUIDE.md` §10, without changing anything:
- `envs/dev-common-shared`, `envs/uat-obs1-common` and `envs/prod-obs1-common`, file `grafana-values.yml`:
  - `extraInitContainers` (`s3-sync-init`);
  - `grafana.ini.plugins`;
  - `datasources.datasources.yaml`, especially the existing StarRocks `type: mysql` entries;
  - `extraObjects` (SecretProviderClass objects and aliases, including `domain-kotak-cacerts`).
- If `AWS_READ_ACCESS = yes`, confirm an existing plugin's S3 layout read-only:
  `aws s3 ls --recursive s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/<existing-plugin-folder>/ | head`.

Write an "Org conventions" section into the log, with a table of question, answer and evidence.

**CHECKPOINT 2:** present the following, then wait for my approval:
- the findings;
- the recipe you recommend (`BUILD_PIPELINE_GUIDE.md` §5 T2) and why;
- the exact list of files you plan to create or change, in which repo and on which branch.

## Step 4: Build the pipelines (T3–T6, T9)

Only the plan I approved at Checkpoint 2.

1. **Location.** Put the pipeline YAML where I approved: `PLUGIN_SOURCE_HOME`, or this repo's `ci/` folder for
   now. Use branch `feature/kotak-starrocks-pipelines`.
2. **CI pipeline** (PR validation):
   - install, then typecheck/lint/`test:ci`, then `go vet`/`go test` and the driver tests;
   - then build (`npm run build` + `./scripts/build-backend.sh`), `./scripts/package.sh` and
     `./scripts/verify-package.sh`;
   - then publish the zip as a pipeline artifact.
   - No feed publishing.
   - Start from `ci/azure-pipelines.yml` (native) or `ci/azure-pipelines-docker.yml` (Docker). Adapt pool,
     templates, mirrors and tool setup to the Step 3 findings.
3. **Release pipeline:**
   - manual trigger, or on tag `v<version>`;
   - a guard that fails if the tag ≠ `package.json` version;
   - an optional signing step, only if `SIGNING = private-signature`, using `GRAFANA_ACCESS_POLICY_TOKEN` from a
     secret variable;
   - `verify-package.sh` as the gate;
   - a Universal Package publish to `Observability`, using the naming found in Step 3, behind an approval
     environment;
   - the zip's sha256 in the run summary.
4. **Mirrors.** Configure them the org way (`BUILD_PIPELINE_GUIDE.md` §5 T4). If there is no Go mirror,
   propose vendoring (`go mod vendor`, `-mod=vendor`) instead of reaching out to the internet.
5. **Compliance.** Add any scanning or attestation the templates require (T9).
6. **Dry run locally.** Run the same commands the pipeline runs and confirm `verify-package.sh` passes.

**CHECKPOINT 3:** show full diffs of the pipeline files and a short description of each stage. Ask for approval
to push the branch, create the pipelines in Azure DevOps, and run the CI pipeline on the branch.
After approval:
- run it;
- download the `plugin-zip` artifact and run `./scripts/verify-package.sh` on it;
- record run links, durations and the sha256.
- Do **not** run the release pipeline's publish step unless I approve it separately.

## Step 5: Optional integration stage (T7)

If Step 3 shows a Docker-capable pool with at least 4 GB RAM and the e2e images can be pulled or mirrored
(`starrocks/allin1-ubuntu:4.0.10`, `grafana/grafana-oss:12.0.1-security-01`,
`ghcr.io/navikt/mock-oauth2-server:2.1.10`), propose a nightly or manual integration stage. Implement it only
if I approve.

## Step 6: Prepare the delivery and deployment change (draft only, `docs/AGENT_GUIDE.md` §10)

In `DEPLOY_CONFIG_REPO`, on branch `feature/kotak-starrocks-datasource`:

1. **`pipelines/grafana-plugin-upload.yml`:** add `kotak-starrocks-datasource-<version>` to the `plugin`
   parameter values, matching the existing naming exactly.
2. **`envs/dev-common-shared/grafana-values.yml`** (first rollout; plugin-load smoke test only):
   - an `aws s3 cp …/kotak-starrocks-datasource-<version> /grafana/plugins/ --recursive` line in
     `s3-sync-init`. The `chmod` line already exists in dev; verify.
   - `allow_loading_unsigned_plugins: kotak-starrocks-datasource` if `SIGNING = unsigned-allowlist`.
   - No datasource; dev has no StarRocks.
3. **`envs/uat-obs1-common/grafana-values.yml`:**
   - The same init-container copy line, **plus** the
     `find /grafana/plugins -type f -name "gpx_*" -exec chmod +x {} \;` line, which UAT lacks today.
   - The unsigned allow-list if applicable.
   - **One** new datasource entry, built from the `AGENT_GUIDE.md` §10.4c template:
     - org 3;
     - uid `app01961-ds-starrocks-obs-logs-public` (≤ 40 chars);
     - `oauthPassThru: true`, `tlsAuthWithCACert: true`;
     - `tokenSource` and `usernameClaim` from INPUTS;
     - `serverName` and the CA file path from `ANSWERS_FROM_TEAMS`, or `TODO(S7)` / `TODO(10.3)`.
   - Do not touch any existing `type: mysql` entry. `datasources.yaml` has `prune: true`.
4. **Prod:** do not change it yet. Describe the prod diff in the log only.
5. **Validate:**
   - Run a YAML lint on the changed files.
   - If `HELM_CHART_REPO` is available, render with
     `helm template common-grafana <chart> -f envs/uat-obs1-common/grafana-values.yml`.
   - Show that the rendered init container, `grafana.ini` and datasource ConfigMap contain the new lines.

**CHECKPOINT 4:** show:
- the full diffs;
- the rendered snippets;
- the rollout plan: dev smoke test → UAT test with the StarRocks team → prod;
- which `docs/QUESTIONS.md` items still block UAT.

Do not push, open a PR, or run any pipeline without my approval.

## Step 7: Open questions

Compare `ANSWERS_FROM_TEAMS` with `docs/QUESTIONS.md` and list what is still unanswered, in this priority
order:
1. IDAM: I5, I1, I3, I4, I2
2. StarRocks: S1, S5, S7, S4, S3, S2, S6, S12
3. Ours: G1, G2, G3

Draft two short messages, one for the IDAM team and one for the StarRocks team, with only the unanswered
questions (copy their wording from `docs/QUESTIONS.md`). Put them in the log. Do not send anything.

## Step 8: Final report

Update `docs/ORG_ROLLOUT_LOG.md` and reply with:
- what was done;
- branches and PRs, with links;
- pipeline runs and the artifact (name, size, sha256);
- decisions taken and why;
- everything waiting for my approval;
- open questions with owners;
- the next three actions.

Ask me whether to push the log branch.

## Stop and ask immediately if

- you lack access to a repo, Azure DevOps or AWS;
- a step would publish, sign, deploy, or change another team's repo;
- a build or test fails and the fix needs product code;
- the org conventions contradict these instructions or the docs.
