variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "owner" {
  description = "Owner tag"
  type        = string
  default     = "security"
}

variable "anaconda_ips_warp_v4" {
  description = "Warp egress IPv4 CIDRs. Populate via terraform.tfvars (copy from the TFC varset anaconda_ips_warp_v4 in ~/git/infra/terraform/tfc/varset-anaconda-ip-lists.tf)"
  type        = list(string)
  default     = []
}

variable "instance_type" {
  description = "EC2 instance type — t3.nano is plenty for static HTML"
  type        = string
  default     = "t3.nano"

  validation {
    condition     = can(regex("^t[2-3]\\.(nano|micro|small)$", var.instance_type))
    error_message = "Instance type must be one of t2/t3 nano/micro/small."
  }
}

variable "dist_dir" {
  description = "Path to the built dist/ directory containing index.html and quiz HTML files"
  type        = string
  default     = "../dist"
}

variable "dns_zone_name" {
  description = "Route53 hosted zone in the sandbox account"
  type        = string
  default     = "anaconda-sandbox.com"
}

variable "subdomain" {
  description = "Subdomain to publish the quiz under (full host = <subdomain>.<dns_zone_name>)"
  type        = string
  default     = "quiz"
}

variable "acme_email" {
  description = "Email for Let's Encrypt account registration / expiry notices"
  type        = string
  default     = "security@anaconda.com"
}
