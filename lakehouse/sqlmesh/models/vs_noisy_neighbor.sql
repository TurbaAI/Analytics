MODEL (
  name turbalance.vs_noisy_neighbor,
  kind VIEW,
  dialect duckdb
);

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
  from turbalance.vs_resource_pressure_1m
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
