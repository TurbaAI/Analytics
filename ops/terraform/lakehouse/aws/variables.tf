variable "name_prefix" {
  description = "Prefix used for all lakehouse resources."
  type        = string
}

variable "tags" {
  description = "Common resource tags."
  type        = map(string)
  default     = {}
}

variable "vpc_id" {
  description = "VPC where managed database and broker resources run."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for RDS and MSK."
  type        = list(string)
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach managed database and broker resources."
  type        = list(string)
  default     = []
}

variable "lake_bucket_name" {
  description = "Optional explicit S3 bucket name. Defaults to a prefix-derived name."
  type        = string
  default     = ""
}

variable "postgres_username" {
  description = "Postgres admin/application username."
  type        = string
  default     = "turbalance"
}

variable "postgres_database_name" {
  description = "Postgres metadata database name."
  type        = string
  default     = "turbalance"
}

variable "postgres_instance_class" {
  description = "RDS Postgres instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "postgres_allocated_storage_gb" {
  description = "Initial RDS storage in GiB."
  type        = number
  default     = 50
}

variable "enable_msk" {
  description = "Whether to provision an MSK cluster for queue-gateway Kafka handoff."
  type        = bool
  default     = false
}

variable "msk_kafka_version" {
  description = "MSK Kafka version."
  type        = string
  default     = "3.6.0"
}

variable "msk_instance_type" {
  description = "MSK broker instance type."
  type        = string
  default     = "kafka.t3.small"
}

variable "msk_broker_count" {
  description = "Number of MSK brokers."
  type        = number
  default     = 2
}

variable "otel_backend_otlp_endpoint" {
  description = "OTLP HTTP endpoint for the production OpenTelemetry collector exporter."
  type        = string
  default     = ""
}

variable "otel_backend_authorization" {
  description = "Authorization header value used by the OTel backend exporter."
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_webhook_url" {
  description = "Generic alert webhook URL."
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_slack_webhook_url" {
  description = "Slack alert webhook URL."
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_pagerduty_routing_key" {
  description = "PagerDuty Events API routing key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "api_jwks_json" {
  description = "JWKS JSON used by the api-server when validating RS256/JWKS tokens."
  type        = string
  default     = "{\"keys\":[]}"
  sensitive   = true
}

variable "api_tokens" {
  description = "Break-glass API token map. Prefer JWKS/OIDC for normal production access."
  type        = string
  default     = ""
  sensitive   = true
}

variable "agent_client_ca_pem" {
  description = "PEM encoded CA used by collector mTLS gateway to verify agent client certificates."
  type        = string
  default     = ""
  sensitive   = true
}

variable "consul_token" {
  description = "Optional Consul ACL token mirrored into lakehouse/consul for the Consul overlay."
  type        = string
  default     = ""
  sensitive   = true
}
