{{ config(materialized='view') }}

with ordered as (
  select
    host_id,
    bucket_ts,
    network,
    gpu,
    lag(network) over (partition by host_id order by bucket_ts) as prior_network,
    lag(gpu) over (partition by host_id order by bucket_ts) as prior_gpu
  from {{ ref('vs_resource_pressure_1m') }}
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
group by host_id
