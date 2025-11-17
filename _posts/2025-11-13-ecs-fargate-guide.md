---
layout: post
title: "AWS ECS Fargate Complete Guide - From Zero to Production"
description: Hands-on guide to deploying containerized applications with ECS Fargate, including ECR, IAM, secrets management, auto-scaling, and troubleshooting
tags: aws ecs fargate docker containers devops sre
date: 2025-11-13
---

# AWS ECS Fargate Complete Guide - From Zero to Production

A practical, hands-on guide to deploying containerized applications using AWS ECS Fargate, with real examples, both AWS CLI and Terraform, and production-ready configurations.

## What is ECS Fargate?

**ECS (Elastic Container Service)** is AWS's container orchestration service. **Fargate** is the serverless compute engine for ECS that eliminates the need to manage EC2 instances.

### Why Fargate over EC2 Launch Type?

| Feature | Fargate | ECS on EC2 |
|---------|---------|------------|
| **Server Management** | None - serverless | You manage EC2 instances |
| **Scaling** | Automatic | Manual ASG + capacity planning |
| **Billing** | Pay per task (vCPU + memory) | Pay for EC2 instances |
| **Startup Time** | Fast (30-60 seconds) | Slower (instance boot time) |
| **Patching** | AWS manages | You manage OS patches |
| **Best For** | Most workloads, microservices | Cost optimization at scale, special instance types |

**We'll use Fargate** - it's simpler, more common in production, and perfect for most use cases.

---

## Architecture Overview

We'll build this production-ready setup:

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │  Route 53 DNS   │
                  └────────┬────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  VPC (10.0.0.0/16)                                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Public Subnets (AZ-a, AZ-b)                        │   │
│  │  ┌──────────────────────────────────────────┐       │   │
│  │  │   Application Load Balancer (ALB)        │       │   │
│  │  │   - Health checks                         │       │   │
│  │  │   - SSL termination                       │       │   │
│  │  └──────────────┬───────────────────────────┘       │   │
│  └─────────────────┼─────────────────────────────────────┘   │
│                    │                                          │
│  ┌─────────────────▼─────────────────────────────────────┐   │
│  │  Private Subnets (AZ-a, AZ-b)                        │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │   ECS Fargate Tasks (Auto-scaled)            │   │   │
│  │  │   ┌─────────────┐    ┌─────────────┐         │   │   │
│  │  │   │   Task 1    │    │   Task 2    │         │   │   │
│  │  │   │  Container  │    │  Container  │         │   │   │
│  │  │   │  Flask API  │    │  Flask API  │         │   │   │
│  │  │   └─────┬───────┘    └─────┬───────┘         │   │   │
│  │  │         │                   │                  │   │   │
│  │  │         └───────────┬───────┘                  │   │   │
│  │  │                     │                          │   │   │
│  │  │           ┌─────────▼──────────┐              │   │   │
│  │  │           │  Service Discovery │              │   │   │
│  │  │           │   (Cloud Map)      │              │   │   │
│  │  │           └────────────────────┘              │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │   Supporting Services                        │   │   │
│  │  │   - Secrets Manager (DB credentials)         │   │   │
│  │  │   - CloudWatch Logs (application logs)       │   │   │
│  │  │   - CloudWatch Metrics (monitoring)          │   │   │
│  │  │   - ECR (container images)                   │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core ECS Concepts

Before we start, understand these key components:

### 1. **Cluster**
Logical grouping of tasks or services. Just a namespace in Fargate (no EC2 instances to manage).

### 2. **Task Definition**
Blueprint for your application - defines:
- Container images to use
- CPU and memory allocation
- Environment variables
- IAM roles
- Networking mode
- Logging configuration

Think of it like a Kubernetes Pod specification.

### 3. **Task**
Running instance of a Task Definition. A task can contain one or more containers.

### 4. **Service**
Manages long-running tasks:
- Ensures desired number of tasks running
- Integrates with load balancers
- Handles rolling deployments
- Auto-scaling

### 5. **Container Definition**
Specifies a single container within a task:
- Docker image
- Port mappings
- Environment variables
- Resource limits

### Task Execution Role vs Task Role

**This is crucial - one of the most confusing parts of ECS!**

