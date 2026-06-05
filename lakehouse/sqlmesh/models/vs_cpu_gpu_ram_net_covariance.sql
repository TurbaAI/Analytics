MODEL (
  name turbalance.vs_cpu_gpu_ram_net_covariance,
  kind VIEW,
  dialect duckdb
);

with unpivoted as (
  select tenant_id, host_id, bucket_ts, 'cpu' as metric, cpu as value from turbalance.vs_resource_pressure_1m where cpu is not null
  union all
  select tenant_id, host_id, bucket_ts, 'gpu' as metric, gpu as value from turbalance.vs_resource_pressure_1m where gpu is not null
  union all
  select tenant_id, host_id, bucket_ts, 'ram' as metric, ram as value from turbalance.vs_resource_pressure_1m where ram is not null
  union all
  select tenant_id, host_id, bucket_ts, 'network' as metric, network as value from turbalance.vs_resource_pressure_1m where network is not null
)
select
  left_metric.tenant_id,
  left_metric.host_id,
  left_metric.metric as left_metric,
  right_metric.metric as right_metric,
  count(*) as sample_count,
  covar_samp(left_metric.value, right_metric.value) as covariance,
  corr(left_metric.value, right_metric.value) as correlation
from unpivoted left_metric
join unpivoted right_metric
  on left_metric.tenant_id = right_metric.tenant_id
 and left_metric.host_id = right_metric.host_id
 and left_metric.bucket_ts = right_metric.bucket_ts
group by
  left_metric.tenant_id,
  left_metric.host_id,
  left_metric.metric,
  right_metric.metric;
