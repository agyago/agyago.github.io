---
layout: post
title: "Docker and Containers - From Fundamentals to Production"
description: Comprehensive guide to containers, Docker architecture, networking, volumes, multi-stage builds, security hardening, and production troubleshooting for mid-level engineers
tags: docker containers devops sre linux fundamentals
date: 2025-11-21
---

# Docker and Containers - From Fundamentals to Production

A practical guide covering container internals, Docker architecture, networking, storage, and production-grade practices. This isn't a beginner tutorial - we'll go deep into how things actually work.

---

# Chapter 1: Container Fundamentals

## What Are Containers, Really?

Containers are **isolated processes** running on a shared kernel. They're not lightweight VMs - they're a clever use of Linux kernel features to create isolated environments.

### Containers vs Virtual Machines

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VIRTUAL MACHINES                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │    App A    │  │    App B    │  │    App C    │                 │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤                 │
│  │  Bins/Libs  │  │  Bins/Libs  │  │  Bins/Libs  │                 │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤                 │
│  │  Guest OS   │  │  Guest OS   │  │  Guest OS   │  ← Full OS each │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│  ┌─────────────────────────────────────────────────┐               │
│  │              HYPERVISOR (VMware, KVM)           │               │
│  └─────────────────────────────────────────────────┘               │
│  ┌─────────────────────────────────────────────────┐               │
│  │                   HOST OS                        │               │
│  └─────────────────────────────────────────────────┘               │
│  ┌─────────────────────────────────────────────────┐               │
│  │                  HARDWARE                        │               │
│  └─────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       CONTAINERS                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │    App A    │  │    App B    │  │    App C    │                 │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤                 │
│  │  Bins/Libs  │  │  Bins/Libs  │  │  Bins/Libs  │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│  ┌─────────────────────────────────────────────────┐               │
│  │           CONTAINER RUNTIME (Docker)            │               │
│  └─────────────────────────────────────────────────┘               │
│  ┌─────────────────────────────────────────────────┐               │
│  │              HOST OS (Shared Kernel)            │  ← One kernel │
│  └─────────────────────────────────────────────────┘               │
│  ┌─────────────────────────────────────────────────┐               │
│  │                  HARDWARE                        │               │
│  └─────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

| Aspect | Virtual Machines | Containers |
|--------|-----------------|------------|
| **Isolation Level** | Hardware-level (hypervisor) | Process-level (kernel) |
| **Boot Time** | Minutes | Milliseconds to seconds |
| **Size** | GBs (full OS) | MBs (just app + deps) |
| **Resource Overhead** | High (each VM runs full OS) | Low (shared kernel) |
| **Density** | ~10-20 VMs per host | ~100s of containers per host |
| **Security Isolation** | Stronger (separate kernels) | Weaker (shared kernel) |
| **Use Case** | Multi-tenancy, different OS | Microservices, CI/CD |

### The Linux Kernel Features Behind Containers

Containers leverage three key kernel features:

**1. Namespaces** - Isolation of system resources
```bash
# View namespaces for a process
ls -la /proc/$$/ns/

# Types of namespaces:
# - pid    : Process IDs (container sees its own PID 1)
# - net    : Network interfaces, routing tables
# - mnt    : Mount points (filesystem)
# - uts    : Hostname and domain name
# - ipc    : Inter-process communication
# - user   : User and group IDs
# - cgroup : Control group root directory
```

**2. Control Groups (cgroups)** - Resource limits
```bash
# View cgroup limits for a container
cat /sys/fs/cgroup/memory/docker/<container-id>/memory.limit_in_bytes
cat /sys/fs/cgroup/cpu/docker/<container-id>/cpu.shares

# cgroups control:
# - Memory limits
# - CPU shares/quotas
# - Block I/O
# - Network bandwidth (with tc)
```

**3. Union Filesystems** - Layered storage
```bash
# Layers are stacked - each instruction in Dockerfile creates a layer
# Read-only layers + thin writable layer on top = container filesystem
```

---

## Docker Architecture

