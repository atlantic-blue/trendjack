terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "trendjack-tfstate-230345688874"
    key    = "trendjack.tfstate"
    region = "eu-west-1"
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "name" {
  type    = string
  default = "trendjack"
}

/**
 * The panel, passed to the function as a setting. It is the curation worth having, so it is
 * never in this repository: the deploy reads it from a repository secret and passes it through.
 */
variable "panel_json" {
  type      = string
  sensitive = true
}

variable "image_uri" {
  type = string
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------- the history

# One table holds observations, posts, baselines and scores. The two indexes exist because the
# digest needs every post in the window and every score since a moment, and no natural key
# answers either without a scan.
resource "aws_dynamodb_table" "trendjack" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  attribute {
    name = "gsi1pk"
    type = "S"
  }
  attribute {
    name = "gsi1sk"
    type = "N"
  }
  attribute {
    name = "gsi2pk"
    type = "S"
  }
  attribute {
    name = "gsi2sk"
    type = "N"
  }

  global_secondary_index {
    name            = "creator-index"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "collection-index"
    hash_key        = "gsi2pk"
    range_key       = "gsi2sk"
    projection_type = "ALL"
  }

  # The history is the asset and it cannot be rebuilt from anywhere, so it can be wound back to
  # any point in the last 35 days.
  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------- the site

resource "aws_s3_bucket" "site" {
  bucket = "${var.name}-site-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The bucket is private. Only CloudFront may read it, and only this distribution.
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "trendjack daily digest"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # A day, because the digest changes once a day. The run clears digest.json afterwards, so a
    # reader is never shown yesterday.
    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # A single page application: anything not in the bucket is still the page.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json
}

# ---------------------------------------------------------------------------- the daily run

resource "aws_ecr_repository" "poller" {
  name                 = var.name
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

data "aws_iam_policy_document" "poller_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "poller" {
  name               = "${var.name}-poller"
  assume_role_policy = data.aws_iam_policy_document.poller_trust.json
}

data "aws_iam_policy_document" "poller" {
  statement {
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:*"]
  }

  statement {
    actions   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:BatchWriteItem"]
    resources = [aws_dynamodb_table.trendjack.arn, "${aws_dynamodb_table.trendjack.arn}/index/*"]
  }

  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.site.arn}/digest.json"]
  }

  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}

resource "aws_iam_role_policy" "poller" {
  name   = "${var.name}-poller"
  role   = aws_iam_role.poller.id
  policy = data.aws_iam_policy_document.poller.json
}

resource "aws_lambda_function" "poller" {
  function_name = "${var.name}-poller"
  role          = aws_iam_role.poller.arn
  package_type  = "Image"
  image_uri     = var.image_uri

  # A creator takes a few seconds and the round waits between them, so the ceiling is the panel
  # size. Fifteen minutes is the most a function may run at all.
  timeout     = 900
  memory_size = 2048

  environment {
    variables = {
      TRENDJACK_BUCKET          = aws_s3_bucket.site.id
      TRENDJACK_TABLE           = aws_dynamodb_table.trendjack.name
      TRENDJACK_DISTRIBUTION_ID = aws_cloudfront_distribution.site.id
      TRENDJACK_PANEL_JSON      = var.panel_json
    }
  }
}

resource "aws_cloudwatch_log_group" "poller" {
  name              = "/aws/lambda/${aws_lambda_function.poller.function_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_event_rule" "daily" {
  name = "${var.name}-daily"
  # Once a day. A longer gap between readings gives a larger change, which is more likely to be
  # visible past the rounding the platform applies to large counts.
  schedule_expression = "cron(0 6 * * ? *)"
}

resource "aws_cloudwatch_event_target" "daily" {
  rule = aws_cloudwatch_event_rule.daily.name
  arn  = aws_lambda_function.poller.arn
}

resource "aws_lambda_permission" "daily" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily.arn
}

# ---------------------------------------------------------------------------- outputs

output "site_url" {
  value = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  value = aws_s3_bucket.site.id
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.poller.repository_url
}

output "function_name" {
  value = aws_lambda_function.poller.function_name
}