```
┌─────────────────────────────────────────────────┐
│  Task Execution Role                            │
│  (Used by ECS agent - pulling images, logs)     │
│                                                  │
│  Permissions:                                    │
│  ✓ Pull images from ECR                         │
│  ✓ Write logs to CloudWatch                     │
│  ✓ Get secrets from Secrets Manager             │
│                                                  │
│  → AWS manages this, happens BEFORE container   │
│     starts                                       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Task Role                                       │
│  (Used by your application code)                 │
│                                                  │
│  Permissions:                                    │
│  ✓ Access S3 buckets                            │
│  ✓ Query DynamoDB                               │
│  ✓ Send SQS messages                            │
│                                                  │
│  → Your app uses this, happens AFTER container  │
│     starts                                       │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

```bash
# Install AWS CLI
brew install awscli  # macOS
# or: https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure
# AWS Access Key ID: YOUR_KEY
# AWS Secret Access Key: YOUR_SECRET
# Default region: us-east-1
# Default output format: json

# Install Docker
brew install docker  # macOS
# or: https://docs.docker.com/get-docker/

# Install jq (for parsing JSON)
brew install jq

# Verify installations
aws --version
docker --version
jq --version
```

---

## Our Sample Application

We'll deploy a simple Python Flask REST API with health checks and logging.

### Create the Flask Application

Create `app.py`:

```python
# app.py
from flask import Flask, jsonify, request
import os
import socket
import logging
from datetime import datetime

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# In-memory storage for demo
items = []

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for ALB"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@app.route('/info', methods=['GET'])
def info():
    """Returns container and environment info"""
    return jsonify({
        'hostname': socket.gethostname(),
        'environment': os.getenv('ENVIRONMENT', 'unknown'),
        'version': os.getenv('APP_VERSION', '1.0.0'),
        'region': os.getenv('AWS_REGION', 'unknown'),
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@app.route('/api/items', methods=['GET'])
def get_items():
    """Get all items"""
    logger.info(f"GET /api/items - Returning {len(items)} items")
    return jsonify({'items': items}), 200

@app.route('/api/items', methods=['POST'])
def create_item():
    """Create a new item"""
    data = request.get_json()

    if not data or 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400

    item = {
        'id': len(items) + 1,
        'name': data['name'],
        'created_at': datetime.utcnow().isoformat()
    }
    items.append(item)

    logger.info(f"POST /api/items - Created item: {item}")
    return jsonify(item), 201

@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item(item_id):
    """Get a specific item"""
    item = next((i for i in items if i['id'] == item_id), None)

    if not item:
        return jsonify({'error': 'Item not found'}), 404

    logger.info(f"GET /api/items/{item_id} - Returning item")
    return jsonify(item), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting Flask app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
```

Create `requirements.txt`:

```txt
Flask==3.0.0
gunicorn==21.2.0
```

Create `Dockerfile`:

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first (better caching)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

# Run with Gunicorn (production WSGI server)
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "60", "app:app"]
```

Create `.dockerignore`:

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.git
.gitignore
README.md
```

### Test Locally

```bash
# Build the image
docker build -t flask-api:latest .

# Run locally
docker run -p 8080:8080 \
  -e ENVIRONMENT=local \
  -e APP_VERSION=1.0.0 \
  flask-api:latest

# Test endpoints (in another terminal)
curl http://localhost:8080/health
curl http://localhost:8080/info
curl -X POST http://localhost:8080/api/items -H "Content-Type: application/json" -d '{"name":"test"}'
curl http://localhost:8080/api/items
```

---

## Step 1: Create ECR Repository

### Using AWS CLI

```bash
# Create repository
aws ecr create-repository \
  --repository-name flask-api \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Get repository URI
REPO_URI=$(aws ecr describe-repositories \
  --repository-names flask-api \
  --region us-east-1 \
  --query 'repositories[0].repositoryUri' \
  --output text)

echo "Repository URI: $REPO_URI"
```

### Using Terraform

```hcl
# ecr.tf
resource "aws_ecr_repository" "flask_api" {
  name                 = "flask-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "flask-api"
  }
}

# Lifecycle policy to keep only last 10 images
resource "aws_ecr_lifecycle_policy" "flask_api" {
  repository = aws_ecr_repository.flask_api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus     = "any"
        countType     = "imageCountMoreThan"
        countNumber   = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

output "ecr_repository_url" {
  value = aws_ecr_repository.flask_api.repository_url
}
```

---

## Step 2: Build and Push Image to ECR

```bash
# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
REPO_NAME=flask-api
IMAGE_TAG=v1.0.0

# Full image URI
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}"

# Authenticate Docker to ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin \
  ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Build image
docker build -t $REPO_NAME:$IMAGE_TAG .

# Tag image for ECR
docker tag $REPO_NAME:$IMAGE_TAG $IMAGE_URI

# Push to ECR
docker push $IMAGE_URI

# Verify upload
aws ecr describe-images \
  --repository-name $REPO_NAME \
  --region $REGION
```

---

## Step 3: Create VPC and Networking

We'll use the VPC structure from our [Terraform Multi-VPC guide](/2025/11/13/TerraformAWSMultiVPC.html).

### Quick VPC Setup (AWS CLI)

```bash
# Create VPC
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --region us-east-1 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=ecs-vpc}]' \
  --query 'Vpc.VpcId' \
  --output text)

