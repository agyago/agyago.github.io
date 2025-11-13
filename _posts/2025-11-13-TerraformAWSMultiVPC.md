---
layout: post
title: "Terraform AWS Multi-VPC Architecture Guide"
description: Building a production-ready multi-tier architecture with VPC peering, Auto Scaling, RDS, and ECS Fargate for log aggregation
tags: terraform aws vpc infrastructure devops iac sre
date: 2025-11-13
---

# Terraform AWS Multi-VPC Architecture Guide

This guide walks through building a production-ready multi-tier AWS architecture using Terraform, featuring VPC peering, Auto Scaling with Spot instances, RDS, and ECS Fargate for log aggregation.

## Architecture Overview

We'll build a secure, scalable architecture with network isolation between frontend and backend tiers:

```
┌─────────────────────────────────────────────────────────────────┐
│                          INTERNET                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Internet GW    │
                    └────────┬────────┘
                             │
┌────────────────────────────▼──────────────────────────────┐
│  PUBLIC VPC (10.0.0.0/16)                                 │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Public Subnet 1 (AZ-a)   Public Subnet 2 (AZ-b)│    │
│  │  ┌──────────────┐          ┌──────────────┐     │    │
│  │  │     ALB      │◄─────────►│     ALB      │     │    │
│  │  │ (10.0.1.0/24)│          │ (10.0.2.0/24)│     │    │
│  │  └──────┬───────┘          └──────┬───────┘     │    │
│  │         │                          │              │    │
│  │  ┌──────▼───────┐          ┌──────▼───────┐     │    │
│  │  │  Frontend    │          │  Jumphost    │     │    │
│  │  │    EC2       │          │    EC2       │     │    │
│  │  └──────────────┘          └──────────────┘     │    │
│  └──────────────────────────────────────────────────┘    │
└────────────────────────┬──────────────────────────────────┘
                         │
                 ┌───────▼────────┐
                 │  VPC Peering   │
                 └───────┬────────┘
                         │
┌────────────────────────▼──────────────────────────────────┐
│  PRIVATE VPC (10.1.0.0/16)                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Private Subnet 1 (AZ-a)  Private Subnet 2 (AZ-b)│    │
│  │  ┌──────────────┐          ┌──────────────┐     │    │
│  │  │  Backend EC2 │          │  Backend EC2 │     │    │
│  │  │  (ASG+Spot)  │◄────────►│  (ASG+Spot)  │     │    │
│  │  │(10.1.10.0/24)│          │(10.1.11.0/24)│     │    │
│  │  └──────┬───────┘          └──────┬───────┘     │    │
│  │         │                          │              │    │
│  │         │   ┌──────────────────┐  │              │    │
│  │         └───►  ECS Fargate     ◄──┘              │    │
│  │             │  (Log Collector) │                 │    │
│  │             └──────────────────┘                 │    │
│  │                                                   │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │  DB Subnet 1 (AZ-a)  DB Subnet 2 (AZ-b) │    │    │
│  │  │  ┌──────────────┐    ┌──────────────┐   │    │    │
│  │  │  │ RDS Primary  │◄───►│ RDS Standby  │   │    │    │
│  │  │  │   (Writer)   │    │  (Multi-AZ)  │   │    │    │
│  │  │  │(10.1.20.0/24)│    │(10.1.21.0/24)│   │    │    │
│  │  │  └──────────────┘    └──────────────┘   │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────┘
```

## Key Components

1. **Public VPC** - Internet-facing tier
   - Application Load Balancer (ALB)
   - Frontend EC2 or Jumphost
   - Internet Gateway for outbound traffic

2. **Private VPC** - Backend tier (isolated)
   - Auto Scaling Group with Spot instances
   - RDS PostgreSQL (Multi-AZ)
   - ECS Fargate for log aggregation

3. **VPC Peering** - Secure connection between VPCs
4. **Security Groups** - Fine-grained access control
5. **Cost Optimization** - Spot instances, right-sizing

---

## Prerequisites

