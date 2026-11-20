# Regenerating the diagrams

The diagrams are [Archify](https://github.com/tt-a1i/archify) candidates (`../source/*.json`). Archify
renders each into a checked, interactive HTML page (`../interactive/`), and `png.sh` turns that page into
the phone-friendly PNG used in the documents (`../NN-name.png`).

Every source box that names code cites its file and lines at commit `4107a6f`. Archify checks those
citations against that commit (`--repo-root`).

## Requirements

- Docker, with the `mcr.microsoft.com/playwright:v1.52.0-noble` image. It has Node 22 and Chromium, which
  Archify's browser check needs.
- A checkout of Archify (`ARCHIFY_HOME`), version 3.2.0 was used. It is used from the checkout, with no
  install.
- This repository (`REPO_ROOT`), and the app's `node_modules` (`APP_NODE_MODULES`) for Playwright.

## Steps for one diagram

```bash
export ARCHIFY_HOME=~/project1/archify REPO_ROOT=~/kotak-starrocks-datasource
export APP_NODE_MODULES=$REPO_ROOT/plugins/kotak-starrocks-logs-app/node_modules
T=$REPO_ROOT/plugins/kotak-starrocks-logs-app/docs/architecture/diagrams/tools

mkdir -p /tmp/arch/05-context && cd /tmp/arch
cp $T/../source/05-context.json 05-context/candidate.json      # edit it here
$T/archify.sh finalize sequence 05-context/candidate.json 05-context/context.html \
  --repo-root /repo --quality showcase --json                   # validate + render + browser check
$T/png.sh 05-context/context.html 05-context.png 700             # 1000 for the wide lifecycle diagram
```

Then copy the candidate back to `../source/`, the HTML to `../interactive/`, and the PNG next to the
documents.

| Source | Archify type | PNG width |
|---|---|---|
| 01-system, 07-config | architecture | 700 |
| 02-startup, 04-query, 05-context, 06-scroll | sequence | 700 |
| 03-selection | workflow | 700 |
| 08-screens | lifecycle | 1000 |
| 09-code, 10-scenes | tree | 700 |

After a code change, update `meta.repository.revision` and the cited line ranges, then re-run. Archify
fails a citation that does not exist at that revision.