# Enable DNS hostnames
aws ec2 modify-vpc-attribute \
  --vpc-id $VPC_ID \
  --enable-dns-hostnames

# Create Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=ecs-igw}]' \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)

aws ec2 attach-internet-gateway \
  --vpc-id $VPC_ID \
  --internet-gateway-id $IGW_ID

# Create Public Subnets (for ALB)
PUBLIC_SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ecs-public-1}]' \
  --query 'Subnet.SubnetId' \
  --output text)

PUBLIC_SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ecs-public-2}]' \
  --query 'Subnet.SubnetId' \
  --output text)

# Create Private Subnets (for ECS tasks)
PRIVATE_SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.10.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ecs-private-1}]' \
  --query 'Subnet.SubnetId' \
  --output text)

PRIVATE_SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ecs-private-2}]' \
  --query 'Subnet.SubnetId' \
  --output text)

# Create and configure route tables
# (Public route table with IGW, Private route table - add NAT Gateway if needed)
```

**Note:** For production, add NAT Gateways or VPC endpoints. See the [Terraform guide](/2025/11/13/TerraformAWSMultiVPC.html) for complete setup.

---

## Step 4: Create IAM Roles

### Task Execution Role (AWS CLI)

```bash
# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "ecs-tasks.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://trust-policy.json

# Attach AWS managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Add Secrets Manager access
cat > secrets-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "secretsmanager:GetSecretValue",
      "kms:Decrypt"
    ],
    "Resource": "*"
  }]
}
EOF

aws iam put-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-name SecretsManagerAccess \
  --policy-document file://secrets-policy.json
```

### Task Role (AWS CLI)

```bash
# Create task role (for application)
aws iam create-role \
  --role-name ecsTaskRole \
  --assume-role-policy-document file://trust-policy.json

# Add application-specific permissions
cat > app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:GetObject",
      "s3:PutObject"
    ],
    "Resource": "arn:aws:s3:::my-app-bucket/*"
  }]
}
EOF

aws iam put-role-policy \
  --role-name ecsTaskRole \
  --policy-name AppS3Access \
  --policy-document file://app-policy.json
```

### Using Terraform

```hcl
# iam.tf
# Task Execution Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "ecsTaskExecutionRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional policy for Secrets Manager
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "SecretsManagerAccess"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ]
      Resource = "*"
    }]
  })
}

# Task Role (for application)
resource "aws_iam_role" "ecs_task_role" {
  name = "ecsTaskRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

# Example: Grant S3 access to application
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "AppS3Access"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject"
      ]
      Resource = "arn:aws:s3:::my-app-bucket/*"
    }]
  })
}
```

---

## Step 5: Create Secrets in Secrets Manager

```bash
# Create a secret for demo
aws secretsmanager create-secret \
  --name flask-api/database \
  --description "Database credentials for Flask API" \
  --secret-string '{
    "username": "admin",
    "password": "YourSecurePassword123!",
    "host": "db.example.com",
    "database": "myapp"
  }' \
  --region us-east-1

# Get secret ARN (needed for task definition)
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id flask-api/database \
  --region us-east-1 \
  --query 'ARN' \
  --output text)

