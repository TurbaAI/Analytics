locals {
  name        = lower(replace(var.name_prefix, "/[^a-zA-Z0-9-]/", "-"))
  bucket_name = var.lake_bucket_name != "" ? var.lake_bucket_name : "${local.name}-lakehouse"
  tags = merge(
    {
      "app.kubernetes.io/part-of" = "turbalance-lakehouse"
      "turbalance/component"      = "lakehouse"
    },
    var.tags
  )
}

resource "random_password" "postgres" {
  length  = 32
  special = true
}

resource "random_password" "collector_token" {
  length  = 40
  special = false
}

resource "random_password" "collector_hmac_secret" {
  length  = 64
  special = false
}

resource "random_password" "discovery_enrollment_token" {
  length  = 40
  special = false
}

resource "random_password" "queue_gateway_token" {
  length  = 40
  special = false
}

resource "random_password" "consul_token" {
  length  = 40
  special = false
}

resource "random_password" "break_glass_viewer_token" {
  length  = 40
  special = false
}

resource "random_password" "break_glass_operator_token" {
  length  = 40
  special = false
}

resource "random_password" "break_glass_admin_token" {
  length  = 40
  special = false
}

resource "aws_s3_bucket" "lake" {
  bucket = local.bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "lake" {
  bucket                  = aws_s3_bucket.lake.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "lake" {
  bucket = aws_s3_bucket.lake.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lake" {
  bucket = aws_s3_bucket.lake.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_security_group" "lakehouse" {
  name        = "${local.name}-lakehouse"
  description = "Turbalance lakehouse managed storage access"
  vpc_id      = var.vpc_id
  tags        = local.tags
}

resource "aws_security_group_rule" "postgres_inbound" {
  count             = length(var.allowed_cidr_blocks) > 0 ? 1 : 0
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  security_group_id = aws_security_group.lakehouse.id
}

resource "aws_security_group_rule" "kafka_inbound" {
  count             = var.enable_msk && length(var.allowed_cidr_blocks) > 0 ? 1 : 0
  type              = "ingress"
  from_port         = 9092
  to_port           = 9098
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  security_group_id = aws_security_group.lakehouse.id
}

resource "aws_security_group_rule" "egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.lakehouse.id
}

resource "aws_db_subnet_group" "metadata" {
  name       = "${local.name}-metadata"
  subnet_ids = var.private_subnet_ids
  tags       = local.tags
}

resource "aws_db_instance" "metadata" {
  identifier                  = "${local.name}-metadata"
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.postgres_instance_class
  allocated_storage           = var.postgres_allocated_storage_gb
  db_name                     = var.postgres_database_name
  username                    = var.postgres_username
  password                    = random_password.postgres.result
  db_subnet_group_name        = aws_db_subnet_group.metadata.name
  vpc_security_group_ids      = [aws_security_group.lakehouse.id]
  storage_encrypted           = true
  backup_retention_period     = 7
  deletion_protection         = true
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${local.name}-metadata-final"
  performance_insights_enabled = true
  tags                        = local.tags
}

resource "aws_msk_cluster" "queue" {
  count                  = var.enable_msk ? 1 : 0
  cluster_name           = "${local.name}-queue"
  kafka_version          = var.msk_kafka_version
  number_of_broker_nodes = var.msk_broker_count

  broker_node_group_info {
    instance_type   = var.msk_instance_type
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.lakehouse.id]
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS_PLAINTEXT"
      in_cluster    = true
    }
  }

  tags = local.tags
}

