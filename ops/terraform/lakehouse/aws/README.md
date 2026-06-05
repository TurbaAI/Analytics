# Turbalance Lakehouse AWS Infrastructure

This Terraform module provisions the production dependencies that the Kubernetes lakehouse overlays expect:

- S3 object lake
- RDS Postgres metadata database
- Optional MSK Kafka cluster for queue-gateway handoff
- Secrets Manager entries matching the ExternalSecret remote keys, including the optional Consul token binding
- IAM policy for object-lake read/write access

The module does not grant workload identity by itself. Bind `object_lake_rw_policy_arn` to your cluster service account mechanism, such as EKS IRSA or a managed identity equivalent, then point the External Secrets operator at the same secret names.

Example:

```hcl
module "turbalance_lakehouse" {
  source = "./ops/terraform/lakehouse/aws"

  name_prefix         = "turbalance-prod"
  vpc_id              = "vpc-..."
  private_subnet_ids  = ["subnet-...", "subnet-..."]
  allowed_cidr_blocks = ["10.0.0.0/16"]
  enable_msk          = true
}
```

Use `terraform.tfvars.example` as the starting point for required VPC, subnet, CIDR, and sizing inputs:

```bash
cp ops/terraform/lakehouse/aws/terraform.tfvars.example build/lakehouse-production-material/terraform.tfvars
terraform -chdir=ops/terraform/lakehouse/aws plan -var-file="$PWD/build/lakehouse-production-material/terraform.tfvars"
```

Keep real secret values out of plaintext tfvars where possible. Prefer `TF_VAR_*` environment variables, your CI secret store, or an encrypted tfvars file for JWKS, API tokens, alert routing secrets, and OTel authorization.

After apply, use `lake_root` as `--lake-root` and `msk_bootstrap_brokers` as `--queue-broker-url` when running `scripts/package-lakehouse-release.js`. Use `scripts/run-lakehouse-terraform-rollout.js` when you want captured plan JSON, apply output, and Terraform output artifacts for the go-live report.