echo "Secret ARN: $SECRET_ARN"
```

### Terraform Version

```hcl
# secrets.tf
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "flask-api/database"
  description = "Database credentials for Flask API"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "admin"
    password = var.db_password  # From terraform.tfvars
    host     = aws_db_instance.main.endpoint
    database = "myapp"
  })
}

output "secret_arn" {
  value     = aws_secretsmanager_secret.db_credentials.arn
  sensitive = true
}
```

---

## Step 6: Create ECS Cluster

### AWS CLI

```bash
# Create cluster
aws ecs create-cluster \
  --cluster-name flask-api-cluster \
  --region us-east-1 \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4

# Verify cluster
aws ecs describe-clusters \
  --clusters flask-api-cluster \
  --region us-east-1
```

### Terraform

```hcl
# ecs-cluster.tf
resource "aws_ecs_cluster" "main" {
  name = "flask-api-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "flask-api-cluster"
  }
}

# Capacity providers for cost optimization
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }

  default_capacity_provider_strategy {
    weight            = 4
    capacity_provider = "FARGATE_SPOT"
  }
}
```

**Note:** This uses 80% Fargate Spot (cheaper) and 20% regular Fargate.

---

## Step 7: Create Task Definition

This is the heart of your ECS setup!

### Create Task Definition JSON

Create `task-definition.json`:

```json
{
  "family": "flask-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "flask-api",
      "image": "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/flask-api:v1.0.0",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "ENVIRONMENT",
          "value": "production"
        },
        {
          "name": "APP_VERSION",
          "value": "1.0.0"
        },
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "secrets": [
        {
          "name": "DB_USERNAME",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:flask-api/database:username::"
        },
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:flask-api/database:password::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/flask-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "flask"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### Register Task Definition (AWS CLI)

```bash
# Replace ACCOUNT_ID in the JSON file
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed -i "s/ACCOUNT_ID/$ACCOUNT_ID/g" task-definition.json

# Create CloudWatch log group first
aws logs create-log-group \
  --log-group-name /ecs/flask-api \
  --region us-east-1

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json \
  --region us-east-1

# List task definitions
aws ecs list-task-definitions \
  --family-prefix flask-api \
  --region us-east-1
```

### Terraform Version

```hcl
# ecs-task-definition.tf
# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "flask_api" {
  name              = "/ecs/flask-api"
  retention_in_days = 7

  tags = {
    Name = "flask-api-logs"
  }
}

# Task Definition
resource "aws_ecs_task_definition" "flask_api" {
  family                   = "flask-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name      = "flask-api"
    image     = "${aws_ecr_repository.flask_api.repository_url}:v1.0.0"
    essential = true

    portMappings = [{
      containerPort = 8080
      protocol      = "tcp"
    }]

    environment = [
      { name = "ENVIRONMENT", value = "production" },
      { name = "APP_VERSION", value = "1.0.0" },
      { name = "AWS_REGION", value = var.aws_region }
    ]

    secrets = [
      {
        name      = "DB_USERNAME"
        valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::"
      },
      {
        name      = "DB_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.flask_api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "flask"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name = "flask-api-task-definition"
  }
}
```

---

## Step 8: Run a One-Off Task

Before creating a service, test with a single task:

```bash
# Run a task
aws ecs run-task \
  --cluster flask-api-cluster \
  --task-definition flask-api:1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxx,subnet-yyy],
    securityGroups=[sg-xxx],
    assignPublicIp=ENABLED
  }" \
  --region us-east-1

# List running tasks
aws ecs list-tasks \
  --cluster flask-api-cluster \
  --region us-east-1

# Describe task
TASK_ARN=$(aws ecs list-tasks \
  --cluster flask-api-cluster \
  --region us-east-1 \
  --query 'taskArns[0]' \
  --output text)

aws ecs describe-tasks \
  --cluster flask-api-cluster \
  --tasks $TASK_ARN \
  --region us-east-1

# Stop task
aws ecs stop-task \
  --cluster flask-api-cluster \
  --task $TASK_ARN \
  --region us-east-1
```

---

## Step 9: Create Application Load Balancer

### Security Groups

```bash
# ALB Security Group
ALB_SG=$(aws ec2 create-security-group \
  --group-name flask-api-alb-sg \
  --description "Security group for ALB" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

# Allow HTTP/HTTPS from internet
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# ECS Task Security Group
ECS_SG=$(aws ec2 create-security-group \
  --group-name flask-api-ecs-sg \
  --description "Security group for ECS tasks" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

# Allow traffic from ALB
aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG \
  --protocol tcp \
  --port 8080 \
  --source-group $ALB_SG
```

### Create ALB

```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name flask-api-alb \
  --subnets $PUBLIC_SUBNET_1 $PUBLIC_SUBNET_2 \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region us-east-1 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Create Target Group
TG_ARN=$(aws elbv2 create-target-group \
  --name flask-api-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-enabled \
  --health-check-protocol HTTP \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region us-east-1 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Create Listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --region us-east-1

# Get ALB DNS name
aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region us-east-1 \
  --query 'LoadBalancers[0].DNSName' \
  --output text
```

### Terraform Version

```hcl
# alb.tf
# Security Groups
resource "aws_security_group" "alb" {
  name        = "flask-api-alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "flask-api-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "flask-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]

  enable_deletion_protection = false

  tags = {
    Name = "flask-api-alb"
  }
}

# Target Group
resource "aws_lb_target_group" "main" {
  name        = "flask-api-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30
}

# Listener
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}
```

---

## Step 10: Create ECS Service

Now create a service that manages multiple tasks behind the ALB:

### AWS CLI

Create `service-definition.json`:

```json
{
  "cluster": "flask-api-cluster",
  "serviceName": "flask-api-service",
  "taskDefinition": "flask-api:1",
  "desiredCount": 2,
  "launchType": "FARGATE",
  "platformVersion": "LATEST",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-xxx", "subnet-yyy"],
      "securityGroups": ["sg-xxx"],
      "assignPublicIp": "DISABLED"
    }
  },
  "loadBalancers": [
    {
      "targetGroupArn": "arn:aws:elasticloadbalancing:us-east-1:ACCOUNT:targetgroup/flask-api-tg/xxx",
      "containerName": "flask-api",
      "containerPort": 8080
    }
  ],
  "healthCheckGracePeriodSeconds": 60,
  "deploymentConfiguration": {
    "maximumPercent": 200,
    "minimumHealthyPercent": 100,
    "deploymentCircuitBreaker": {
      "enable": true,
      "rollback": true
    }
  },
  "schedulingStrategy": "REPLICA"
}
```

```bash
# Create service
aws ecs create-service \
  --cli-input-json file://service-definition.json \
  --region us-east-1

# Describe service
aws ecs describe-services \
  --cluster flask-api-cluster \
  --services flask-api-service \
  --region us-east-1
```

### Terraform Version

```hcl
# ecs-service.tf
resource "aws_ecs_service" "flask_api" {
  name            = "flask-api-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.flask_api.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  platform_version = "LATEST"

  network_configuration {
    subnets          = [aws_subnet.private_1.id, aws_subnet.private_2.id]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "flask-api"
    container_port   = 8080
  }

  health_check_grace_period_seconds = 60

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100

    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }

  # Wait for ALB to be ready
  depends_on = [aws_lb_listener.http]

  tags = {
    Name = "flask-api-service"
  }
}
```

---

## Step 11: Auto-Scaling Configuration

### AWS CLI

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/flask-api-cluster/flask-api-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10 \
  --region us-east-1

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/flask-api-cluster/flask-api-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region us-east-1

# Create scaling policy (Memory-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/flask-api-cluster/flask-api-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name memory-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 80.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageMemoryUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region us-east-1
```

### Terraform Version

```hcl
# ecs-autoscaling.tf
# Auto-scaling target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.flask_api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based auto-scaling
resource "aws_appautoscaling_policy" "ecs_cpu" {
  name               = "cpu-scaling-policy"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Memory-based auto-scaling
resource "aws_appautoscaling_policy" "ecs_memory" {
  name               = "memory-scaling-policy"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
```

---

## Step 12: Service Discovery (Cloud Map)

For service-to-service communication within VPC:

### Terraform

```hcl
# service-discovery.tf
# Create private DNS namespace
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "flask-api.local"
  vpc  = aws_vpc.main.id

  tags = {
    Name = "flask-api-namespace"
  }
}

# Create service discovery service
resource "aws_service_discovery_service" "flask_api" {
  name = "api"

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
}

# Update ECS service to use service discovery
resource "aws_ecs_service" "flask_api" {
  # ... existing configuration ...

  service_registries {
    registry_arn = aws_service_discovery_service.flask_api.arn
  }
}

output "service_discovery_dns" {
  value = "api.flask-api.local"
}
```

Now other services can reach your API at `api.flask-api.local:8080`

---

## Step 13: Updating Your Service (Rolling Deployments)

### Build New Version

```bash
# Update your code
echo "v2.0.0" > version.txt

# Build new image
docker build -t flask-api:v2.0.0 .

# Tag and push
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/flask-api:v2.0.0"
docker tag flask-api:v2.0.0 $IMAGE_URI
docker push $IMAGE_URI
```

### Update Task Definition

```bash
# Create new task definition revision with new image
# Update task-definition.json with new image tag
sed -i 's/:v1.0.0/:v2.0.0/g' task-definition.json

# Register new revision
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json \
  --region us-east-1
```

### Update Service

```bash
# Update service to use new task definition
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --task-definition flask-api:2 \
  --force-new-deployment \
  --region us-east-1

# Watch deployment
aws ecs describe-services \
  --cluster flask-api-cluster \
  --services flask-api-service \
  --region us-east-1 \
  --query 'services[0].deployments'
```

**How Rolling Deployment Works:**

```
Initial State: 2 tasks running v1.0.0

Step 1: Start new task with v2.0.0
  - Tasks: v1.0.0 (2), v2.0.0 (1)
  - Total: 3 tasks (200% = max)

Step 2: New task healthy, stop old task
  - Tasks: v1.0.0 (1), v2.0.0 (1)

Step 3: Start another v2.0.0 task
  - Tasks: v1.0.0 (1), v2.0.0 (2)

Step 4: New task healthy, stop last old task
  - Tasks: v2.0.0 (2)

Deployment complete! Zero downtime.
```

---

## Monitoring and Logging

### View Logs

```bash
# List log streams
aws logs describe-log-streams \
  --log-group-name /ecs/flask-api \
  --order-by LastEventTime \
  --descending \
  --max-items 5 \
  --region us-east-1

# Tail logs (last 10 minutes)
aws logs tail /ecs/flask-api \
  --since 10m \
  --follow \
  --region us-east-1
```

### CloudWatch Metrics

```bash
# CPU utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=flask-api-service Name=ClusterName,Value=flask-api-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-east-1

# Memory utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=flask-api-service Name=ClusterName,Value=flask-api-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-east-1
```

---

## Common Issues and Troubleshooting

### Issue 1: Task Fails to Start - "CannotPullContainerError"

**Symptoms:**
```
Task stopped: CannotPullContainerError: Error response from daemon:
pull access denied for xxx.dkr.ecr.us-east-1.amazonaws.com/flask-api
```

**Causes:**
1. Task execution role missing ECR permissions
2. Image doesn't exist or wrong tag
3. Private subnet without NAT/VPC endpoints

**Diagnosis:**
```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster flask-api-cluster \
  --tasks <task-arn> \
  --query 'tasks[0].stopCode'

# Check if image exists
aws ecr describe-images \
  --repository-name flask-api \
  --image-ids imageTag=v1.0.0

# Check task execution role
aws iam get-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-name AmazonECSTaskExecutionRolePolicy
```

**Solutions:**

```hcl
# Solution 1: Add VPC endpoints for ECR (no NAT needed)
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id             = aws_vpc.main.id
  service_name       = "com.amazonaws.${var.region}.ecr.api"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id             = aws_vpc.main.id
  service_name       = "com.amazonaws.${var.region}.ecr.dkr"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"
  route_table_ids = [aws_route_table.private.id]
}

# Security group for VPC endpoints
resource "aws_security_group" "vpc_endpoints" {
  name   = "vpc-endpoints-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
}

# Solution 2: Verify execution role
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
```

---

### Issue 2: Tasks Failing Health Checks

**Symptoms:**
```
Service is unable to consistently start tasks successfully
Tasks are stopped: Task failed ELB health checks in target group
```

**Diagnosis:**
```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

# Check task logs
aws logs tail /ecs/flask-api --since 5m --follow

# Check security groups
aws ec2 describe-security-groups \
  --group-ids <ecs-sg-id>
```

**Common Causes:**

1. **Health check path wrong**
```json
// task-definition.json - Container health check
"healthCheck": {
  "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
  "interval": 30,
  "timeout": 5,
  "retries": 3,
  "startPeriod": 60  // ← Increase if app takes time to start
}
```

2. **Security group not allowing ALB → Task traffic**
```bash
# Verify ECS security group allows traffic from ALB
aws ec2 describe-security-groups \
  --group-ids <ecs-sg-id> \
  --query 'SecurityGroups[0].IpPermissions'

# Should see ALB security group as source
```

3. **Application not listening on correct port**
```python
# Make sure Flask binds to 0.0.0.0, not 127.0.0.1
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)  # ✓ Correct
    # app.run(host='127.0.0.1', port=8080)  # ✗ Wrong - localhost only
