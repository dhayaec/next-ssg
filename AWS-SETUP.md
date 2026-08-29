# AWS Setup Guide — Terraform + OIDC + ECS Deployment

## 1. Repository Context
- Project: `next-ssg` (Next.js static site generator)
- Terraform dir: `terraform/aws/`
- Deploy workflow: `.github/workflows/deploy.yml`
- OIDC trust: `.github/workflows/oidc-trust.json`
- AWS Account: `095232028249`
- Region: `us-east-1`

---

## 2. Prerequisites

Install on local machine / CI runner:
- **Terraform** >= 1.7.0 (`terraform/aws/main.tf` requires it)
- **AWS CLI** v2
- **Docker** (for building / pushing image)
- **Node.js** 22 + `pnpm` (project uses `pnpm-lock.yaml`)
- **GitHub repo settings** (see OIDC section)

---

## 3. AWS Credentials & Account Setup

### 3.1 Create IAM user (for initial Terraform bootstrap)
Go to AWS Console → IAM → Users → Create User
- User name: `terraform-bootstrap`
- Access type: `Programmatic access`
- Attach policy: `AdministratorAccess` (or least-privilege `PowerUserAccess` + specific ECR/ECS/S3/IAM roles)
- Save `Access Key ID` and `Secret Access Key`

### 3.2 Configure AWS CLI locally
```bash
aws configure
# AWS Access Key ID:      <from 3.1>
# AWS Secret Access Key:  <from 3.1>
# Default region name:    us-east-1
# Default output format:  json
```

---

## 4. Terraform Setup & Initialization

### 4.1 Install / verify Terraform
```bash
terraform -version   # should be >= 1.7.0
```

### 4.2 Initialize backend (local state — repo already has state)
```bash
cd terraform/aws/
terraform init
```
This downloads the AWS provider (`hashicorp/aws ~> 5.0`) shown in `main.tf`.

### 4.3 Inspect current state
```bash
terraform state list
# Shows existing resources: aws_ecr_repository.app, aws_s3_bucket.static, aws_ecs_cluster.main, etc.
```

---

## 5. Understand Existing Terraform Resources (`terraform/aws/main.tf`)

| Resource | Purpose | Notes |
|----------|---------|-------|
| `aws_ecr_repository.app` | Docker image registry for `next-ssg` | `MUTABLE` tag; scan on push |
| `aws_s3_bucket.static` | Static asset / fallback bucket | Public read policy set (`PublicReadGetObject`) |
| `aws_ecs_cluster.main` | Fargate cluster for container | Name: `next-ssg-cluster` |
| `aws_ecs_service.app` | Runs the container | Desired count = 1, Fargate, public IP |
| `aws_ecs_task_definition.app` | Container spec | CPU 256 / Memory 512; uses `amazonecs-ec2` execution role |
| `aws_ecs_task_definition.app` (image) | Pulls from ECR | `repository_url:latest` — updated by CI |
| `aws_lb.main` + `aws_lb_target_group.app` + `aws_lb_listener.http` | ALB on port 80 | Health check at `/` expects 200 |
| `aws_iam_role.ecs_execution` | ECS task execution role | Attaches `AmazonECSTaskExecutionRolePolicy` |
| `aws_cloudwatch_log_group.app` | Logs for ECS tasks | Retention 7 days |
| `aws_security_group.ecs` | Allows ingress 80, all egress | Bound to default VPC |
| `data.aws_vpc.default` + `data.aws_subnets.default` | Uses default VPC/subnets | No custom VPC created |

**Variables:** `aws_region`, `bucket_name`, `app_name` (`next-ssg` default).

---

## 6. OIDC Setup (GitHub → AWS — NO long-lived secrets)

The repo uses **OpenID Connect (OIDC)** so GitHub Actions can assume an AWS role without storing `AWS_ACCESS_KEY_ID` secrets.

### 6.1 Create OIDC Identity Provider in AWS
Go to AWS Console → IAM → Identity Providers → Add Provider
- **Provider type:** OpenID Connect
- **Provider URL:** `https://token.actions.githubusercontent.com`
- **Audience:** `sts.amazonaws.com`
- **Thumbprint:** AWS auto-fetches for `token.actions.githubusercontent.com`

Note the ARN: `arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`

### 6.2 Create the IAM Role for GitHub
Go to IAM → Roles → Create Role → Custom Trust Policy. Use the exact policy from `.github/workflows/oidc-trust.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::095232028249:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:dhayaec/*/next-ssg@*:*" }
    }
  }]
}
```

Role name: `github-oidc-next-ssg`
Attach policies:
- `AmazonECRFullAccess` (or scoped ECR push/pull)
- `AmazonECSFullAccess` (or scoped to cluster `next-ssg-cluster`)
- `AmazonEC2ContainerRegistryGetAuthorizationToken`
- `AmazonS3FullAccess` (if using S3 deploy)
- `CloudWatchLogsFullAccess`

**Note:** The `sub` condition requires repo path `dhayaec/*/next-ssg`. Adjust if your org/user differs.

### 6.3 Configure GitHub repo settings (if not already done)
Go to GitHub repo → Settings → Actions → General → **Workflow permissions** → Read and write permissions (needed for `id-token: write`).
No secret variables needed for OIDC (`AWS_ACCESS_KEY_ID` should **not** be set in repo secrets for OIDC mode).

---

## 7. Build & Push Image (Local / CI)

### 7.1 Build locally to verify
```bash
docker build -t next-ssg:local .
docker run -p 8080:80 next-ssg:local
# Check http://localhost:8080
```

