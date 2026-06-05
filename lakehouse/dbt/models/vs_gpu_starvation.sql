{{ config(materialized='view') }}

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
from {{ ref('vs_resource_pressure_1m') }}
where gpu is not null
  and gpu < 50
  and greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) >= 60
