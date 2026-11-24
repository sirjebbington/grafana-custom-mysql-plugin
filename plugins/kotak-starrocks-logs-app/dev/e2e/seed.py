#!/usr/bin/env python3
"""Prints SQL that (re)creates the local e2e data: two databases (one per kotak-starrocks-datasource
instance), each with an eks_app_logs-shaped table (same 21 columns as the UAT Iceberg table) and per-tenant
views like vw_eks_app_logs_<app_id>, and native StarRocks users authenticated with the mock IDAM's JWTs, each
granted SELECT on some views (stands in for Ranger).

  python3 dev/e2e/seed.py [hours] | mysql -h127.0.0.1 -P29030 -uroot

Timestamps are relative to now (UTC, microseconds), so re-run it before testing on another day.

Like UAT, the StarRocks session time zone is not UTC (FE_TIME_ZONE, default Asia/Kolkata). VIEW_TIME sets how
the views show observed_timestamp (the table holds UTC):
  session  (default) in the session time zone, the way StarRocks shows an Iceberg timestamptz column
  ist      as IST wall-clock time whatever the session (a timestamp column written in local time)
  utc      as UTC wall-clock time whatever the session (a timestamp column written in UTC)
The app detects which one it is and picks the session zone of its statements (src/sql/timeZone.ts).
"""
import datetime as dt
import os
import random
import sys

HOURS = float(sys.argv[1]) if len(sys.argv) > 1 else 4.0
RNG = random.Random(1961)
NOW = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
JWT = (
    '{"jwks_url": "http://idam:8080/idam/jwks", "principal_field": "sub", '
    '"required_issuer": "http://idam:8080/idam", "required_audience": "grafana-e2e"}'
)

COLUMNS = [
    "app_env", "app_id", "eks_cluster_name", "k8s_container_name", "k8s_daemonset_name", "k8s_deployment_name",
    "k8s_namespace_name", "k8s_node_name", "k8s_pod_name", "k8s_pod_start_time", "k8s_pod_uid",
    "k8s_service_name", "k8s_statefulset_name", "log_file_path", "log_iostream", "logtag", "message",
    "observed_timestamp", "tenant_name", "level", "level_parser",
]

NODES = [f"ip-100-64-{RNG.randint(1, 250)}-{RNG.randint(1, 250)}.ap-south-1.compute.internal" for _ in range(6)]


def hexid(n):
    return "".join(RNG.choice("0123456789abcdef") for _ in range(n))


def uid():
    return f"{hexid(8)}-{hexid(4)}-{hexid(4)}-{hexid(4)}-{hexid(12)}"


def pods(service, namespace, kind, count):
    out = []
    for i in range(count):
        name = f"{service}-{i}" if kind == "statefulset" else f"{service}-{hexid(9)}-{hexid(5)}"
        u = uid()
        out.append({
            "name": name, "uid": u, "node": RNG.choice(NODES),
            "start": (NOW - dt.timedelta(days=RNG.randint(1, 9))).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "path": f"/var/log/pods/{namespace}_{name}_{u}/{service}/0.log",
        })
    return out


def ip():
    return f"10.{RNG.randint(50, 70)}.{RNG.randint(0, 255)}.{RNG.randint(1, 254)}"


# ---- message generators: (message, raw level column value) ----

def proxy_line(ts):
    if RNG.random() < 0.04:
        return (f"{ts:%Y/%m/%d %H:%M:%S} [error] 1407#0: *{RNG.randint(100000, 999999)} upstream timed out "
                f"(110: Connection timed out) while reading response header from upstream, client: {ip()}"), ""
    path = RNG.choice(["/status", "/healthz", "/cp/actuator/health/livenessState", "/api/v1/orders", "/schemas/plugins/sqs"])
    status = RNG.choice([200] * 12 + [404, 502])
    return (f'{ip()} - - [{ts:%d/%b/%Y:%H:%M:%S} +0000] "GET {path} HTTP/2.0" {status} {RNG.randint(80, 2000)} "-" '
            f'"kong-ingress-controller/3.2.4" kong_request_id: "{hexid(32)}"'), ""


def apilog_line(ts):
    r = RNG.random()
    if r < 0.05:
        return f"{ts:%Y-%m-%d %H:%M:%S.%f}"[:-3] + f" ERROR c.k.apilog.Repository - Connection refused to db-0{RNG.randint(1, 3)}:5432", ""
    if r < 0.15:
        return f"{ts:%Y-%m-%d %H:%M:%S.%f}"[:-3] + " WARN c.k.apilog.Cache - cache miss ratio high", ""
    return (f"{ts:%Y-%m-%d %H:%M:%S.%f}"[:-3] + " [Debug] TrackWizzSaaS.Core.ServiceLib.API.Middleware."
            + RNG.choice(["CorrelationMiddleware", "AccessTokenMiddleware", "TenantMiddleware"]) + f" [tid: {uid()}]"), ""


