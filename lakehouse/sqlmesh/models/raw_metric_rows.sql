MODEL (
  name turbalance.raw_metric_rows,
  kind VIEW,
  dialect duckdb
);

select *
from read_parquet(
  'build/lakehouse/raw/*/**/*.parquet',
  hive_partitioning = true,
  union_by_name = true
);