```

**Solutions:**
```bash
# Increase health check grace period
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --health-check-grace-period-seconds 120

# Test health check manually from task
aws ecs execute-command \
  --cluster flask-api-cluster \
  --task <task-arn> \
  --container flask-api \
  --interactive \
  --command "/bin/bash"

# Inside container:
curl http://localhost:8080/health
```

---

### Issue 3: "ResourceInitializationError: unable to pull secrets"

**Symptoms:**
```
Task stopped (error): ResourceInitializationError:
unable to pull secrets or registry auth:
execution resource retrieval failed: unable to retrieve secret from asm
```

**Cause:** Task execution role lacks Secrets Manager permissions.

**Solution:**
```hcl
# Add to task execution role
resource "aws_iam_role_policy" "secrets_access" {
  name = "SecretsManagerAccess"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ]
      Resource = [
        aws_secretsmanager_secret.db_credentials.arn,
        "arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:key/*"
      ]
    }]
  })
}
```

---

### Issue 4: Service Stuck in Deployment

**Symptoms:**
```
Service has reached a steady state but deployment is still in progress
Desired count = 2, Running count = 1, Pending count = 0
```

**Causes:**
1. Resource limits (CPU/memory) too high for available capacity
2. Fargate Spot interrupted
3. IP address exhaustion in subnets

**Diagnosis:**
```bash
# Check service events
aws ecs describe-services \
  --cluster flask-api-cluster \
  --services flask-api-service \
  --query 'services[0].events[0:10]'

