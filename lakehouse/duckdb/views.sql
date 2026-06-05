create or replace view raw_metric_rows as
select *
from read_parquet(
  'build/lakehouse/raw/*/**/*.parquet',
  hive_partitioning = true,
  union_by_name = true
);

create or replace view vs_resource_pressure_1m as
with mapped as (
  select
    tenant_id,
    host_id,
    date_trunc('minute', event_ts) as bucket_ts,
    case
      when metric_name ilike '%gpu_utilization%' then 'gpu'
      when metric_name ilike '%network_utilization%' or metric_name ilike '%network.utilizationPct%' then 'network'
      when metric_name ilike '%cpu_prep%' or metric_name ilike '%cpuThrottlePct%' or metric_name ilike '%offCpuTimePct%' then 'cpu'
      when metric_name ilike '%memory_used%' or metric_name ilike '%ram_usage%' then 'ram'
      else null
    end as resource,
    case
      when metric_unit = 'ratio' and metric_value between -1 and 1 then metric_value * 100
      else metric_value
    end as value
  from raw_metric_rows
)
select
  tenant_id,
  host_id,
  bucket_ts,
  max(value) filter (where resource = 'cpu') as cpu,
  max(value) filter (where resource = 'gpu') as gpu,
  max(value) filter (where resource = 'ram') as ram,
  max(value) filter (where resource = 'network') as network
from mapped
where resource is not null
group by tenant_id, host_id, bucket_ts;

create or replace view vs_cpu_gpu_ram_net_covariance as
with unpivoted as (
  select tenant_id, host_id, bucket_ts, 'cpu' as metric, cpu as value from vs_resource_pressure_1m where cpu is not null
  union all
  select tenant_id, host_id, bucket_ts, 'gpu' as metric, gpu as value from vs_resource_pressure_1m where gpu is not null
  union all
  select tenant_id, host_id, bucket_ts, 'ram' as metric, ram as value from vs_resource_pressure_1m where ram is not null
  union all
  select tenant_id, host_id, bucket_ts, 'network' as metric, network as value from vs_resource_pressure_1m where network is not null
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

create or replace view vs_principal_resource_mode as
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
  from vs_cpu_gpu_ram_net_covariance
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

create or replace view vs_gpu_starvation as
select
  host_id,
  bucket_ts as event_ts,
  gpu,
  case
    when coalesce(cpu, 0) >= coalesce(ram, 0) and coalesce(cpu, 0) >= coalesce(network, 0) then 'cpu'
    when coalesce(ram, 0) >= coalesce(network, 0) then 'ram'
    else 'network'
  end as bottleneck,
  greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) as bottleneck_pressure,
  least(100, greatest(0, (50 - gpu) * 1.2 + (greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) - 60) * 0.8)) as starvation_score,
  least(0.95, greatest(0.25, 0.35 + greatest(0, 50 - gpu) / 180 + greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) / 300)) as confidence
from vs_resource_pressure_1m
where gpu is not null
  and gpu < 50
  and greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) >= 60;

create or replace view vs_network_gpu_coupling as
with ordered as (
  select
    host_id,
    bucket_ts,
    network,
    gpu,
    lag(network) over (partition by host_id order by bucket_ts) as prior_network,
    lag(gpu) over (partition by host_id order by bucket_ts) as prior_gpu
  from vs_resource_pressure_1m
  where network is not null and gpu is not null
)
select
  host_id,
  count(*) as sample_count,
  corr(network, gpu) as same_bucket_correlation,
  corr(prior_network, gpu) as network_leads_gpu_correlation,
  corr(prior_gpu, network) as gpu_leads_network_correlation,
  greatest(
    abs(coalesce(corr(network, gpu), 0)),
    abs(coalesce(corr(prior_network, gpu), 0)),
    abs(coalesce(corr(prior_gpu, network), 0))
  ) as coupling_strength,
  case when count(*) >= 4 then 'ready' else 'learning' end as status
from ordered
group by host_id;

create or replace view vs_noisy_neighbor as
with pressure as (
  select
    host_id,
    bucket_ts as event_ts,
    cpu,
    ram,
    network,
    ((case when coalesce(cpu, 0) >= 75 then 1 else 0 end) +
     (case when coalesce(ram, 0) >= 75 then 1 else 0 end) +
     (case when coalesce(network, 0) >= 75 then 1 else 0 end)) as pressure_count,
    greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) as dominant_value
  from vs_resource_pressure_1m
)
select
  host_id,
  event_ts,
  case
    when coalesce(cpu, 0) >= coalesce(ram, 0) and coalesce(cpu, 0) >= coalesce(network, 0) then 'cpu'
    when coalesce(ram, 0) >= coalesce(network, 0) then 'ram'
    else 'network'
  end as dominant_pressure,
  pressure_count,
  least(100, dominant_value + pressure_count * 8) as contention_score,
  least(0.95, 0.45 + pressure_count * 0.15) as confidence
from pressure
where pressure_count >= 2;

create or replace view vs_input_pipeline_stall as
select
  host_id,
  bucket_ts as event_ts,
  case
    when coalesce(cpu, 0) >= coalesce(ram, 0) and coalesce(cpu, 0) >= coalesce(network, 0) then 'cpu'
    when coalesce(ram, 0) >= coalesce(network, 0) then 'ram'
    else 'network'
  end as stall_source,
  gpu,
  coalesce(cpu, 0) as cpu,
  coalesce(ram, 0) as ram,
  coalesce(network, 0) as network,
  least(100, (70 - gpu) + (greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) - 50)) as stall_score,
  least(0.95, greatest(0.25, 0.35 + (70 - gpu) / 180 + greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) / 300)) as confidence
from vs_resource_pressure_1m
where gpu is not null
  and gpu < 70
  and greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) >= 60;

create or replace view vs_alert_candidates as
select
  host_id || ':gpu-starvation:' || bottleneck as incident_key,
  host_id,
  case when starvation_score >= 80 then 'critical' else 'warning' end as severity,
  'GPU starvation' as title,
  confidence,
  'platform-runtime' as owner,
  'GPU starvation score ' || round(starvation_score, 1)::varchar || ' with ' || bottleneck || ' bottleneck.' as evidence,
  'vs_gpu_starvation' as source_table
from vs_gpu_starvation

union all

select
  host_id || ':noisy-neighbor:' || dominant_pressure as incident_key,
  host_id,
  case when contention_score >= 90 then 'critical' else 'warning' end as severity,
  'Noisy-neighbor contention' as title,
  confidence,
  'cluster-operations' as owner,
  pressure_count::varchar || ' resources above contention threshold.' as evidence,
  'vs_noisy_neighbor' as source_table
from vs_noisy_neighbor

union all

select
  host_id || ':input-pipeline-stall:' || stall_source as incident_key,
  host_id,
  case when stall_score >= 85 then 'critical' else 'warning' end as severity,
  'Input pipeline stall' as title,
  confidence,
  'ml-platform' as owner,
  'Input pipeline stall score ' || round(stall_score, 1)::varchar || ' from ' || stall_source || ' pressure.' as evidence,
  'vs_input_pipeline_stall' as source_table
from vs_input_pipeline_stall;
