MODEL (
  name turbalance.vs_alert_candidates,
  kind VIEW,
  dialect duckdb
);

select
  host_id || ':gpu-starvation:' || bottleneck as incident_key,
  host_id,
  case when starvation_score >= 80 then 'critical' else 'warning' end as severity,
  'GPU starvation' as title,
  confidence,
  'platform-runtime' as owner,
  'GPU starvation score ' || round(starvation_score, 1)::varchar || ' with ' || bottleneck || ' bottleneck.' as evidence,
  'vs_gpu_starvation' as source_table
from turbalance.vs_gpu_starvation

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
from turbalance.vs_noisy_neighbor

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
from turbalance.vs_input_pipeline_stall;