# Common error: "service flask-api-service was unable to place a task
# because no container instance met all of its requirements"
```

**Solutions:**

1. **Reduce CPU/memory requirements**
```json
{
  "cpu": "256",    // Instead of "512"
  "memory": "512"  // Instead of "1024"
}
```

2. **Check subnet IP availability**
```bash
aws ec2 describe-subnets \
  --subnet-ids subnet-xxx \
  --query 'Subnets[0].AvailableIpAddressCount'

# If low, add more subnets or use larger CIDR
```

3. **Use regular Fargate instead of Fargate Spot**
```bash
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1
```

---

### Issue 5: High Costs / Unexpected Bills

**Diagnosis:**
```bash
# Check running tasks
aws ecs list-tasks \
  --cluster flask-api-cluster \
  --desired-status RUNNING

# Check Fargate vs Fargate Spot usage
aws ecs describe-services \
  --cluster flask-api-cluster \
  --services flask-api-service \
  --query 'services[0].capacityProviderStrategy'

# Check task size
aws ecs describe-task-definition \
  --task-definition flask-api:1 \
  --query 'taskDefinition.{CPU:cpu,Memory:memory}'
```

**Cost Optimization:**

1. **Use Fargate Spot (70% savings)**
```hcl
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE_SPOT", "FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 4  # 80% spot
    base              = 0
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1  # 20% regular
    base              = 1  # Always 1 on-demand
  }
}
```

2. **Right-size your tasks**
```
# Fargate pricing (us-east-1):
CPU: $0.04048 per vCPU per hour
Memory: $0.004445 per GB per hour

