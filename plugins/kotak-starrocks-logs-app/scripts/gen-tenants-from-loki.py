#!/usr/bin/env python3
"""Generates the app's per-tenant settings (a provisioning/plugins file) from the Loki data sources that
deploy-config already defines, so trace patterns are written once.

How tenants are matched: a Loki data source carries its tenant in the X-Scope-OrgID header
(e.g. app-01996-frontlineplatforms-cmm); the StarRocks view of the same tenant is
vw_eks_app_logs_<app_id> with app_id = that tenant with "-" replaced by "_"
(app_01996_frontlineplatforms_cmm). A Loki derived field that links to a Tempo data source becomes the
tenant's trace setting.

  python3 scripts/gen-tenants-from-loki.py envs/prod-obs1-common/grafana-values.yml \\
      --datasource-uid app-logs-starrocks-db --overrides tenants-overrides.yaml > kotak-starrocks-logs-app.yaml

--overrides adds to or replaces settings per app_id (level source, patterns, a trace regex for tenants whose
Loki data source has none); its "default" entry becomes tenants.default. --settings adds the other jsonData
keys (maxScanHours, defaultTimeRange, ...). Only orgs that have a kotak-starrocks-datasource get an entry.

Several StarRocks databases: each is its own kotak-starrocks-datasource entry in the values file. Per org,
datasourceUid is --datasource-uid when that data source exists in the org, else the org's first one;
--pin-datasources also writes the explicit "datasources" list (picker allowlist and order). Without it the
app offers every kotak-starrocks-datasource instance of the org. Overrides may use "<datasourceUid>/<app_id>"
keys for settings that only apply in one database.

After Loki is removed, keep the generated file and edit it directly (it is then the only source).
"""
import argparse
import sys

import yaml


def walk_datasources(node):
    """Yields every provisioned data source (a dict with name and type) found in the values file."""
    if isinstance(node, dict):
        for v in node.values():
            yield from walk_datasources(v)
    elif isinstance(node, list):
        for item in node:
            if isinstance(item, dict) and "type" in item and "name" in item:
                yield item
            else:
                yield from walk_datasources(item)


def loki_tenant(ds):
    """X-Scope-OrgID of a Loki data source (jsonData.httpHeaderNameN + secureJsonData.httpHeaderValueN)."""
    jd, sec = ds.get("jsonData") or {}, ds.get("secureJsonData") or {}
    for k, v in jd.items():
        if k.startswith("httpHeaderName") and str(v).lower() == "x-scope-orgid":
            return sec.get("httpHeaderValue" + k[len("httpHeaderName"):])
    return None


def trace_setting(ds):
    """First derived field that extracts a value with a regex and links to another data source (Tempo)."""
    for f in (ds.get("jsonData") or {}).get("derivedFields") or []:
        if f.get("datasourceUid") and f.get("matcherRegex") and f.get("matcherType", "regex") == "regex":
            out = {"regex": f["matcherRegex"], "tempoUid": f["datasourceUid"]}
            if f.get("urlDisplayLabel"):
                out["linkTitle"] = f["urlDisplayLabel"]
            return out
    return None


def build(values, datasource_uid, overrides, defaults, settings=None, pin_datasources=False):
    sources = list(walk_datasources(values))
    starrocks = [ds for ds in sources if ds.get("type") == "kotak-starrocks-datasource"]
    orgs = sorted({ds.get("orgId", 1) for ds in starrocks})
    per_org = {org: {} for org in orgs}
    report = []
    for ds in sources:
        org = ds.get("orgId", 1)
        if ds.get("type") != "loki" or org not in per_org:
            continue
        tenant = loki_tenant(ds)
        if not tenant:
            report.append(f"# skipped {ds['name']} (org {org}): no X-Scope-OrgID header")
            continue
        app_id = tenant.replace("-", "_")
        trace = trace_setting(ds)
        entry = per_org[org].setdefault(app_id, {})
        if trace:
            entry["trace"] = trace
        report.append(f"# org {org}: {app_id} <- {ds['name']} (trace link from Loki: {'yes' if trace else 'no'})")
    apps = []
    for org in orgs:
        tenants = {"default": defaults}
        for app_id, entry in sorted(per_org[org].items()):
            merged = {**entry, **(overrides.get(app_id) or {})}
            if merged:
                tenants[app_id] = merged
        for app_id, extra in overrides.items():
            tenants.setdefault(app_id, extra)
        uids = [ds.get("uid") for ds in starrocks if ds.get("orgId", 1) == org and ds.get("uid")]
        default_uid = datasource_uid if datasource_uid in uids else uids[0]
        report.append(f"# org {org}: StarRocks data sources {uids}, default {default_uid}")
        json_data = {"datasourceUid": default_uid}
        if pin_datasources:
            json_data["datasources"] = uids
        json_data.update(settings or {})
        json_data["tenants"] = tenants
        apps.append({"type": "kotak-starrocks-logs-app", "org_id": org, "jsonData": json_data})
    return {"apiVersion": 1, "apps": apps}, report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("values", help="deploy-config grafana-values.yml")
    ap.add_argument("--datasource-uid", default="app-logs-starrocks-db")
    ap.add_argument("--overrides", help="YAML: {app_id: {level: ..., patterns: [...], trace: {...}}}")
    ap.add_argument("--settings", help="YAML: other jsonData keys, e.g. {maxScanHours: 6}")
    ap.add_argument("--pin-datasources", action="store_true", help="write the org's StarRocks data sources as the picker list")
    args = ap.parse_args()
    with open(args.values) as f:
        values = yaml.safe_load(f)
    overrides = {}
    if args.overrides:
        with open(args.overrides) as f:
            overrides = yaml.safe_load(f) or {}
    settings = {}
    if args.settings:
        with open(args.settings) as f:
            settings = yaml.safe_load(f) or {}
    defaults = overrides.pop("default", None) or {"level": {"source": "column"}}
    doc, report = build(values, args.datasource_uid, overrides, defaults, settings, args.pin_datasources)
    sys.stdout.write("# Generated by scripts/gen-tenants-from-loki.py; do not edit by hand.\n")
    sys.stdout.write("\n".join(report) + "\n")
    yaml.safe_dump(doc, sys.stdout, sort_keys=False, default_flow_style=False, width=200)


if __name__ == "__main__":
    main()