Understanding Docker's components helps when debugging issues.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DOCKER CLIENT                                │
│                     (docker CLI, Docker API)                         │
│                              │                                       │
│                              │ REST API                              │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      DOCKER DAEMON (dockerd)                   │  │
│  │                                                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │   Images    │  │ Containers  │  │      Networks       │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │   Volumes   │  │   Plugins   │  │   Build Cache       │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  │                              │                                 │  │
│  └──────────────────────────────┼─────────────────────────────────┘  │
│                                 │                                    │
│                                 ▼                                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     CONTAINERD (container runtime)             │  │
│  │                              │                                 │  │
│  └──────────────────────────────┼─────────────────────────────────┘  │
│                                 │                                    │
│                                 ▼                                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                         RUNC (OCI runtime)                     │  │
│  │                    Creates actual containers                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      LINUX KERNEL                              │  │
│  │              (namespaces, cgroups, union fs)                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Purpose |
|-----------|---------|
| **Docker CLI** | User interface - sends commands to daemon |
| **Docker Daemon** | Background service managing images, containers, networks, volumes |
| **containerd** | Industry-standard container runtime (manages container lifecycle) |
| **runc** | Low-level runtime that actually creates containers using kernel features |
| **Registry** | Stores and distributes images (Docker Hub, private registries) |

```bash
# Check Docker system info
docker info

# Check component versions
docker version

# Check daemon status
systemctl status docker
```

---

## Images and Layers

Images are **read-only templates** made of stacked layers. Each layer represents a Dockerfile instruction.

### How Layers Work

```
┌─────────────────────────────────────────────┐
│         CONTAINER (Running Instance)         │
├─────────────────────────────────────────────┤
│    Thin Read-Write Layer (Container Layer)   │  ← Changes go here
├─────────────────────────────────────────────┤
│                                              │
│              IMAGE LAYERS                    │
│           (Read-Only, Shared)                │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Layer 4: COPY app.py /app              │ │  ← Your code
│  ├────────────────────────────────────────┤ │
│  │ Layer 3: RUN pip install flask         │ │  ← Dependencies
│  ├────────────────────────────────────────┤ │
│  │ Layer 2: RUN apt-get update && install │ │  ← System packages
│  ├────────────────────────────────────────┤ │
│  │ Layer 1: Base Image (python:3.11-slim) │ │  ← Base OS + runtime
│  └────────────────────────────────────────┘ │
│                                              │
└─────────────────────────────────────────────┘
```

### Inspect Image Layers

```bash
# View image history (each layer)
docker history python:3.11-slim

# Detailed layer info
docker inspect python:3.11-slim --format '{{json .RootFS.Layers}}' | jq

# See actual layer sizes
docker history --no-trunc python:3.11-slim
```

### Why Layers Matter

1. **Caching** - Unchanged layers are cached, speeding up builds
2. **Sharing** - Multiple containers can share base layers (saves disk space)
3. **Distribution** - Only changed layers need to be pushed/pulled

```bash
# Force rebuild without cache
docker build --no-cache -t myapp .

# Build with specific cache settings
docker build --build-arg CACHEBUST=$(date +%s) -t myapp .
```

---

## Container Lifecycle

```
                    docker create
                         │
                         ▼
┌──────────┐       ┌──────────┐        docker start        ┌──────────┐
│  Image   │ ────► │ Created  │ ─────────────────────────► │ Running  │
└──────────┘       └──────────┘                            └────┬─────┘
                                                                │
                        ┌───────────────────────────────────────┤
                        │                                       │
                        │ docker stop                           │ docker pause
                        ▼                                       ▼
                  ┌──────────┐                            ┌──────────┐
                  │  Exited  │                            │  Paused  │
                  └────┬─────┘                            └──────────┘
                       │
                       │ docker rm
                       ▼
                  ┌──────────┐
                  │ Removed  │
                  └──────────┘
```

### Essential Container Commands

```bash
# Create and start (most common)
docker run -d --name myapp nginx

# Just create (don't start)
docker create --name myapp nginx

# Start existing container
docker start myapp

# Stop gracefully (SIGTERM, then SIGKILL after timeout)
docker stop myapp

# Stop immediately (SIGKILL)
docker kill myapp

# Pause (freeze processes with SIGSTOP)
docker pause myapp
docker unpause myapp

# Remove container
docker rm myapp

# Remove running container
docker rm -f myapp

# Remove all stopped containers
docker container prune
```

### Container Inspection

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Detailed container info
docker inspect myapp

# Get specific info
docker inspect myapp --format '{{.State.Status}}'
docker inspect myapp --format '{{.NetworkSettings.IPAddress}}'
docker inspect myapp --format '{{json .Mounts}}' | jq

# Resource usage
docker stats myapp

