/**
 * The trust layer, and the only thing here that is ever applied from a laptop.
 *
 * It has to be. The deploy role cannot create itself: it needs permissions before it can grant
 * itself any. So an administrator applies this once, and from then on every change to the real
 * stack goes through the pull request and the deploy job.
 *
 *   terraform -chdir=infra/bootstrap init
 *   terraform -chdir=infra/bootstrap apply
 *
 * The state for this one stays local. Nothing else depends on it after the first apply, and the
 * resources can be imported again if it is ever lost.
 */
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "repository" {
  type    = string
  default = "atlantic-blue/trendjack"
}

data "aws_caller_identity" "current" {}

# Already in the account, put there by another project. Reused rather than duplicated, because
# an account may only have one provider per issuer.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_s3_bucket" "state" {
  bucket = "trendjack-tfstate-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Only the main branch of this one repository may assume it.
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "trendjack-deploy"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

/**
 * What the deploy is allowed to do. Wide within this project's own names and nothing outside
 * them: the account holds other projects and this role must not be able to touch them.
 */
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "State"
    actions   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid       = "SiteBucket"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::trendjack-*", "arn:aws:s3:::trendjack-*/*"]
  }

  statement {
    sid = "TheStack"
    actions = [
      "cloudfront:*",
      "ecr:*",
      "lambda:*",
      "events:*",
      "dynamodb:*",
      "logs:*",
      "scheduler:*",
    ]
    resources = ["*"]
  }

  statement {
    sid = "RolesForTheStackOnly"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:PassRole",
      "iam:TagRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/trendjack-*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "trendjack-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}