### 7.2 Login to Amazon ECR
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 095232028249.dkr.ecr.us-east-1.amazonaws.com
```

### 7.3 Tag and push
```bash
export TAG=latest
export ECR_URI=095232028249.dkr.ecr.us-east-1.amazonaws.com/next-ssg
docker tag next-ssg:local $ECR_URI:$TAG
docker push $ECR_URI:$TAG
```

---

## 8. Deploy via GitHub Actions (OIDC)

The `.github/workflows/deploy.yml` runs on `push` to `main`.

### 8.1 Verify workflow prerequisites
- `permissions: id-token: write` (line 8) — required for OIDC
- `permissions: contents: read` — checkout only
- `role-to-assume: arn:aws:iam::095232028249:role/github-oidc-next-ssg` — must match IAM role created in 6.2

### 8.2 Trigger deploy
```bash
git push origin main
```
Or manually: GitHub → Actions → Deploy to AWS ECS → Run workflow.

### 8.3 What the deploy does
1. Checks out repo
2. Configures AWS credentials via OIDC (`configure-aws-credentials@v4`)
3. Logs into ECR (`amazon-ecr-login@v2`)
4. Builds with Buildx (`docker/build-push-action@v5`), pushes tags `sha` + `latest`
5. Updates ECS service (`aws ecs update-service --force-new-deployment`)
6. Waits for stability (`aws ecs wait services-stable`)

---

## 9. Make AWS Successfully Deploy It (Troubleshooting)

### 9.1 Terraform apply fails
```bash
cd terraform/aws/
terraform plan    # review changes
terraform apply   # apply (will create/update resources)
```
If state conflicts occur:
```bash
terraform refresh
terraform state rm <resource>  # only if corrupt — use carefully
```

### 9.2 Image pull failure (ECS task stops)
Check:
```bash
aws ecs describe-services --cluster next-ssg-cluster --services next-ssg --region us-east-1
```
Look for `lastStatus`: `STOPPED`. Check `events` for:
- `CannotPullContainerError`: ECR repo name / image URL wrong
- `ImageNotFound`: image tag `latest` not pushed yet
- `Task failed ELB health checks`: ALB health check at `/` fails (Next.js needs `out` folder — verify Dockerfile copies `/app/out` correctly)

Fix image: ensure `Dockerfile` builds to `/app/out` (Next.js static export) and `nginx:alpine` serves it.

### 9.3 ALB / Security Group issues
- Security group allows 80 from `0.0.0.0/0`
- ALB listener is HTTP (not HTTPS) — if you need HTTPS, add ACAM + listener rule
- Target group health path is `/`; ensure your app serves a response at root

### 9.4 OIDC assume role fails
Error: `Not authorized to perform sts:AssumeRoleWithWebIdentity`
- Check `.github/workflows/oidc-trust.json` `sub` matches your repo (`repo:dhayaec/<org>/next-ssg@...`)
- Verify `id-token: write` is in workflow `permissions`
- Confirm IAM role `github-oidc-next-ssg` exists with correct trust policy
- Check AWS account ID `095232028249` matches role ARN in `deploy.yml`

### 9.5 ECS Service does not update
After pushing new image to ECR (`:latest`), the ECS service still runs old task because it caches image digest. The deploy workflow uses `--force-new-deployment`, which forces a new deployment. If manual:
```bash
aws ecs update-service --cluster next-ssg-cluster --service next-ssg --force-new-deployment --region us-east-1
```

---

## 10. Verify Deployment End-to-End

```bash
# 1. Get ALB DNS
aws elbv2 describe-load-balancers --names next-ssg-alb --region us-east-1 --query 'LoadBalancers[0].DNSName' --output text

# 2. Curl it
curl -I http://<ALB_DNS>/
# Expect HTTP/1.1 200 OK

# 3. Check ECS running tasks
aws ecs list-tasks --cluster next-ssg-cluster --service-name next-ssg --region us-east-1

# 4. Check logs
aws logs tail /ecs/next-ssg --follow --region us-east-1
```

---

## 11. Key Files in Repo (Quick Reference)

| File | Role |
|------|------|
| `terraform/aws/main.tf` | All AWS resources (ECR, ECS, ALB, IAM, S3, Logs) |
| `terraform/aws/terraform.tfstate` | Current live state |
| `.github/workflows/deploy.yml` | CI/CD deploy pipeline (OIDC + ECR + ECS update) |
| `.github/workflows/oidc-trust.json` | Trust policy for GitHub OIDC role |
| `Dockerfile` | Multi-stage build (`node:22-alpine` → `nginx:alpine`) |
| `package.json` | `build` script produces `/app/out` (static export) |

---

## 12. Security Checklist Before Production

- [ ] OIDC provider `token.actions.githubusercontent.com` created and trusted only for this repo/org
- [ ] `sub` condition restricts to `repo:dhayaec/*/next-ssg`
- [ ] IAM role `github-oidc-next-ssg` has least-privilege (not full admin if possible)
- [ ] S3 bucket policy only allows `s3:GetObject` (already set)
- [ ] ALB listener is HTTP only; add HTTPS/ACM if needed
- [ ] ECS task execution role does not have unnecessary permissions
- [ ] No `AWS_ACCESS_KEY_ID` or secret keys in repo Settings → Secrets when using OIDC
- [ ] `force_destroy = true` on S3 bucket is convenient for dev; remove/change for prod
- [ ] Container image scanned (`scan_on_push = true` on ECR repo)
- [ ] CloudWatch log retention appropriate (currently 7 days)

---

*Created from repo contents: `terraform/aws/main.tf`, `.github/workflows/deploy.yml`, `.github/workflows/oidc-trust.json`, `Dockerfile`, `terraform/aws/terraform.tfstate`.*