# Processes inside container
docker top myapp
```

---

## Docker Networking Deep Dive

Docker networking is critical to understand - it's where most issues occur.

### Network Drivers

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DOCKER NETWORK DRIVERS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        BRIDGE (default)                      │   │
│  │  • Private internal network on the host                      │   │
│  │  • Containers can communicate via IP or container name       │   │
│  │  • Need port mapping (-p) for external access               │   │
│  │  • Best for: Single-host container communication             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                           HOST                               │   │
│  │  • Container uses host's network stack directly              │   │
│  │  • No network isolation                                      │   │
│  │  • No port mapping needed (container binds to host ports)   │   │
│  │  • Best for: Performance-critical apps, network tools       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                          NONE                                │   │
│  │  • No networking at all                                      │   │
│  │  • Container is completely isolated                          │   │
│  │  • Best for: Batch jobs, security-sensitive workloads       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        OVERLAY                               │   │
│  │  • Multi-host networking (Docker Swarm, Kubernetes)         │   │
│  │  • Containers on different hosts can communicate            │   │
│  │  • Uses VXLAN encapsulation                                  │   │
│  │  • Best for: Distributed applications, orchestration        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        MACVLAN                               │   │
│  │  • Container gets its own MAC address                        │   │
│  │  • Appears as physical device on network                     │   │
│  │  • Direct L2 connectivity                                    │   │
│  │  • Best for: Legacy apps that need direct network access    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Bridge Network (Default)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           HOST MACHINE                               │
│                                                                      │
│    ┌──────────────────────────────────────────────────────────┐    │
│    │                    docker0 bridge                         │    │
│    │                    (172.17.0.1)                           │    │
│    │                         │                                  │    │
│    │         ┌───────────────┼───────────────┐                 │    │
│    │         │               │               │                 │    │
│    │    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐            │    │
│    │    │  veth   │    │  veth   │    │  veth   │            │    │
│    │    └────┬────┘    └────┬────┘    └────┬────┘            │    │
│    └─────────┼──────────────┼──────────────┼───────────────────┘    │
│              │              │              │                         │
│         ┌────┴────┐    ┌────┴────┐    ┌────┴────┐                  │
│         │Container│    │Container│    │Container│                  │
│         │   A     │    │   B     │    │   C     │                  │
│         │.17.0.2  │    │.17.0.3  │    │.17.0.4  │                  │
│         └─────────┘    └─────────┘    └─────────┘                  │
│                                                                      │
│    eth0 (Host NIC) ─────────── Internet                             │
│                         NAT (iptables)                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Network Commands

```bash
# List networks
docker network ls

# Create custom bridge network
docker network create --driver bridge my-network

# Create network with specific subnet
docker network create \
  --driver bridge \
  --subnet 192.168.100.0/24 \
  --gateway 192.168.100.1 \
  my-custom-network

# Connect container to network
docker network connect my-network mycontainer

# Disconnect container from network
docker network disconnect my-network mycontainer

# Inspect network
docker network inspect my-network

# Remove network
docker network rm my-network

# Remove unused networks
docker network prune
```

### Port Mapping

```bash
# Map host port 8080 to container port 80
docker run -p 8080:80 nginx

# Map to specific interface
docker run -p 127.0.0.1:8080:80 nginx

# Map random host port
docker run -p 80 nginx
docker port <container>  # See assigned port

# Map UDP port
docker run -p 53:53/udp dns-server

# Map multiple ports
docker run -p 80:80 -p 443:443 nginx
```

### Container DNS and Service Discovery

```bash
# On custom networks, containers can reach each other by name
docker network create app-network

docker run -d --name db --network app-network postgres
docker run -d --name api --network app-network myapi

# From 'api' container, can reach postgres at hostname 'db'
docker exec api ping db  # Works!

# On default bridge network, must use IP addresses
# Container names don't resolve on default bridge
```

### Network Debugging

```bash
# Check container's network settings
docker inspect mycontainer --format '{{json .NetworkSettings}}' | jq

# Get container IP
docker inspect mycontainer --format '{{.NetworkSettings.IPAddress}}'

# Check what ports are exposed
docker inspect mycontainer --format '{{json .NetworkSettings.Ports}}' | jq

# Test connectivity from inside container
docker exec mycontainer ping google.com
docker exec mycontainer curl -v http://other-container:8080

# Check host iptables rules (port forwarding)
sudo iptables -t nat -L -n -v

