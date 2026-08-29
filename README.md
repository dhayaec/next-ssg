# next-ssg

Next.js 15 app (TypeScript strict, pnpm) that displays users from JSONPlaceholder.

## Stack
- Next.js 15 App Router
- TypeScript (`strict: true`)
- pnpm
- AWS (Terraform S3 + CloudFront)
- GitHub Actions CI/CD

## Run
```bash
pnpm dev       # localhost:3000
pnpm build     # static export to out/
```

## Infra
```bash
cd terraform/aws
terraform init
terraform apply -var="bucket_name=my-bucket"
```
