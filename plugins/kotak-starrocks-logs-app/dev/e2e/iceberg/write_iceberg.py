#!/usr/bin/env python3
"""Writes two Iceberg tables shaped like UAT's eks_app_logs through the REST catalog (run by the
iceberg-writer service). Both are partitioned by identity(app_id) and hour(observed_timestamp), like UAT.

  logs.eks_app_logs      observed_timestamp is timestamptz (an instant; StarRocks shows it in the session zone)
  logs.eks_app_logs_ntz  observed_timestamp is timestamp holding IST wall-clock time (a pipeline that wrote local
                         time; StarRocks shows the stored text whatever the session zone)

The rows are the e2e observability tenant from seed.py (messages carry their UTC time, e.g. ts=...Z).
"""
import datetime as dt
import sys
import time

import pyarrow as pa
import pyarrow.fs as pafs
from pyiceberg.catalog import load_catalog
from pyiceberg.partitioning import PartitionField, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.transforms import HourTransform, IdentityTransform
from pyiceberg.types import NestedField, StringType, TimestampType, TimestamptzType

sys.argv = [sys.argv[0], "4"]
sys.path.insert(0, "/work")
import seed  # noqa: E402

S3 = {"s3.endpoint": "http://s3:8333", "s3.access-key-id": "e2e", "s3.secret-access-key": "e2e-secret",
      "s3.region": "us-east-1", "s3.path-style-access": "true"}
TABLES = {
    "eks_app_logs": ("app_9100_icebergtz", TimestamptzType()),
    "eks_app_logs_ntz": ("app_9200_icebergntz", TimestampType()),
}
IST = dt.timedelta(hours=5, minutes=30)


def main():
    fs = pafs.S3FileSystem(endpoint_override="s3:8333", scheme="http", access_key="e2e", secret_key="e2e-secret",
                           region="us-east-1")
    try:
        fs.create_dir("warehouse")
    except OSError:
        pass
    for attempt in range(60):  # the REST catalog may still be starting
        try:
            cat = load_catalog("rest", **{"uri": "http://iceberg-rest:8181", **S3})
            break
        except Exception:  # noqa: BLE001
            time.sleep(2)
    else:
        raise SystemExit("Iceberg REST catalog not reachable")
    try:
        cat.create_namespace("logs")
    except Exception:  # noqa: BLE001 - already there
        pass
    spec_obs = seed.TENANTS_DB1["app_1961_observability"]
    for name, (app_id, ts_type) in TABLES.items():
        fields = [
            NestedField(i + 1, c, ts_type if c == "observed_timestamp" else StringType(), required=False)
            for i, c in enumerate(seed.COLUMNS)
        ]
        schema = Schema(*fields)
        ts_id = seed.COLUMNS.index("observed_timestamp") + 1
        app_field = seed.COLUMNS.index("app_id") + 1
        spec = PartitionSpec(
            PartitionField(source_id=app_field, field_id=1000, transform=IdentityTransform(), name="app_id"),
            PartitionField(source_id=ts_id, field_id=1001, transform=HourTransform(), name="observed_timestamp_hour"),
        )
        ident = f"logs.{name}"
        if cat.table_exists(ident):
            cat.drop_table(ident)
        table = cat.create_table(ident, schema=schema, partition_spec=spec)
        rows = seed.rows_for(app_id, {**spec_obs, "rows": 20000})
        cols = {c: [] for c in seed.COLUMNS}
        for r in rows:
            for c, v in zip(seed.COLUMNS, r):
                cols[c].append(v)
        utc = [dt.datetime.strptime(t, "%Y-%m-%d %H:%M:%S.%f") for t in cols["observed_timestamp"]]
        if isinstance(ts_type, TimestamptzType):
            ts = pa.array([t.replace(tzinfo=dt.timezone.utc) for t in utc], pa.timestamp("us", tz="UTC"))
        else:
            ts = pa.array([t + IST for t in utc], pa.timestamp("us"))
        arrays = [ts if c == "observed_timestamp" else pa.array(cols[c], pa.string()) for c in seed.COLUMNS]
        table.append(pa.Table.from_arrays(arrays, schema=schema.as_arrow()))
        print(f"{ident}: {len(rows)} rows, {app_id}, {ts_type}")


if __name__ == "__main__":
    main()