# Check if port is listening
docker exec mycontainer netstat -tlnp
docker exec mycontainer ss -tlnp
```

### Network Comparison Table

| Driver | Isolation | Multi-Host | Port Mapping | Use Case |
|--------|-----------|------------|--------------|----------|
| **bridge** | Yes | No | Required | Default, single-host |
| **host** | No | No | Not needed | Performance, network tools |
| **none** | Complete | No | N/A | Security, offline tasks |
| **overlay** | Yes | Yes | Optional | Swarm/K8s clusters |
| **macvlan** | Yes | No | Not needed | Direct LAN access |

---

## Docker Volumes and Storage

Containers are ephemeral - when they're removed, their data is gone. Volumes solve this.

### Storage Types

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DOCKER STORAGE OPTIONS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    VOLUMES (Recommended)                     │   │
│  │  • Managed by Docker (/var/lib/docker/volumes/)             │   │
│  │  • Best for persistent data                                  │   │
│  │  • Can be shared between containers                          │   │
│  │  • Works on Linux, macOS, Windows                           │   │
│  │  • Supports volume drivers (NFS, cloud storage)             │   │
│  │                                                              │   │
│  │  docker run -v myvolume:/data nginx                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      BIND MOUNTS                             │   │
│  │  • Maps host directory to container path                     │   │
│  │  • Good for development (code sync)                          │   │
│  │  • Host path must exist                                      │   │
│  │  • Performance varies by host OS                             │   │
│  │                                                              │   │
│  │  docker run -v /host/path:/container/path nginx             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                       TMPFS MOUNTS                           │   │
│  │  • Stored in host memory only                                │   │
│  │  • Never written to host filesystem                          │   │
│  │  • Fast, but data lost on container stop                     │   │
│  │  • Good for sensitive data, caches                           │   │
│  │                                                              │   │
│  │  docker run --tmpfs /app/cache nginx                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Volume Commands

```bash
# Create a volume
docker volume create mydata

# List volumes
docker volume ls

# Inspect volume
docker volume inspect mydata

# Use volume in container
docker run -v mydata:/app/data myapp

# Remove volume
docker volume rm mydata

# Remove unused volumes
docker volume prune

# Remove ALL unused volumes (careful!)
docker volume prune -a
```

### Bind Mounts vs Volumes

```bash
# VOLUME - Docker manages the location
docker run -v myvolume:/data nginx
# Data stored at /var/lib/docker/volumes/myvolume/_data

# BIND MOUNT - You specify exact host path
docker run -v /home/user/data:/data nginx
# Data stored at /home/user/data

# Modern syntax (--mount) - more explicit
docker run --mount type=volume,source=myvolume,target=/data nginx
docker run --mount type=bind,source=/home/user/data,target=/data nginx
```

### Volume Use Cases

```bash
# Database persistence
docker run -d \
  --name postgres \
  -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  postgres

# Share data between containers
docker run -d --name writer -v shared:/data alpine sh -c "while true; do date >> /data/log.txt; sleep 1; done"
docker run -d --name reader -v shared:/data:ro alpine tail -f /data/log.txt

# Development with live reload (bind mount)
docker run -d \
  -v $(pwd)/src:/app/src \
  -p 3000:3000 \
  node-dev

# Read-only mount (security)
docker run -v myconfig:/etc/app/config:ro myapp
```

### Storage Debugging

```bash
# See what's using disk space
docker system df
docker system df -v  # Verbose

# Find where volume data is stored
docker volume inspect myvolume --format '{{.Mountpoint}}'

# Check mount points inside container
docker exec mycontainer df -h
docker exec mycontainer mount | grep /data
```

---

## Docker Compose Fundamentals

Compose defines multi-container applications in a single YAML file. Essential for local development.

### Basic Structure

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build: ./web
    ports:
      - "8080:80"
    depends_on:
      - api
      - db
    environment:
      - API_URL=http://api:3000
    networks:
      - frontend
      - backend

  api:
    build: ./api
    ports:
      - "3000:3000"
    depends_on:
      - db
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/app
    volumes:
      - ./api/src:/app/src  # Dev: live reload
    networks:
      - backend

  db:
    image: postgres:15-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=app
    networks:
      - backend

volumes:
  pgdata:

networks:
  frontend:
  backend:
```

### Compose Commands

```bash
# Start all services
docker compose up

# Start in background
docker compose up -d

# Build and start
docker compose up --build

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v

# View logs
docker compose logs
docker compose logs -f api  # Follow specific service

# Scale a service
docker compose up -d --scale api=3

# Execute command in running service
docker compose exec api sh

# Run one-off command
docker compose run --rm api npm test

# View running services
docker compose ps

# Rebuild specific service
docker compose build api
```

### Compose Networking

```yaml
# Services on same network can reach each other by service name
services:
  api:
    networks:
      - backend

  db:
    networks:
      - backend

# api can reach db at hostname 'db'
# No need to expose db port to host
```

### Environment Variables