# Example monthly costs:
0.25 vCPU + 0.5 GB = ~$10/month per task
0.5  vCPU + 1 GB   = ~$20/month per task
1    vCPU + 2 GB   = ~$40/month per task
```

3. **Use auto-scaling wisely**
```hcl
# Don't over-provision
resource "aws_appautoscaling_target" "ecs_target" {
  min_capacity = 2   # Not 10
  max_capacity = 6   # Not 50
}

# Set appropriate target utilization
target_value = 70.0  # Not 30.0 (wastes money)
```

4. **Delete unused resources**
```bash
# List all services
aws ecs list-services --cluster flask-api-cluster

# Delete service
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --desired-count 0

aws ecs delete-service \
  --cluster flask-api-cluster \
  --service flask-api-service

# Delete cluster
aws ecs delete-cluster --cluster flask-api-cluster
```

---

## Best Practices Summary

### Security
1. ✅ Use separate execution role and task role
2. ✅ Store secrets in Secrets Manager, not environment variables
3. ✅ Use VPC endpoints instead of NAT for ECR/Secrets access
4. ✅ Run containers as non-root user
5. ✅ Enable image scanning in ECR
6. ✅ Use least privilege IAM policies

### Performance
1. ✅ Use health checks with appropriate grace periods
2. ✅ Set proper CPU and memory limits
3. ✅ Use multiple AZs for high availability
4. ✅ Enable Container Insights for monitoring
5. ✅ Configure auto-scaling based on metrics

### Operational Excellence
1. ✅ Use deployment circuit breaker (auto-rollback)
2. ✅ Tag all resources consistently
3. ✅ Set CloudWatch log retention (7-30 days)
4. ✅ Use Service Discovery for inter-service communication
5. ✅ Implement proper logging (structured JSON logs)

### Cost Optimization
1. ✅ Use Fargate Spot for non-critical workloads
2. ✅ Right-size tasks (don't over-provision)
3. ✅ Use auto-scaling (don't run excess capacity)
4. ✅ Set ECR lifecycle policies (delete old images)
5. ✅ Use Savings Plans for predictable workloads

---

## Quick Reference Commands

```bash
# View service status
aws ecs describe-services \
  --cluster flask-api-cluster \
  --services flask-api-service

