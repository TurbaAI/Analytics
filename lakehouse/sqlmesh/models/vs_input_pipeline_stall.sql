MODEL (
  name turbalance.vs_input_pipeline_stall,
  kind VIEW,
  dialect duckdb
);

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
from turbalance.vs_resource_pressure_1m
where gpu is not null
  and gpu < 70
  and greatest(coalesce(cpu, 0), coalesce(ram, 0), coalesce(network, 0)) >= 60;