```yaml
services:
  api:
    # Direct values
    environment:
      - NODE_ENV=production
      - DEBUG=false

    # From .env file
    env_file:
      - .env
      - .env.local

    # From host environment
    environment:
      - API_KEY  # Takes value from host's $API_KEY
```

### Health Checks in Compose

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### Dependency Management

```yaml
services:
  api:
    depends_on:
      db:
        condition: service_healthy  # Wait for health check
      redis:
        condition: service_started  # Just wait for start
```

---

# Chapter 2: Production-Grade Docker

## Multi-Stage Builds

Multi-stage builds create minimal production images by separating build-time dependencies from runtime.

### The Problem with Single-Stage Builds

```dockerfile
# BAD: Single stage - image is huge!
FROM node:18

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# This image contains:
# - Node.js runtime
# - npm and all dev dependencies (node_modules)
# - Source code
# - Build tools
# Result: 1+ GB image
```

### Multi-Stage Solution

```dockerfile
# GOOD: Multi-stage build

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS production

WORKDIR /app

# Only copy what we need
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

USER appuser

EXPOSE 3000
CMD ["node", "dist/index.js"]

# Result: ~150MB image (vs 1GB+)
```

### Multi-Stage for Compiled Languages

```dockerfile
# Go application - even smaller final image

# Stage 1: Build
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Stage 2: Minimal runtime
FROM alpine:3.18 AS production

# Add CA certificates for HTTPS
RUN apk --no-cache add ca-certificates

WORKDIR /root/
COPY --from=builder /app/main .

# Run as non-root
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 8080
CMD ["./main"]

# Result: ~15MB image!
```

### Python Multi-Stage Build

```dockerfile
# Python with virtual environment

# Stage 1: Build dependencies
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Production
FROM python:3.11-slim AS production

# Install only runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
```

---

## Image Optimization

### Base Image Selection

| Base Image | Size | Use Case |
|------------|------|----------|
| `ubuntu:22.04` | ~77MB | When you need apt and full tooling |
| `debian:bookworm-slim` | ~74MB | Smaller Debian, most packages available |
| `alpine:3.18` | ~7MB | Minimal, uses musl libc (some compatibility issues) |
| `distroless/base` | ~20MB | No shell, minimal attack surface |
| `scratch` | 0MB | For statically compiled binaries only |

```dockerfile
# Alpine-based images are smallest
FROM python:3.11-alpine  # ~50MB vs ~150MB for slim

# But watch for compatibility issues with musl libc
# Some Python packages need compilation fixes
```

### Layer Optimization

```dockerfile
# BAD: Many layers, poor caching
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y git
RUN apt-get clean

# GOOD: Single layer, cleanup in same layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```

### .dockerignore

```bash
# .dockerignore - exclude from build context

# Version control
.git
.gitignore

# Dependencies (will be installed in container)
node_modules
vendor
__pycache__
*.pyc
venv/
.venv/

# Build outputs
dist
build
*.egg-info

# IDE and editor files
.idea
.vscode
*.swp
*.swo

# Test and docs
tests
test
*.md
docs
coverage
.coverage

# CI/CD
.github
.gitlab-ci.yml
Jenkinsfile

# Docker files (not needed in image)
Dockerfile*
docker-compose*
.docker

# Environment files (security!)
.env
.env.*
*.pem
*.key

# Logs
*.log
logs
```

### Caching Best Practices

```dockerfile
# Order matters! Put things that change least at top

# 1. Base image (changes rarely)
FROM python:3.11-slim

# 2. System dependencies (change occasionally)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 3. Application dependencies (change sometimes)
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Application code (changes frequently)
COPY . .

# This way, code changes don't invalidate dependency cache
```

---

## Security Hardening

### 1. Run as Non-Root User

```dockerfile
# Create user and group
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Or on Alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set ownership
COPY --chown=appuser:appgroup . /app

# Switch to non-root user
USER appuser

# Alternative: Use numeric UID (more portable)
USER 1000:1000
```

### 2. Use Read-Only Filesystem

```bash
# Run container with read-only root filesystem
docker run --read-only myapp

# If app needs to write, use tmpfs for specific directories
docker run --read-only \
  --tmpfs /tmp \
  --tmpfs /app/cache \
  myapp
```

### 3. Drop Capabilities

```bash
# Drop all capabilities, add only what's needed
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp

# Common capabilities to drop:
# - CAP_NET_RAW (prevent packet spoofing)
# - CAP_SYS_ADMIN (prevent container escapes)
# - CAP_SETUID/CAP_SETGID (prevent privilege escalation)
```

