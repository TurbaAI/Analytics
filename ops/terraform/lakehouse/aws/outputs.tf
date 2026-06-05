output "lake_root" {
  description = "S3 lake root to pass as TURBALANCE_LAKE_ROOT."
  value       = "s3://${aws_s3_bucket.lake.bucket}/turbalance/lakehouse"
}

output "metadata_database_secret_name" {
  description = "Secrets Manager key used by turbalance-metadata-db ExternalSecret."
  value       = aws_secretsmanager_secret.metadata_db.name
}

output "object_store_secret_name" {
  description = "Secrets Manager key used by turbalance-object-store ExternalSecret."
  value       = aws_secretsmanager_secret.object_store.name
}

output "collector_auth_secret_name" {
  description = "Secrets Manager key used by turbalance-collector-auth ExternalSecret."
  value       = aws_secretsmanager_secret.collector_auth.name
}

output "discovery_auth_secret_name" {
  description = "Secrets Manager key used by turbalance-discovery-auth ExternalSecret."
  value       = aws_secretsmanager_secret.discovery_auth.name
}

output "api_auth_secret_name" {
  description = "Secrets Manager key used by turbalance-api-auth ExternalSecret."
  value       = aws_secretsmanager_secret.api_auth.name
}

output "queue_gateway_secret_name" {
  description = "Secrets Manager key used by turbalance-collector-queue-auth ExternalSecret."
  value       = aws_secretsmanager_secret.queue_gateway.name
}

output "otel_backend_secret_name" {
  description = "Secrets Manager key used by turbalance-otel-backend ExternalSecret."
  value       = aws_secretsmanager_secret.otel_backend.name
}

output "alert_routing_secret_name" {
  description = "Secrets Manager key used by turbalance-alert-routing ExternalSecret."
  value       = aws_secretsmanager_secret.alert_routing.name
}

output "agent_client_ca_secret_name" {
  description = "Secrets Manager key used by turbalance-agent-client-ca ExternalSecret."
  value       = aws_secretsmanager_secret.mtls_agent_ca.name
}

output "consul_auth_secret_name" {
  description = "Secrets Manager key used by the optional turbalance-consul-auth ExternalSecret."
  value       = aws_secretsmanager_secret.consul.name
}

output "msk_bootstrap_brokers" {
  description = "MSK bootstrap brokers to pass as TURBALANCE_QUEUE_GATEWAY_BROKER_URL when enable_msk is true."
  value       = var.enable_msk ? aws_msk_cluster.queue[0].bootstrap_brokers : ""
}

output "object_lake_rw_policy_arn" {
  description = "IAM policy ARN for workloads that need S3 lake read/write permissions."
  value       = aws_iam_policy.object_lake_rw.arn
}
