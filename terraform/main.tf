# Security Team Quiz Host
# Tiny EC2 in the sandbox account, nginx serving dist/, locked to Warp egress IPs.
# Sandbox is torn down weekly — reapply to redeploy with a new quiz.

terraform {
  required_version = "1.15.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.15.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.7.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  # Auth comes from your ambient AWS SSO profile.
  # Run: aws sso login --profile <sandbox-profile>
  # Then: AWS_PROFILE=<sandbox-profile> terraform apply

  default_tags {
    tags = {
      environment    = "sandbox"
      application    = "security-quiz"
      owner          = var.owner
      provisioned-by = "terraform"
      sprinto        = "notprod"
    }
  }
}

# Latest Amazon Linux 2023
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Default VPC / subnets — sandbox doesn't need anything fancy
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  name = "security-quiz"

  # Warp IPv4 ranges from the central TFC varset (TF_VAR_anaconda_ips_warp_v4).
  # If the var is empty (not propagated), fall back to a closed list.
  warp_ipv4_cidrs = length(var.anaconda_ips_warp_v4) > 0 ? var.anaconda_ips_warp_v4 : []

  hostname = "${var.subdomain}.${var.dns_zone_name}"
}

# Route53 zone (managed outside this stack, in the sandbox account)
data "aws_route53_zone" "quiz" {
  name         = var.dns_zone_name
  private_zone = false
}

resource "aws_route53_record" "quiz" {
  zone_id = data.aws_route53_zone.quiz.zone_id
  name    = local.hostname
  type    = "A"
  ttl     = 60
  records = [aws_eip.quiz.public_ip]
}

# Bundle the built quiz site. Stored in S3 because user_data is capped at 16KB
# and the dist zip is bigger than that.
data "archive_file" "dist" {
  type        = "zip"
  source_dir  = var.dist_dir
  output_path = "${path.module}/.dist.zip"
}

resource "aws_s3_bucket" "dist" {
  bucket_prefix = "${local.name}-dist-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "dist" {
  bucket                  = aws_s3_bucket.dist.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "dist" {
  bucket      = aws_s3_bucket.dist.id
  key         = "dist.zip"
  source      = data.archive_file.dist.output_path
  source_hash = data.archive_file.dist.output_md5
}

resource "aws_security_group" "quiz" {
  name        = "${local.name}-sg"
  description = "Quiz host - HTTPS/HTTP from Warp IPs only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP from Warp"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = local.warp_ipv4_cidrs
  }

  ingress {
    description = "HTTPS from Warp"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = local.warp_ipv4_cidrs
  }

  egress {
    description = "All outbound (yum, github, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-sg" }
}

# Minimal IAM — just SSM Session Manager so we don't need a key pair
resource "aws_iam_role" "quiz" {
  name = "${local.name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.quiz.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "dist_read" {
  name = "${local.name}-dist-read"
  role = aws_iam_role.quiz.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "${aws_s3_bucket.dist.arn}/*"
    }]
  })
}

# Caddy uses DNS-01 ACME challenge to obtain certs without exposing port 80
# to the world. Scoped to the quiz hosted zone only.
resource "aws_iam_role_policy" "route53_acme" {
  name = "${local.name}-route53-acme"
  role = aws_iam_role.quiz.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["route53:GetChange"]
        Resource = "arn:aws:route53:::change/*"
      },
      {
        Effect   = "Allow"
        Action   = ["route53:ListHostedZonesByName"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"]
        Resource = "arn:aws:route53:::hostedzone/${data.aws_route53_zone.quiz.zone_id}"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "quiz" {
  name = "${local.name}-profile"
  role = aws_iam_role.quiz.name
}

resource "aws_eip" "quiz" {
  domain = "vpc"
  tags   = { Name = "${local.name}-eip" }
}

resource "aws_instance" "quiz" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.quiz.id]
  iam_instance_profile   = aws_iam_instance_profile.quiz.name
  subnet_id              = data.aws_subnets.default.ids[0]

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    encrypted             = true
    delete_on_termination = true
  }

  # Require IMDSv2 — defense-in-depth against SSRF leaking the instance role.
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }

  # The instance fetches the dist zip from S3 on first boot.
  # We embed the archive's md5 (known at plan time) so that when the dist
  # contents change, user_data changes too, and replace_on_change recreates
  # the instance. Don't use aws_s3_object.etag here — it's "known after
  # apply" and causes a "Provider produced inconsistent final plan" error.
  user_data = templatefile("${path.module}/user-data.sh", {
    dist_bucket = aws_s3_bucket.dist.bucket
    dist_key    = aws_s3_object.dist.key
    dist_etag   = data.archive_file.dist.output_md5
    aws_region  = var.aws_region
    hostname    = local.hostname
    acme_email  = var.acme_email
  })

  user_data_replace_on_change = true

  tags = { Name = local.name }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_eip_association" "quiz" {
  instance_id   = aws_instance.quiz.id
  allocation_id = aws_eip.quiz.id
}