```bash
# Install Terraform
brew install terraform  # macOS
# or download from: https://www.terraform.io/downloads

# Verify installation
terraform version

# Configure AWS credentials
aws configure
# AWS Access Key ID: YOUR_KEY
# AWS Secret Access Key: YOUR_SECRET
# Default region: us-east-1
# Default output format: json
```

---

## Project Structure

Organize your Terraform code for maintainability:

```
terraform-aws-multi-vpc/
├── main.tf                 # Main configuration
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.tfvars        # Variable values (don't commit secrets!)
├── providers.tf            # Provider configuration
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── security-groups/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── compute/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── database/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── README.md
```

For this guide, we'll use a simpler single-file approach for clarity.

---

## Step 1: Provider Configuration

Create `providers.tf`:

```hcl
# providers.tf
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Optional: Remote state storage
  # backend "s3" {
  #   bucket = "my-terraform-state-bucket"
  #   key    = "multi-vpc/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "multi-vpc-architecture"
      ManagedBy   = "Terraform"
    }
  }
}
```

---

## Step 2: Variables Configuration

Create `variables.tf`:

```hcl
# variables.tf
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "multi-vpc"
}

# VPC CIDR blocks
variable "public_vpc_cidr" {
  description = "CIDR block for public VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_vpc_cidr" {
  description = "CIDR block for private VPC"
  type        = string
  default     = "10.1.0.0/16"
}

# Availability Zones
variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# EC2 Configuration
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "spot_max_price" {
  description = "Maximum price for spot instances"
  type        = string
  default     = "0.05"  # Adjust based on current spot prices
}

variable "asg_min_size" {
  description = "Minimum size of Auto Scaling Group"
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "Maximum size of Auto Scaling Group"
  type        = number
  default     = 6
}

variable "asg_desired_capacity" {
  description = "Desired capacity of Auto Scaling Group"
  type        = number
  default     = 2
}

# RDS Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "admin"
  sensitive   = true
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS (GB)"
  type        = number
  default     = 100
}
```

Create `terraform.tfvars`:

```hcl
# terraform.tfvars
aws_region   = "us-east-1"
environment  = "production"
project_name = "my-app"

# Database credentials (use AWS Secrets Manager in production!)
db_username = "admin"
db_password = "ChangeMe123!"  # NEVER commit real passwords!

# Spot instance pricing (check current spot prices)
spot_max_price = "0.05"
```

---

## Step 3: Public VPC Configuration

Create `vpc-public.tf`:

```hcl
# vpc-public.tf
# Public VPC - For frontend/jumphost
resource "aws_vpc" "public" {
  cidr_block           = var.public_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-public-vpc"
    Tier = "public"
  }
}

# Internet Gateway for public VPC
resource "aws_internet_gateway" "public" {
  vpc_id = aws_vpc.public.id

  tags = {
    Name = "${var.project_name}-public-igw"
  }
}

# Public Subnets (for ALB and frontend EC2)
resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.public.id
  cidr_block              = cidrsubnet(var.public_vpc_cidr, 8, count.index + 1)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-subnet-${count.index + 1}"
    Tier = "public"
  }
}

# Route Table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.public.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.public.id
  }

  # Route to private VPC via peering
  route {
    cidr_block                = var.private_vpc_cidr
    vpc_peering_connection_id = aws_vpc_peering_connection.public_to_private.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

# Associate route table with public subnets
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

---

## Step 4: Private VPC Configuration

Create `vpc-private.tf`:

```hcl
# vpc-private.tf
# Private VPC - For backend applications and database
resource "aws_vpc" "private" {
  cidr_block           = var.private_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-private-vpc"
    Tier = "private"
  }
}

# Private Subnets for application tier
resource "aws_subnet" "private_app" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.private.id
  cidr_block        = cidrsubnet(var.private_vpc_cidr, 8, count.index + 10)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${var.project_name}-private-app-subnet-${count.index + 1}"
    Tier = "private-app"
  }
}

