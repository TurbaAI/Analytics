{{ config(materialized='view') }}

select *
from read_parquet(
  'build/lakehouse/raw/*/**/*.parquet',
  hive_partitioning = true,
  union_by_name = true
)