def otel_line(ts):
    trace = f"traceid={hexid(32)} spanid={hexid(16)}"
    r = RNG.random()
    if r < 0.05:
        return f'ts={ts:%Y-%m-%dT%H:%M:%S.%f}Z level=error msg="upstream timed out" upstream=payments retries={RNG.randint(1, 5)} {trace}', ""
    if r < 0.15:
        return f'ts={ts:%Y-%m-%dT%H:%M:%S.%f}Z level=warn msg="slow request" duration_ms={RNG.randint(1500, 5000)} {trace}', ""
    status = RNG.choice([200] * 9 + [500])
    return (f'ts={ts:%Y-%m-%dT%H:%M:%S.%f}Z level=info msg="request completed" method={RNG.choice(["GET", "POST"])} '
            f'path=/api/v1/{RNG.choice(["orders", "users", "payments"])} status={status} duration_ms={RNG.randint(2, 900)} {trace}'), ""


def vector_line(ts):
    if RNG.random() < 0.1:
        return f"E{ts:%m%d %H:%M:%S.%f}       1 controller.go:{RNG.randint(100, 400)}] failed to sync pod default/app-{hexid(5)}: timeout", ""
    return f"I{ts:%m%d %H:%M:%S.%f}       1 reconcile.go:{RNG.randint(100, 400)}] reconciled {RNG.randint(1, 50)} objects", ""


def gateway_line(ts):
    if RNG.random() < 0.05:
        return f'{{"level":"error","msg":"tenant limit exceeded","tenant":"t{RNG.randint(1, 9)}","status":429}}', ""
    return f'{{"level":"info","msg":"GET /healthz","status":200,"duration_ms":{RNG.randint(0, 3)}}}', ""


CMM_LEVELS = ["INFO"] * 6 + ["info", "DEBUG", "Warning", "ERROR", "notice", "fatal", ""]


def cmm_line(ts):
    level = RNG.choice(CMM_LEVELS)
    thread = f"[http-nio-8080-exec-{RNG.randint(1, 9)}]"
    trace = f" trace_id={hexid(32)}" if RNG.random() < 0.5 else ""
    if level in ("ERROR", "fatal"):
        return f"{ts:%Y-%m-%d %H:%M:%S} {thread} c.k.cmm.PaymentService - payment {RNG.choice(['declined', 'failed'])} order={RNG.randint(1000, 9999)}{trace}", level
    return f"{ts:%Y-%m-%d %H:%M:%S} {thread} c.k.cmm.OrderController - created order id={RNG.randint(1000, 9999)} amount={RNG.randint(1, 900)}{trace}", level


def archive_line(ts):
    if RNG.random() < 0.1:
        return f"segment upload failed for partition {RNG.randint(1, 99)}: timeout after {RNG.randint(5, 30)}s", "ERROR"
    if RNG.random() < 0.2:
        return f"compaction slow: {RNG.randint(100, 900)} files pending", "WARN"
    return f"compacted segment {RNG.randint(1000, 9999)} in {RNG.randint(5, 900)}ms", "INFO"


def payments_line(ts):
    level = RNG.choice(["INFO", "INFO", "INFO", "WARN", "ERROR"])
    if level == "ERROR":
        return f"charge declined for order {RNG.randint(1000, 9999)} reason=insufficient_funds", level
    return f"charge captured order={RNG.randint(1000, 9999)} amount={RNG.randint(1, 900)}", level


def dpdpa_line(ts):
    level = RNG.choice(["INFO", "INFO", "WARN", "ERROR"])
    return f"{ts:%Y-%m-%d %H:%M:%S} consent {RNG.choice(['granted', 'revoked'])} for principal {hexid(12)}", level


TENANTS_DB1 = {
    "app_1961_observability": {
        "rows": 40000, "tenant": "observability",
        "services": [
            ("proxy", "kong", "deployment", 3, proxy_line, 0.40),
            ("apilog", "observability", "deployment", 2, apilog_line, 0.20),
            ("otel-collector", "monitoring", "deployment", 2, otel_line, 0.20),
            ("vector", "observability", "daemonset", 3, vector_line, 0.12),
            ("loki-gateway", "monitoring", "statefulset", 2, gateway_line, 0.08),
        ],
    },
    "app_01996_frontlineplatforms_cmm": {
        "rows": 20000, "tenant": "frontlineplatforms",
        "services": [
            ("cmm-api", "cmm", "deployment", 3, cmm_line, 0.6),
            ("cmm-worker", "cmm", "statefulset", 2, cmm_line, 0.3),
            ("cmm-ui", "cmm", "deployment", 1, cmm_line, 0.1),
        ],
    },
    "app_03123_dpdpa": {
        "rows": 3000, "tenant": "dpdpa",
        "services": [("dpdpa-api", "dpdpa", "deployment", 2, dpdpa_line, 1.0)],
    },
}