# Private Subnets for database tier
resource "aws_subnet" "private_db" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.private.id
  cidr_block        = cidrsubnet(var.private_vpc_cidr, 8, count.index + 20)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${var.project_name}-private-db-subnet-${count.index + 1}"
    Tier = "private-db"
  }
}

# Route Table for private subnets
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.private.id

  # Route to public VPC via peering
  route {
    cidr_block                = var.public_vpc_cidr
    vpc_peering_connection_id = aws_vpc_peering_connection.public_to_private.id
  }

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

# Associate route table with private app subnets
resource "aws_route_table_association" "private_app" {
  count = length(aws_subnet.private_app)

  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private.id
}

# Associate route table with private DB subnets
resource "aws_route_table_association" "private_db" {
  count = length(aws_subnet.private_db)

  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private.id
}

# DB Subnet Group for RDS
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private_db[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}
```

---

## Step 5: VPC Peering Configuration

Create `vpc-peering.tf`:

```hcl
# vpc-peering.tf
# VPC Peering Connection between public and private VPCs
resource "aws_vpc_peering_connection" "public_to_private" {
  vpc_id      = aws_vpc.public.id
  peer_vpc_id = aws_vpc.private.id
  auto_accept = true

  tags = {
    Name = "${var.project_name}-public-to-private-peering"
  }
}

# Note: Routes are defined in the VPC route tables above
```

---

## Step 6: Security Groups

Create `security-groups.tf`:

```hcl
# security-groups.tf

# Security Group for ALB (Public)
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.public.id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-alb-sg"
  }
}

# Security Group for Frontend EC2 (Public VPC)
resource "aws_security_group" "frontend" {
  name        = "${var.project_name}-frontend-sg"
  description = "Security group for frontend EC2 instances"
  vpc_id      = aws_vpc.public.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "SSH from specific IP (replace with your IP)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # CHANGE THIS to your IP!
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-frontend-sg"
  }
}

# Security Group for Backend EC2 (Private VPC)
resource "aws_security_group" "backend" {
  name        = "${var.project_name}-backend-sg"
  description = "Security group for backend EC2 instances"
  vpc_id      = aws_vpc.private.id

  ingress {
    description = "HTTP from public VPC"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.public_vpc_cidr]
  }

  ingress {
    description = "Custom app port from public VPC"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.public_vpc_cidr]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-backend-sg"
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Security group for RDS database"
  vpc_id      = aws_vpc.private.id

  ingress {
    description     = "PostgreSQL from backend instances"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

# Security Group for ECS Fargate
resource "aws_security_group" "ecs_fargate" {
  name        = "${var.project_name}-ecs-fargate-sg"
  description = "Security group for ECS Fargate tasks"
  vpc_id      = aws_vpc.private.id

  ingress {
    description = "Allow traffic from backend instances"
    from_port   = 24224  # Fluent Bit default port
    to_port     = 24224
    protocol    = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-fargate-sg"
  }
}
```

---

## Step 7: Application Load Balancer

Create `alb.tf`:

```hcl
# alb.tf
# Application Load Balancer in public VPC
resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false  # Set to true in production

  tags = {
    Name = "${var.project_name}-alb"
  }
}

# Target Group for frontend instances
resource "aws_lb_target_group" "frontend" {
  name     = "${var.project_name}-frontend-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.public.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-frontend-tg"
  }
}

# ALB Listener (HTTP)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# Optional: HTTPS Listener (requires ACM certificate)
# resource "aws_lb_listener" "https" {
#   load_balancer_arn = aws_lb.main.arn
#   port              = "443"
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-2016-08"
#   certificate_arn   = aws_acm_certificate.main.arn
#
#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.frontend.arn
#   }
# }
```

---

## Step 8: EC2 Launch Template and Auto Scaling Group

Create `compute.tf`:

```hcl
# compute.tf

# Data source for latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
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

