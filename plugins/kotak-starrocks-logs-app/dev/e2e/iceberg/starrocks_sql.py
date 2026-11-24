#!/usr/bin/env python3
"""Prints the StarRocks SQL for the Iceberg e2e: the external catalog, one view per Iceberg table in the first
database (like UAT's views over the Glue table), and the user kmbl3iceberg granted those views only."""
import os
import sys

sys.argv = [sys.argv[0], "4"]
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import seed  # noqa: E402

print("""CREATE EXTERNAL CATALOG IF NOT EXISTS iceberg_e2e PROPERTIES (
  "type" = "iceberg",
  "iceberg.catalog.type" = "rest",
  "iceberg.catalog.uri" = "http://iceberg-rest:8181",
  "aws.s3.endpoint" = "http://s3:8333",
  "aws.s3.enable_path_style_access" = "true",
  "aws.s3.enable_ssl" = "false",
  "aws.s3.access_key" = "e2e",
  "aws.s3.secret_key" = "e2e-secret",
  "aws.s3.region" = "us-east-1"
);
REFRESH EXTERNAL TABLE iceberg_e2e.logs.eks_app_logs;
REFRESH EXTERNAL TABLE iceberg_e2e.logs.eks_app_logs_ntz;
USE obs2_logs1_uat;
DROP VIEW IF EXISTS vw_eks_app_logs_app_9100_icebergtz;
CREATE VIEW vw_eks_app_logs_app_9100_icebergtz AS
  SELECT * FROM iceberg_e2e.logs.eks_app_logs WHERE app_id = 'app_9100_icebergtz';
DROP VIEW IF EXISTS vw_eks_app_logs_app_9200_icebergntz;
CREATE VIEW vw_eks_app_logs_app_9200_icebergntz AS
  SELECT * FROM iceberg_e2e.logs.eks_app_logs_ntz WHERE app_id = 'app_9200_icebergntz';
DROP USER IF EXISTS 'kmbl3iceberg'@'%';""")
print(f"CREATE USER 'kmbl3iceberg'@'%' IDENTIFIED WITH authentication_jwt AS {seed.q(seed.JWT)};")
print("GRANT SELECT ON VIEW obs2_logs1_uat.vw_eks_app_logs_app_9100_icebergtz TO USER 'kmbl3iceberg'@'%';")
print("GRANT SELECT ON VIEW obs2_logs1_uat.vw_eks_app_logs_app_9200_icebergntz TO USER 'kmbl3iceberg'@'%';")