### 4. No New Privileges

```bash
# Prevent privilege escalation via setuid binaries
docker run --security-opt=no-new-privileges myapp
```

### 5. Scan Images for Vulnerabilities

```bash
# Docker Scout (built into Docker Desktop)
docker scout quickview myimage:latest
docker scout cves myimage:latest

# Trivy (open source)
trivy image myimage:latest

# Snyk
snyk container test myimage:latest

# Grype
grype myimage:latest
```

### 6. Use Specific Image Tags

```dockerfile
# BAD: Using 'latest' - unpredictable
FROM python:latest

# BETTER: Use specific version
FROM python:3.11-slim

# BEST: Use digest for reproducibility
FROM python:3.11-slim@sha256:abc123...
```

### 7. Don't Store Secrets in Images

```dockerfile
# BAD: Secrets in image layers
ENV API_KEY=secret123
COPY credentials.json /app/

# GOOD: Use runtime environment variables
# or Docker secrets/Kubernetes secrets

# Build-time secrets (Docker BuildKit)
# syntax=docker/dockerfile:1.4
RUN --mount=type=secret,id=api_key \
    API_KEY=$(cat /run/secrets/api_key) ./configure
```

### 8. Minimal Attack Surface

```dockerfile
# Remove unnecessary tools
RUN apt-get remove --purge -y \
    curl \
    wget \
    && apt-get autoremove -y

# Use distroless for minimal surface
FROM gcr.io/distroless/base-debian11
# No shell, no package manager - just your app
```

### Security Checklist

```yaml
# Security best practices checklist:
✓ Non-root user (USER instruction)
✓ Specific base image tags (not :latest)
✓ Multi-stage builds (minimize attack surface)
✓ No secrets in images (use env vars or secrets management)
✓ Image vulnerability scanning in CI/CD
✓ Read-only filesystem where possible
✓ Drop unnecessary capabilities
✓ Resource limits (--memory, --cpus)
✓ No privileged mode (--privileged=false)
✓ Network segmentation (custom networks)
```

---

## Health Checks

Health checks tell Docker whether your container is actually working, not just running.

### Dockerfile Health Check

```dockerfile
# HTTP health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# For containers without curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Using Python
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

# Database health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD pg_isready -U postgres || exit 1

# Redis health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD redis-cli ping || exit 1
```

### Health Check Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--interval` | Time between checks | 30s |
| `--timeout` | Max time for check to complete | 30s |
| `--start-period` | Grace period before checks count | 0s |
| `--retries` | Failures needed to mark unhealthy | 3 |

### Check Health Status

```bash
# View health status
docker ps
# CONTAINER ID   IMAGE   STATUS                    NAMES
# abc123         myapp   Up 5 min (healthy)        web

# Detailed health info
docker inspect myapp --format '{{json .State.Health}}' | jq

# Health check logs
docker inspect myapp --format '{{json .State.Health.Log}}' | jq
```

---

## Resource Limits

Without limits, a single container can consume all host resources.

### Memory Limits

```bash
# Hard memory limit (OOM killed if exceeded)
docker run --memory=512m myapp

# Memory + swap limit
docker run --memory=512m --memory-swap=1g myapp

# Soft limit (reservation)
docker run --memory=512m --memory-reservation=256m myapp

# Disable OOM killer (container pauses instead of dying)
docker run --memory=512m --oom-kill-disable myapp
```

### CPU Limits

```bash
# Limit to 1.5 CPUs
docker run --cpus=1.5 myapp

# CPU shares (relative weight, default 1024)
docker run --cpu-shares=512 myapp  # Half priority

# Pin to specific CPUs
docker run --cpuset-cpus="0,1" myapp  # Use CPU 0 and 1

# CPU quota (microseconds per 100ms period)
docker run --cpu-quota=50000 myapp  # 50% of one CPU
```

### Docker Compose Resources

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

### Monitoring Resource Usage

```bash
# Real-time stats
docker stats

# Stats for specific containers
docker stats api db redis

# One-time snapshot
docker stats --no-stream

# Format output
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

---

## Logging Best Practices

### Log to stdout/stderr

```dockerfile
# Application logs should go to stdout/stderr
# Docker captures these automatically

# Example: Configure app to log to stdout
CMD ["python", "-u", "app.py"]  # -u for unbuffered output

# Symlink log files to stdout/stderr
RUN ln -sf /dev/stdout /var/log/app/access.log \
    && ln -sf /dev/stderr /var/log/app/error.log