# List running tasks
aws ecs list-tasks \
  --cluster flask-api-cluster \
  --service-name flask-api-service \
  --desired-status RUNNING

# View task details
aws ecs describe-tasks \
  --cluster flask-api-cluster \
  --tasks <task-arn>

# Tail logs
aws logs tail /ecs/flask-api --follow

# Force new deployment
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --force-new-deployment

# Scale service
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --desired-count 4

# Stop a task
aws ecs stop-task \
  --cluster flask-api-cluster \
  --task <task-arn>

# Execute command in running container
aws ecs execute-command \
  --cluster flask-api-cluster \
  --task <task-arn> \
  --container flask-api \
  --interactive \
  --command "/bin/bash"
```

---

## Clean Up

**Important:** Delete resources to avoid charges!

```bash
# Scale service to 0
aws ecs update-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --desired-count 0

# Delete service
aws ecs delete-service \
  --cluster flask-api-cluster \
  --service flask-api-service \
  --force

# Delete cluster
aws ecs delete-cluster \
  --cluster flask-api-cluster

# Delete ALB
aws elbv2 delete-load-balancer \
  --load-balancer-arn <alb-arn>

# Delete target group
aws elbv2 delete-target-group \
  --target-group-arn <tg-arn>

# Delete ECR images
aws ecr batch-delete-image \
  --repository-name flask-api \
  --image-ids imageTag=v1.0.0

# Delete ECR repository
aws ecr delete-repository \
  --repository-name flask-api \
  --force

# Delete log group
aws logs delete-log-group \
  --log-group-name /ecs/flask-api
```

Or with Terraform:
```bash
terraform destroy
```

---

## Next Steps

1. **Add HTTPS:** Configure ACM certificate and HTTPS listener
2. **CI/CD:** Set up GitHub Actions or GitLab CI for automated deployments
3. **Blue/Green Deployments:** Use CodeDeploy for ECS
4. **Observability:** Add X-Ray tracing, Prometheus metrics
5. **Multi-Region:** Deploy to multiple regions for DR
6. **Cost Monitoring:** Set up AWS Cost Anomaly Detection

---

## Additional Resources

- [AWS ECS Developer Guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/)
- [Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [ECS Workshop](https://ecsworkshop.com/)

This guide covers everything you need to deploy production-ready containerized applications with ECS Fargate!