# IAM Role for EC2 instances
resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Attach policies for CloudWatch, SSM, ECR
resource "aws_iam_role_policy_attachment" "ec2_cloudwatch" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Instance Profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# Launch Template for Backend EC2 (Spot Instances)
resource "aws_launch_template" "backend" {
  name_prefix   = "${var.project_name}-backend-"
  image_id      = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_profile.name
  }

  vpc_security_group_ids = [aws_security_group.backend.id]

  # Spot instance configuration
  instance_market_options {
    market_type = "spot"
    spot_options {
      max_price          = var.spot_max_price
      spot_instance_type = "one-time"
    }
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    # Update system
    yum update -y

    # Install Docker
    yum install -y docker
    systemctl start docker
    systemctl enable docker

    # Install CloudWatch agent
    wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
    rpm -U ./amazon-cloudwatch-agent.rpm

    # Configure Fluent Bit for log forwarding
    cat > /etc/fluent-bit/fluent-bit.conf <<EOL
    [SERVICE]
        Flush        5
        Daemon       Off
        Log_Level    info

    [INPUT]
        Name              tail
        Path              /var/log/app/*.log
        Parser            json
        Tag               app.logs

    [OUTPUT]
        Name              forward
        Match             *
        Host              ${aws_service_discovery_service.fluent.name}.${aws_service_discovery_private_dns_namespace.main.name}
        Port              24224
    EOL

    # Start application (example)
    mkdir -p /var/log/app
    docker run -d \
      -p 8080:8080 \
      -v /var/log/app:/var/log/app \
      --name backend-app \
      your-backend-app:latest

    # Send success signal
    echo "Instance initialized successfully" > /var/log/user-data.log
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project_name}-backend-instance"
    }
  }
}

# Auto Scaling Group for Backend
resource "aws_autoscaling_group" "backend" {
  name                = "${var.project_name}-backend-asg"
  vpc_zone_identifier = aws_subnet.private_app[*].id
  min_size            = var.asg_min_size
  max_size            = var.asg_max_size
  desired_capacity    = var.asg_desired_capacity

  launch_template {
    id      = aws_launch_template.backend.id
    version = "$Latest"
  }

  health_check_type         = "EC2"
  health_check_grace_period = 300

  tag {
    key                 = "Name"
    value               = "${var.project_name}-backend-asg"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }
}

# Auto Scaling Policy (Target Tracking - CPU)
resource "aws_autoscaling_policy" "backend_cpu" {
  name                   = "${var.project_name}-backend-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.backend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Frontend EC2 Instance (Single instance for demo)
resource "aws_instance" "frontend" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.frontend.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  user_data = base64encode(<<-EOF
    #!/bin/bash
    yum update -y
    yum install -y httpd
    systemctl start httpd
    systemctl enable httpd

    # Simple health check page
    echo "<h1>Frontend Server</h1>" > /var/www/html/index.html
    echo "OK" > /var/www/html/health
  EOF
  )

  tags = {
    Name = "${var.project_name}-frontend"
  }
}

# Register frontend instance with target group
resource "aws_lb_target_group_attachment" "frontend" {
  target_group_arn = aws_lb_target_group.frontend.arn
  target_id        = aws_instance.frontend.id
  port             = 80
}
```

---

## Step 9: RDS PostgreSQL Database

Create `rds.tf`:

```hcl
# rds.tf
# RDS PostgreSQL with Multi-AZ
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "postgres"
  engine_version = "15.4"

  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Multi-AZ for high availability
  multi_az = true

  # Backup configuration
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  # Performance Insights
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  performance_insights_retention_period = 7

  # Disable deletion protection for demo (enable in production!)
  deletion_protection = false
  skip_final_snapshot = true

  tags = {
    Name = "${var.project_name}-postgresql"
  }
}
```

---

## Step 10: ECS Fargate for Log Aggregation

Create `ecs-fargate.tf`:

```hcl
# ecs-fargate.tf
# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-ecs-cluster"
  }
}

# CloudWatch Log Group for ECS
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.project_name}-fluent-bit"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-ecs-logs"
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Policy to allow writing to CloudWatch Logs
resource "aws_iam_role_policy" "ecs_task_cloudwatch" {
  name = "${var.project_name}-ecs-cloudwatch-policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# ECS Task Definition for Fluent Bit
resource "aws_ecs_task_definition" "fluent_bit" {
  family                   = "${var.project_name}-fluent-bit"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "fluent-bit"
      image = "public.ecr.aws/aws-observability/aws-for-fluent-bit:latest"

      portMappings = [
        {
          containerPort = 24224
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "fluent-bit"
        }
      }

      firelensConfiguration = {
        type = "fluentbit"
        options = {
          "config-file-type" = "file"
          "config-file-value" = "/fluent-bit/etc/fluent-bit.conf"
        }
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-fluent-bit-task"
  }
}

# Service Discovery Namespace
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${var.project_name}.local"
  vpc  = aws_vpc.private.id

  tags = {
    Name = "${var.project_name}-service-discovery"
  }
}

# Service Discovery Service
resource "aws_service_discovery_service" "fluent" {
  name = "fluent-bit"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Name = "${var.project_name}-fluent-bit-discovery"
  }
}

# ECS Service for Fluent Bit
resource "aws_ecs_service" "fluent_bit" {
  name            = "${var.project_name}-fluent-bit-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.fluent_bit.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private_app[*].id
    security_groups  = [aws_security_group.ecs_fargate.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.fluent.arn
  }

  tags = {
    Name = "${var.project_name}-fluent-bit-service"
  }
}
```

---

## Step 11: Outputs

Create `outputs.tf`:

```hcl
# outputs.tf
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "public_vpc_id" {
  description = "ID of the public VPC"
  value       = aws_vpc.public.id
}

output "private_vpc_id" {
  description = "ID of the private VPC"
  value       = aws_vpc.private.id
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "frontend_instance_id" {
  description = "ID of the frontend EC2 instance"
  value       = aws_instance.frontend.id
}

output "backend_asg_name" {
  description = "Name of the backend Auto Scaling Group"
  value       = aws_autoscaling_group.backend.name
}
```

---

## Deployment Steps

### Initialize Terraform

```bash
# Navigate to project directory
cd terraform-aws-multi-vpc

# Initialize Terraform (downloads providers)
terraform init
```

### Validate Configuration

```bash
# Validate syntax
terraform validate

# Format code
terraform fmt -recursive
```

### Plan Deployment

```bash
# See what will be created
terraform plan

# Save plan to file
terraform plan -out=tfplan
```

### Apply Configuration

```bash
# Apply changes
terraform apply

# Or apply saved plan
terraform apply tfplan

# Type 'yes' when prompted
```

### Verify Resources

```bash
# Check outputs
terraform output

# Get ALB DNS
terraform output alb_dns_name

# Get RDS endpoint
terraform output -raw rds_endpoint
```

### Access Application

```bash
# Get ALB URL
ALB_URL=$(terraform output -raw alb_dns_name)

# Test frontend
curl http://$ALB_URL

# Wait for DNS propagation (may take a few minutes)
```

---

## Common Issues and Troubleshooting

### Issue 1: "Error creating VPC Peering Connection"

**Symptoms:**
```
Error: error creating VPC Peering Connection: InvalidVpcPeeringConnectionID.NotFound
```

**Cause:** VPCs not in the same region or auto_accept failed.

**Solution:**
```hcl
# Ensure both VPCs are in same region
# Check if you need separate accepter configuration

resource "aws_vpc_peering_connection_accepter" "peer" {
  vpc_peering_connection_id = aws_vpc_peering_connection.public_to_private.id
  auto_accept               = true
}
```

---

### Issue 2: "Spot Instance Interrupted"

**Symptoms:**
```
EC2 instances in ASG keep terminating
CloudWatch logs: "Spot instance interrupted"
```

**Cause:** Spot price exceeded max price or capacity unavailable.

**Solution:**
```hcl
# Option 1: Increase max price
variable "spot_max_price" {
  default = "0.10"  # Check current spot prices
}

# Option 2: Use multiple instance types
resource "aws_launch_template" "backend" {
  instance_type = var.instance_type

  # Add mixed instances policy
  instance_requirements {
    memory_mib {
      min = 4096
    }
    vcpu_count {
      min = 2
    }
  }
}

# Option 3: Mix spot and on-demand
resource "aws_autoscaling_group" "backend" {
  mixed_instances_policy {
    instances_distribution {
      on_demand_base_capacity                  = 1
      on_demand_percentage_above_base_capacity = 25
      spot_allocation_strategy                 = "capacity-optimized"
    }

    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.backend.id
      }

      override {
        instance_type = "t3.medium"
      }
      override {
        instance_type = "t3a.medium"
      }
    }
  }
}
```

---

### Issue 3: "RDS Connection Timeout"

**Symptoms:**
```
Application can't connect to RDS
Error: "Connection timed out"
```

**Diagnosis:**
```bash
# From backend EC2 instance
nc -zv <rds-endpoint> 5432

# Check security group rules
aws ec2 describe-security-groups --group-ids <rds-sg-id>

# Check route tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=<vpc-id>"
```

**Solutions:**
```hcl
# 1. Verify security group allows traffic
resource "aws_security_group" "rds" {
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]  # ✓ Correct
    # cidr_blocks   = ["10.1.0.0/16"]                  # ✗ Less secure
  }
}

# 2. Ensure RDS is in private subnets
resource "aws_db_instance" "main" {
  db_subnet_group_name = aws_db_subnet_group.main.name
  publicly_accessible  = false  # Important!
}

# 3. Check DNS resolution
resource "aws_vpc" "private" {
  enable_dns_hostnames = true  # Must be true
  enable_dns_support   = true  # Must be true
}
```

---

### Issue 4: "ECS Task Failed to Start"

**Symptoms:**
```
ECS tasks stuck in PENDING state
Events: "CannotPullContainerError"
```

**Diagnosis:**
```bash
# Check ECS task status
aws ecs describe-tasks --cluster <cluster-name> --tasks <task-arn>

# Check CloudWatch logs
aws logs tail /ecs/<project>-fluent-bit --follow
```

**Solutions:**
```hcl
# 1. Ensure NAT Gateway or VPC endpoints for ECR
# Option A: NAT Gateway (costs $)
resource "aws_nat_gateway" "private" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
}

# Option B: VPC Endpoints (no internet needed)
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id             = aws_vpc.private.id
  service_name       = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = aws_subnet.private_app[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id             = aws_vpc.private.id
  service_name       = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = aws_subnet.private_app[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]
}

# 2. Verify IAM role has ECR permissions
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
```

---

### Issue 5: "Terraform State Lock"

**Symptoms:**
```
Error: Error acquiring the state lock
Lock Info:
  ID:        xxxxx
  Operation: OperationTypeApply
```

**Solution:**
```bash
# Check if another terraform process is running
ps aux | grep terraform

# If stuck, force unlock (use carefully!)
terraform force-unlock <lock-id>

# Better: Use remote state with locking
# In providers.tf:
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "multi-vpc/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

---

## Cost Optimization Tips

### 1. Use Spot Instances Wisely

```hcl
# Mix spot and on-demand for reliability
mixed_instances_policy {
  instances_distribution {
    on_demand_base_capacity                  = 1      # 1 on-demand always
    on_demand_percentage_above_base_capacity = 25     # 25% on-demand, 75% spot
    spot_allocation_strategy                 = "capacity-optimized"
  }
}

# Use multiple instance types to increase spot availability
override {
  instance_type = "t3.medium"
}
override {
  instance_type = "t3a.medium"  # AMD variant, usually cheaper
}
override {
  instance_type = "t2.medium"   # Previous generation
}
```

### 2. Right-Size Your Resources

```hcl
# Start small, scale up based on metrics
variable "instance_type" {
  default = "t3.small"  # Instead of t3.large
}

variable "db_instance_class" {
  default = "db.t3.medium"  # Instead of db.r5.large
}

# Use auto-scaling to handle peaks
resource "aws_autoscaling_policy" "backend_cpu" {
  target_tracking_configuration {
    target_value = 70.0  # Scale at 70% CPU
  }
}
```

### 3. Use VPC Endpoints Instead of NAT Gateway

```hcl
# NAT Gateway costs ~$32/month + data transfer
# VPC Endpoints cost ~$7/month per endpoint (no data charges)

# For private subnets accessing AWS services:
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.private.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  route_table_ids = [aws_route_table.private.id]
}
```

### 4. Enable RDS Auto-Pause (for Aurora)

```hcl
# If using Aurora Serverless
resource "aws_rds_cluster" "main" {
  engine_mode = "serverless"

  scaling_configuration {
    auto_pause               = true
    max_capacity             = 4
    min_capacity             = 2
    seconds_until_auto_pause = 300  # Pause after 5 min idle
  }
}
```

### 5. Use gp3 Instead of gp2

```hcl
# gp3 is ~20% cheaper than gp2
resource "aws_db_instance" "main" {
  storage_type = "gp3"  # Instead of "gp2"
}
```

### 6. Set Lifecycle Rules for CloudWatch Logs

```hcl
resource "aws_cloudwatch_log_group" "ecs_logs" {
  retention_in_days = 7  # Instead of infinite retention
}
```

### Current Cost Estimate

Based on us-east-1 pricing (approximate monthly costs):

| Resource | Configuration | Estimated Cost |
|----------|--------------|----------------|
| EC2 (Spot) | 2x t3.medium (75% spot) | $25 |
| RDS | db.t3.medium Multi-AZ | $85 |
| ALB | 1x ALB | $16 |
| ECS Fargate | 2x tasks (512 CPU, 1GB) | $15 |
| Data Transfer | 100 GB/month | $9 |
| CloudWatch | Logs + Metrics | $5 |
| **Total** | | **~$155/month** |

---

## Clean Up Resources

**Important:** Always destroy resources when done to avoid charges!

```bash
# Destroy all resources
terraform destroy

# Review what will be deleted
terraform destroy -auto-approve=false

# Target specific resources
terraform destroy -target=aws_db_instance.main

# If destroy fails, try:
# 1. Disable deletion protection
terraform apply -var="db_deletion_protection=false"

# 2. Then destroy
terraform destroy
```

---

## Best Practices Summary

### Security
1. ✅ Use security groups with least privilege
2. ✅ Enable encryption at rest (RDS, EBS)
3. ✅ Use IAM roles instead of access keys
4. ✅ Store secrets in AWS Secrets Manager
5. ✅ Enable VPC Flow Logs
6. ✅ Use private subnets for backend/database

### High Availability
1. ✅ Multi-AZ deployment for RDS
2. ✅ Auto Scaling Groups across 2+ AZs
3. ✅ Application Load Balancer with health checks
4. ✅ Multiple ECS tasks for log aggregation

### Operational Excellence
1. ✅ Enable CloudWatch monitoring
2. ✅ Use remote state with locking (S3 + DynamoDB)
3. ✅ Tag all resources consistently
4. ✅ Use modules for reusability
5. ✅ Version your Terraform code in Git

### Cost Optimization
1. ✅ Use Spot instances with on-demand mix
2. ✅ Right-size instances based on metrics
3. ✅ Use VPC endpoints instead of NAT
4. ✅ Set CloudWatch log retention
5. ✅ Use gp3 storage

---

## Next Steps

1. **Add HTTPS:** Configure ACM certificate and HTTPS listener
2. **Secrets Management:** Move DB credentials to AWS Secrets Manager
3. **Monitoring:** Set up CloudWatch dashboards and alarms
4. **CI/CD:** Integrate with GitHub Actions or GitLab CI
5. **Backup:** Configure automated backups and disaster recovery
6. **WAF:** Add AWS WAF for application protection

---

## Additional Resources

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS VPC Peering Guide](https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html)
- [ECS Fargate Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [Spot Instance Best Practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-best-practices.html)

This guide provides a solid foundation for building production-ready AWS infrastructure with Terraform!
