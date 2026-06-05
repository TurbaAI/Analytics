MODEL (
  name turbalance.vs_resource_pressure_1m,
  kind VIEW,
  dialect duckdb
);

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
  from turbalance.raw_metric_rows
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