# second database: the same tenant (observability, but with the level column filled) and a new tenant
TENANTS_DB2 = {
    "app_1961_observability": {
        "rows": 6000, "tenant": "observability",
        "services": [
            ("archive-compactor", "observability", "statefulset", 2, archive_line, 0.7),
            ("cold-reader", "observability", "deployment", 2, archive_line, 0.3),
        ],
    },
    "app_04000_payments": {
        "rows": 4000, "tenant": "payments",
        "services": [("payments-api", "payments", "deployment", 2, payments_line, 1.0)],
    },
}

DATABASES = {"obs2_logs1_uat": TENANTS_DB1, "obs2_logs2_uat": TENANTS_DB2}

# user -> (database, app_id) views it may read
GRANTS = {
    "kmbl3e2e": [
        ("obs2_logs1_uat", "app_1961_observability"),
        ("obs2_logs1_uat", "app_01996_frontlineplatforms_cmm"),
        ("obs2_logs2_uat", "app_1961_observability"),
        ("obs2_logs2_uat", "app_04000_payments"),
    ],
    "kmbl3admin": [("obs2_logs1_uat", "app_1961_observability")],
    "kmbl3other": [("obs2_logs1_uat", "app_03123_dpdpa")],
    "kmbl3db2only": [("obs2_logs2_uat", "app_04000_payments")],
    "kmbl3none": [],
}


def q(v):
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def rows_for(app_id, spec):
    out = []
    services = []
    for name, ns, kind, npods, gen, share in spec["services"]:
        services.append((name, ns, kind, pods(name, ns, kind, npods), gen, share))
    weights = [s[5] for s in services]
    span = HOURS * 3600
    for _ in range(spec["rows"]):
        name, ns, kind, plist, gen, _w = RNG.choices(services, weights)[0]
        pod = RNG.choice(plist)
        ts = NOW - dt.timedelta(seconds=RNG.random() * span)
        message, level = gen(ts)
        out.append([
            "uat", app_id, "obs2-uat-eks", name,
            name if kind == "daemonset" else "", name if kind == "deployment" else "",
            ns, pod["node"], pod["name"], pod["start"], pod["uid"], name,
            name if kind == "statefulset" else "", pod["path"],
            "stderr" if level in ("ERROR", "fatal") or "error" in message[:60] else "stdout", "F",
            message, ts.strftime("%Y-%m-%d %H:%M:%S.%f"), spec["tenant"], level, "",
        ])
    return out


FE_TIME_ZONE = os.environ.get("FE_TIME_ZONE", "Asia/Kolkata")
VIEW_TIME = os.environ.get("VIEW_TIME", "session")
VIEW_TIME_EXPR = {
    "session": "CONVERT_TZ(observed_timestamp, '+00:00', @@time_zone)",
    "ist": "CONVERT_TZ(observed_timestamp, '+00:00', '+05:30')",
    "utc": None,
}


def view_select():
    """SELECT list of a tenant view, with observed_timestamp shown as VIEW_TIME says."""
    expr = VIEW_TIME_EXPR[VIEW_TIME]
    if expr is None:
        return "*"
    return ", ".join(f"{expr} AS observed_timestamp" if c == "observed_timestamp" else c for c in COLUMNS)


def main():
    w = sys.stdout.write
    w(f"SET GLOBAL time_zone = {q(FE_TIME_ZONE)};\n")
    cols = ",\n  ".join(
        f"{c} DATETIME" if c == "observed_timestamp" else (f"{c} VARCHAR(65533)" if c == "message" else f"{c} VARCHAR(512)")
        for c in COLUMNS
    )
    for db, tenants in DATABASES.items():
        w(f"CREATE DATABASE IF NOT EXISTS {db};\nUSE {db};\nDROP TABLE IF EXISTS eks_app_logs;\n")
        w(f"CREATE TABLE eks_app_logs (\n  {cols}\n) DUPLICATE KEY(app_env, app_id)\n"
          "DISTRIBUTED BY HASH(app_id) BUCKETS 3 PROPERTIES (\"replication_num\" = \"1\");\n")
        for app_id, spec in tenants.items():
            rows = rows_for(app_id, spec)
            for i in range(0, len(rows), 2000):
                batch = rows[i:i + 2000]
                w("INSERT INTO eks_app_logs VALUES\n" + ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in batch) + ";\n")
            w(f"DROP VIEW IF EXISTS vw_eks_app_logs_{app_id};\n")
            w(f"CREATE VIEW vw_eks_app_logs_{app_id} AS SELECT {view_select()} FROM eks_app_logs WHERE app_id = {q(app_id)};\n")
    for user, views in GRANTS.items():
        w(f"DROP USER IF EXISTS '{user}'@'%';\n")
        w(f"CREATE USER '{user}'@'%' IDENTIFIED WITH authentication_jwt AS {q(JWT)};\n")
        for db, app_id in views:
            w(f"GRANT SELECT ON VIEW {db}.vw_eks_app_logs_{app_id} TO USER '{user}'@'%';\n")


if __name__ == "__main__":
    main()