```

### Logging Drivers

```bash
# View container logs
docker logs myapp
docker logs -f myapp        # Follow
docker logs --tail 100 myapp  # Last 100 lines
docker logs --since 1h myapp  # Last hour

# Use different logging driver
docker run --log-driver=json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  myapp

# Available drivers:
# - json-file (default)
# - syslog
# - journald
# - fluentd
# - awslogs
# - gcplogs
```

### Structured Logging

```python
# Use JSON logging for easier parsing
import logging
import json

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
        }
        return json.dumps(log_obj)

# Output: {"timestamp": "2024-01-15 10:30:00", "level": "INFO", "message": "Request processed", "module": "api"}
```

---

## Production Troubleshooting

### Issue 1: Container Exits Immediately

**Symptoms:**
```bash
docker run myapp
# Container starts and exits immediately
docker ps -a
# STATUS: Exited (1) 2 seconds ago
```

**Diagnosis:**
```bash
# Check exit code
docker inspect myapp --format '{{.State.ExitCode}}'

# Check logs
docker logs myapp

# Common exit codes:
# 0   - Normal exit
# 1   - General error
# 137 - SIGKILL (OOM or docker kill)
# 139 - SIGSEGV (segmentation fault)
# 143 - SIGTERM (docker stop)
```

**Common Causes:**

1. **Process runs in background** - Container exits when main process ends
```dockerfile
# BAD: nginx runs in background, container exits
CMD ["nginx"]

# GOOD: Keep nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
```

2. **Command fails**
```bash
# Debug by running shell
docker run -it myapp /bin/sh
# Then manually run your command
```

3. **Missing environment variables**
```bash
docker run -e REQUIRED_VAR=value myapp
```

---

### Issue 2: OOM Killed (Exit Code 137)

**Symptoms:**
```bash
docker inspect myapp --format '{{.State.OOMKilled}}'
# true
```

**Diagnosis:**
```bash
# Check memory usage before kill
docker stats myapp --no-stream

# Check container memory limit
docker inspect myapp --format '{{.HostConfig.Memory}}'

# Check host memory
free -h
```

**Solutions:**

```bash
# Increase memory limit
docker run --memory=1g myapp

# Or fix the memory leak in your application
# Add profiling to find the leak
```

---

### Issue 3: Cannot Connect to Container

**Symptoms:**
```bash
curl http://localhost:8080
# Connection refused
```

**Diagnosis:**
```bash
# 1. Is container running?
docker ps

# 2. Is port mapping correct?
docker port myapp
# 8080/tcp -> 0.0.0.0:8080

# 3. Is app listening on correct interface?
docker exec myapp netstat -tlnp
# App must listen on 0.0.0.0, not 127.0.0.1

# 4. Check container logs for errors
docker logs myapp

# 5. Test from inside container
docker exec myapp curl localhost:8080
```

**Common Causes:**

```python
# BAD: Only listens on localhost (inside container)
app.run(host='127.0.0.1', port=8080)

# GOOD: Listens on all interfaces
app.run(host='0.0.0.0', port=8080)
```

---

### Issue 4: Slow Container Startup

**Symptoms:**
```bash
# Container takes minutes to become healthy
docker ps
# STATUS: Up 2 minutes (health: starting)
```

**Diagnosis:**
```bash
# Check what's happening during startup
docker logs -f myapp

# Check health check timing
docker inspect myapp --format '{{json .State.Health}}' | jq
```

**Solutions:**

```dockerfile
# Increase start period for slow apps
HEALTHCHECK --start-period=60s --interval=30s \
  CMD curl -f http://localhost:8080/health || exit 1

# Optimize startup:
# - Lazy load dependencies
# - Defer non-critical initialization
# - Use connection pooling (don't wait for DB on startup)
```

---

### Issue 5: "No Space Left on Device"

**Symptoms:**
```bash
docker build -t myapp .
# Error: write /var/lib/docker/...: no space left on device
```

**Diagnosis:**
```bash
# Check Docker disk usage
docker system df

# Detailed breakdown
docker system df -v

# Check host disk
df -h
```

**Solutions:**

```bash
# Remove unused containers
docker container prune

# Remove unused images
docker image prune
docker image prune -a  # Remove all unused (not just dangling)

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune

# Nuclear option - remove everything unused
docker system prune -a --volumes

# Clean build cache
docker builder prune
```

---

### Issue 6: DNS Resolution Failing

**Symptoms:**
```bash
docker exec myapp ping google.com
# ping: bad address 'google.com'
```

**Diagnosis:**
```bash
# Check DNS configuration
docker exec myapp cat /etc/resolv.conf

