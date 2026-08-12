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

variable "table_name" {
  type    = string
  default = "trendjack"
}

# One table holds observations, posts, baselines and scores. The two indexes exist because the
# digest needs every post in the window and every score since a moment, and no natural key
# answers either without a scan.
resource "aws_dynamodb_table" "trendjack" {
  name         = var.table_name
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

  # The history is the asset and it cannot be rebuilt from anywhere, so the table is protected
  # from deletion and can be wound back to any point in the last 35 days.
  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    project = "trendjack"
  }
}

output "table_name" {
  value = aws_dynamodb_table.trendjack.name
}