resource "aws_iam_policy" "object_lake_rw" {
  name        = "${local.name}-object-lake-rw"
  description = "Read/write access to the Turbalance lakehouse S3 prefix."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.lake.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.lake.arn}/*"
      }
    ]
  })
  tags = local.tags
}

resource "aws_secretsmanager_secret" "metadata_db" {
  name = "lakehouse/metadata-db"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "metadata_db" {
  secret_id = aws_secretsmanager_secret.metadata_db.id
  secret_string = jsonencode({
    "database-url" = "postgresql://${var.postgres_username}:${urlencode(random_password.postgres.result)}@${aws_db_instance.metadata.address}:${aws_db_instance.metadata.port}/${var.postgres_database_name}"
  })
}

resource "aws_secretsmanager_secret" "object_store" {
  name = "lakehouse/object-store"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "object_store" {
  secret_id = aws_secretsmanager_secret.object_store.id
  secret_string = jsonencode({
    "access-key-id"     = ""
    "secret-access-key" = ""
    "region"            = data.aws_region.current.name
    "endpoint-url"      = "https://s3.${data.aws_region.current.name}.amazonaws.com"
    "scheme"            = "s3"
  })
}

resource "aws_secretsmanager_secret" "collector_auth" {
  name = "lakehouse/collector-auth"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "collector_auth" {
  secret_id = aws_secretsmanager_secret.collector_auth.id
  secret_string = jsonencode({
    "bearer-token" = random_password.collector_token.result
    "hmac-secret"  = random_password.collector_hmac_secret.result
  })
}

resource "aws_secretsmanager_secret" "discovery_auth" {
  name = "lakehouse/discovery-auth"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "discovery_auth" {
  secret_id = aws_secretsmanager_secret.discovery_auth.id
  secret_string = jsonencode({
    "enrollment-token" = random_password.discovery_enrollment_token.result
  })
}

resource "aws_secretsmanager_secret" "api_auth" {
  name = "lakehouse/api-auth"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "api_auth" {
  secret_id = aws_secretsmanager_secret.api_auth.id
  secret_string = jsonencode({
    "api-tokens" = var.api_tokens != "" ? var.api_tokens : "tenant-a:${random_password.break_glass_viewer_token.result}:viewer:break-glass-viewer,tenant-a:${random_password.break_glass_operator_token.result}:operator:break-glass-operator,*:${random_password.break_glass_admin_token.result}:admin:break-glass-admin"
    "jwks"       = var.api_jwks_json
  })
}

resource "aws_secretsmanager_secret" "queue_gateway" {
  name = "lakehouse/queue-gateway"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "queue_gateway" {
  secret_id = aws_secretsmanager_secret.queue_gateway.id
  secret_string = jsonencode({
    "bearer-token" = random_password.queue_gateway_token.result
  })
}

resource "aws_secretsmanager_secret" "otel_backend" {
  name = "lakehouse/otel-backend"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "otel_backend" {
  secret_id = aws_secretsmanager_secret.otel_backend.id
  secret_string = jsonencode({
    "otlp-endpoint" = var.otel_backend_otlp_endpoint
    "authorization" = var.otel_backend_authorization
  })
}

resource "aws_secretsmanager_secret" "alert_routing" {
  name = "lakehouse/alert-routing"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "alert_routing" {
  secret_id = aws_secretsmanager_secret.alert_routing.id
  secret_string = jsonencode({
    "webhook-url"           = var.alert_webhook_url
    "slack-webhook-url"     = var.alert_slack_webhook_url
    "pagerduty-routing-key" = var.alert_pagerduty_routing_key
  })
}

resource "aws_secretsmanager_secret" "mtls_agent_ca" {
  name = "lakehouse/mtls-agent-ca"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "mtls_agent_ca" {
  secret_id = aws_secretsmanager_secret.mtls_agent_ca.id
  secret_string = jsonencode({
    "ca.crt" = var.agent_client_ca_pem
  })
}

resource "aws_secretsmanager_secret" "consul" {
  name = "lakehouse/consul"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "consul" {
  secret_id = aws_secretsmanager_secret.consul.id
  secret_string = jsonencode({
    "token" = var.consul_token != "" ? var.consul_token : random_password.consul_token.result
  })
}

data "aws_region" "current" {}