# Test with IP (bypass DNS)
docker exec myapp ping 8.8.8.8

# Check Docker daemon DNS settings
docker info | grep -i dns
```

**Solutions:**

```bash
# Specify DNS servers
docker run --dns 8.8.8.8 --dns 8.8.4.4 myapp

# Or configure in daemon.json
# /etc/docker/daemon.json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

---

### Issue 7: Permission Denied on Volume

**Symptoms:**
```bash
docker run -v mydata:/data myapp
# Error: Permission denied: /data/file.txt
```

**Diagnosis:**
```bash
# Check file ownership inside container
docker exec myapp ls -la /data

# Check what user container runs as
docker exec myapp id
# uid=1000(appuser) gid=1000(appuser)

# Check volume ownership on host
sudo ls -la /var/lib/docker/volumes/mydata/_data
```

**Solutions:**

```bash
# Option 1: Change ownership in Dockerfile
RUN chown -R appuser:appuser /data

# Option 2: Run as root (not recommended for production)
docker run --user root -v mydata:/data myapp

# Option 3: Use init container to fix permissions
docker run --rm -v mydata:/data alpine chown -R 1000:1000 /data

# Option 4: Set permissions in entrypoint
# entrypoint.sh
#!/bin/sh
chown -R appuser:appuser /data
exec gosu appuser "$@"
```

---

### Issue 8: Container Cannot Reach Other Containers

**Symptoms:**
```bash
docker exec api curl http://db:5432
# curl: (6) Could not resolve host: db
```

**Diagnosis:**
```bash
# Check if containers are on same network
docker network inspect bridge

# List container networks
docker inspect api --format '{{json .NetworkSettings.Networks}}' | jq
docker inspect db --format '{{json .NetworkSettings.Networks}}' | jq
```

**Solutions:**

```bash
# Default bridge doesn't support DNS resolution
# Use custom network instead

docker network create app-network
docker run -d --name db --network app-network postgres
docker run -d --name api --network app-network myapi

# Now api can reach db by name
docker exec api ping db  # Works!
```

---

## Production Docker Compose Example

Complete production-ready docker-compose setup:

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Application
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
      target: production
    image: mycompany/api:${VERSION:-latest}
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:${DB_PASSWORD}@db:5432/app
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    networks:
      - frontend
      - backend
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # Database
  db:
    image: postgres:15-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    networks:
      - backend

  # Cache
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
    networks:
      - backend

  # Reverse proxy
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - frontend

volumes:
  pgdata:
  redisdata:

networks:
  frontend:
  backend:
    internal: true  # No external access to backend network
```

---

## Quick Reference Commands

```bash
# === IMAGES ===
docker build -t name:tag .
docker images
docker rmi image:tag
docker image prune -a

# === CONTAINERS ===
docker run -d --name app -p 8080:80 image
docker ps -a
docker stop/start/restart app
docker rm app
docker logs -f app
docker exec -it app /bin/sh

# === INSPECT & DEBUG ===
docker inspect app
docker stats
docker top app
docker diff app

# === NETWORKS ===
docker network ls
docker network create mynet
docker network connect mynet app
docker network inspect mynet

# === VOLUMES ===
docker volume ls
docker volume create mydata
docker volume inspect mydata
docker volume prune

# === CLEANUP ===
docker system df
docker system prune -a --volumes
docker builder prune

# === COMPOSE ===
docker compose up -d
docker compose down -v
docker compose logs -f
docker compose exec app sh
docker compose ps
```

---

## Best Practices Summary

### Building Images
- Use multi-stage builds
- Choose minimal base images (Alpine, distroless)
- Order Dockerfile for optimal caching
- Use .dockerignore
- Tag with specific versions, not `latest`

### Security
- Run as non-root user
- Scan images for vulnerabilities
- Don't store secrets in images
- Use read-only filesystems where possible
- Drop unnecessary capabilities

### Runtime
- Set resource limits (CPU, memory)
- Use health checks
- Log to stdout/stderr
- Use custom networks for service discovery
- Use volumes for persistent data

### Operations
- Automate image builds in CI/CD
- Implement image retention policies
- Monitor container metrics
- Have a cleanup strategy for unused resources

---

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Container Security by Liz Rice](https://containersecurity.tech/)
- [Docker Compose Specification](https://docs.docker.com/compose/compose-file/)

This guide covers container fundamentals through production-grade practices. Master these concepts and you'll be prepared to run containers reliably in any environment.
