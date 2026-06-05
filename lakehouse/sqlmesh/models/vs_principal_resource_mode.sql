MODEL (
  name turbalance.vs_principal_resource_mode,
  kind VIEW,
  dialect duckdb
);

with ranked_pairs as (
  select
    tenant_id,
    host_id,
    left_metric,
    right_metric,
    sample_count,
    covariance,
    correlation,
    row_number() over (
      partition by tenant_id, host_id
      order by abs(coalesce(correlation, 0)) desc, abs(coalesce(covariance, 0)) desc
    ) as rank
  from turbalance.vs_cpu_gpu_ram_net_covariance
  where left_metric <> right_metric
)
select
  tenant_id,
  host_id,
  left_metric || ' + ' || right_metric as title,
  sample_count,
  covariance,
  correlation,
  'dominant_pair_sql_summary' as mode_estimate_method
from ranked_pairs
where rank = 1;
