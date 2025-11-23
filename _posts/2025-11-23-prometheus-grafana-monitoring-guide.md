---
layout: post
title: "Prometheus and Grafana: A Practical Monitoring Guide"
description: "Learn how to set up Prometheus and Grafana for monitoring your infrastructure. From basic concepts to production-ready configurations for Docker, Kubernetes, and EC2 environments."
tags: prometheus grafana monitoring observability devops sre kubernetes docker
date: 2025-11-23
---

Monitoring is not optional—it's the difference between proactively fixing issues and getting woken up at 3 AM by angry customers. This guide walks you through setting up Prometheus and Grafana, the most widely adopted open-source monitoring stack in the industry.

We'll start with the fundamentals and progress to production-ready configurations that work across Docker, Kubernetes, and traditional EC2/VM environments.

---

## Table of Contents

1. [Why Prometheus and Grafana?](#why-prometheus-and-grafana)
2. [Understanding the Architecture](#understanding-the-architecture)
3. [Core Concepts](#core-concepts)
4. [Setting Up Prometheus](#setting-up-prometheus)
5. [Setting Up Grafana](#setting-up-grafana)
6. [What Should You Monitor?](#what-should-you-monitor)
7. [PromQL: Querying Your Metrics](#promql-querying-your-metrics)
8. [Alerting with Alertmanager](#alerting-with-alertmanager)
9. [Production Considerations](#production-considerations)
10. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## Why Prometheus and Grafana?

Before diving into setup, let's understand why this stack has become the industry standard.

### The Monitoring Landscape

| Tool | Type | Best For |
|------|------|----------|
| **Prometheus** | Metrics collection & storage | Time-series data, alerting |
| **Grafana** | Visualization | Dashboards, graphs, exploration |
| **CloudWatch** | AWS-native monitoring | AWS services, basic metrics |
| **Datadog** | SaaS monitoring | Full observability (paid) |
| **ELK Stack** | Log aggregation | Log analysis, search |

### Why Choose Prometheus + Grafana?

**Prometheus:**
- Pull-based model (more reliable than push)
- Powerful query language (PromQL)
- Built-in alerting
- Service discovery (especially for Kubernetes)
- No external dependencies (single binary)
- Free and open source

**Grafana:**
- Beautiful, customizable dashboards
- Supports multiple data sources (Prometheus, CloudWatch, Elasticsearch, etc.)
- Alerting capabilities
- Large community with pre-built dashboards
- Free and open source

---

## Understanding the Architecture

Here's how the monitoring stack fits together:

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR INFRASTRUCTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│   │   App 1     │   │   App 2     │   │   App 3     │          │
│   │  :8080      │   │  :8081      │   │  :8082      │          │
│   │  /metrics   │   │  /metrics   │   │  /metrics   │          │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│          │                 │                 │                  │
│          └────────────────┬┴─────────────────┘                  │
│                           │                                     │
│                    SCRAPE │ (pull metrics)                      │
│                           ▼                                     │
│                  ┌─────────────────┐                           │
│                  │   PROMETHEUS    │                           │
│                  │    :9090        │                           │
│                  │  ┌───────────┐  │                           │
│                  │  │  TSDB     │  │  (Time Series Database)   │
│                  │  └───────────┘  │                           │
│                  └────────┬────────┘                           │
│                           │                                     │
│              ┌────────────┼────────────┐                       │
│              │            │            │                        │
│              ▼            ▼            ▼                        │
│     ┌─────────────┐ ┌──────────┐ ┌──────────────┐             │
│     │   GRAFANA   │ │ ALERTMGR │ │  API/APPS    │             │
│     │   :3000     │ │  :9093   │ │  (queries)   │             │
│     └─────────────┘ └────┬─────┘ └──────────────┘             │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                         │
│              │  Slack / PagerDuty /  │                         │
│              │  Email / Webhook      │                         │
│              └───────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Port | Purpose |
|-----------|------|---------|
| **Prometheus** | 9090 | Scrapes and stores metrics |
| **Grafana** | 3000 | Visualizes metrics |
| **Alertmanager** | 9093 | Routes and manages alerts |
| **Node Exporter** | 9100 | Exposes host/VM metrics |
| **cAdvisor** | 8080 | Exposes container metrics |

### Pull vs Push Model

Prometheus uses a **pull-based** model:

```
Push Model (traditional):          Pull Model (Prometheus):
┌─────┐                            ┌─────┐
│ App │──push──▶ │Monitor│         │ App │◀──scrape──│Prometheus│
└─────┘                            └─────┘
                                   (app exposes /metrics)
```

**Why pull is better:**
- Prometheus controls the scrape interval
- Easier to detect if a target is down (scrape fails)
- No need for apps to know where to push
- Simpler firewall rules (Prometheus initiates connections)

---

## Core Concepts

Before setting things up, let's understand the terminology.

### Metric Types

Prometheus has four core metric types:

#### 1. Counter
A value that only goes up (or resets to zero on restart).

```
# Example: Total HTTP requests
http_requests_total{method="GET", status="200"} 1234
```

**Use for:** Request counts, error counts, bytes transferred

#### 2. Gauge
A value that can go up or down.

```
# Example: Current memory usage
node_memory_MemFree_bytes 1073741824
```

**Use for:** Temperature, memory usage, queue size, active connections

#### 3. Histogram
Samples observations and counts them in configurable buckets.

```
# Example: Request duration distribution
http_request_duration_seconds_bucket{le="0.1"} 500
http_request_duration_seconds_bucket{le="0.5"} 800
http_request_duration_seconds_bucket{le="1.0"} 950
http_request_duration_seconds_count 1000
http_request_duration_seconds_sum 450.5
```

**Use for:** Request latencies, response sizes

#### 4. Summary
Similar to histogram but calculates quantiles on the client side.

```
# Example: Request duration quantiles
http_request_duration_seconds{quantile="0.5"} 0.05
http_request_duration_seconds{quantile="0.9"} 0.1
http_request_duration_seconds{quantile="0.99"} 0.5
```

**Use for:** When you need specific percentiles (p50, p90, p99)

### Labels

Labels are key-value pairs that add dimensions to metrics:

```
http_requests_total{method="GET", endpoint="/api/users", status="200"} 1234
http_requests_total{method="POST", endpoint="/api/users", status="201"} 567
http_requests_total{method="GET", endpoint="/api/users", status="500"} 12
```

**Best practices:**
- Keep label cardinality low (avoid user IDs, request IDs)
- Use labels for dimensions you'll filter/group by
- Be consistent with naming across services

### Scrape Targets

A target is an endpoint Prometheus scrapes for metrics:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'my-app'
    static_configs:
      - targets: ['app1:8080', 'app2:8080', 'app3:8080']
```

Each target exposes metrics at `/metrics` endpoint in this format:

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234
http_requests_total{method="POST",status="201"} 567
```

---

## Setting Up Prometheus

Let's set up Prometheus in different environments. I'll show Docker first (universal), then Kubernetes.

### Option 1: Docker Compose (Works Everywhere)

This setup works on EC2, any VM, or your local machine.

Create a project directory:

```bash
mkdir monitoring && cd monitoring
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.47.0
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.enable-lifecycle'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.1.0
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    restart: unless-stopped

  # Exports host metrics (CPU, memory, disk, network)
  node-exporter:
    image: prom/node-exporter:v1.6.1
    container_name: node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped

  # Exports container metrics
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.47.2
    container_name: cadvisor
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    privileged: true
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:v0.26.0
    container_name: alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
```

Create `prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s          # How often to scrape targets
  evaluation_interval: 15s       # How often to evaluate rules
  external_labels:
    monitor: 'my-monitor'
    environment: 'production'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

# Load alert rules
rule_files:
  - /etc/prometheus/alerts.yml

# Scrape configurations
scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter (host metrics)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # cAdvisor (container metrics)
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  # Your applications (add your apps here)
  # - job_name: 'my-app'
  #   static_configs:
  #     - targets: ['app:8080']
```

Create `prometheus/alerts.yml`:

```yaml
groups:
  - name: infrastructure
    rules:
      # Instance down for more than 1 minute
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} down"
          description: "{{ $labels.instance }} of job {{ $labels.job }} has been down for more than 1 minute."

      # High CPU usage
      - alert: HighCpuUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is above 80% (current: {{ $value | printf \"%.2f\" }}%)"

      # High memory usage
      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 85% (current: {{ $value | printf \"%.2f\" }}%)"

      # Disk space low
      - alert: DiskSpaceLow
        expr: (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Disk usage is above 85% on {{ $labels.mountpoint }} (current: {{ $value | printf \"%.2f\" }}%)"
```

Create `alertmanager/alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'default-receiver'
  routes:
    - match:
        severity: critical
      receiver: 'critical-receiver'

receivers:
  - name: 'default-receiver'
    # Configure your notification channel here
    # Example: Slack webhook
    # slack_configs:
    #   - api_url: 'https://hooks.slack.com/services/xxx/xxx/xxx'
    #     channel: '#alerts'

  - name: 'critical-receiver'
    # Critical alerts go to a different channel
    # slack_configs:
    #   - api_url: 'https://hooks.slack.com/services/xxx/xxx/xxx'
    #     channel: '#critical-alerts'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']
```

Create Grafana provisioning for auto-setup:

```bash
mkdir -p grafana/provisioning/datasources
mkdir -p grafana/provisioning/dashboards
```

Create `grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
```

Start everything:

```bash
docker compose up -d
```

Verify all containers are running:

```bash
docker compose ps
```

Access the UIs:
- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3000 (admin/admin)
- **Alertmanager:** http://localhost:9093

### Option 2: Kubernetes Deployment

For Kubernetes, the recommended approach is using the **kube-prometheus-stack** Helm chart, which bundles Prometheus, Grafana, Alertmanager, and pre-configured dashboards.

#### Prerequisites

```bash
# Add Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

#### Basic Installation

```bash
# Create namespace
kubectl create namespace monitoring

# Install with default settings
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring
```

#### Custom Installation with Values

Create `values.yaml` for customization:

```yaml
# Prometheus configuration
prometheus:
  prometheusSpec:
    retention: 15d
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
    resources:
      requests:
        memory: 1Gi
        cpu: 500m
      limits:
        memory: 2Gi
        cpu: 1000m
    # Add additional scrape configs
    additionalScrapeConfigs:
      - job_name: 'my-app'
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            regex: ([^:]+)(?::\d+)?;(\d+)
            replacement: $1:$2
            target_label: __address__

# Grafana configuration
grafana:
  adminPassword: "your-secure-password"
  persistence:
    enabled: true
    size: 10Gi
  resources:
    requests:
      memory: 256Mi
      cpu: 100m
    limits:
      memory: 512Mi
      cpu: 200m

# Alertmanager configuration
alertmanager:
  config:
    global:
      resolve_timeout: 5m
    route:
      group_by: ['alertname', 'namespace']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: 'null'
      routes:
        - match:
            alertname: Watchdog
          receiver: 'null'
    receivers:
      - name: 'null'
  alertmanagerSpec:
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi

# Node Exporter
nodeExporter:
  enabled: true

# kube-state-metrics
kubeStateMetrics:
  enabled: true
```

Install with custom values:

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values values.yaml
```

#### Accessing the UIs

```bash
# Port forward Prometheus
kubectl port-forward svc/prometheus-kube-prometheus-prometheus -n monitoring 9090:9090

# Port forward Grafana
kubectl port-forward svc/prometheus-grafana -n monitoring 3000:80

# Port forward Alertmanager
kubectl port-forward svc/prometheus-kube-prometheus-alertmanager -n monitoring 9093:9093
```

#### Making Your Pods Scrapable

Add these annotations to your pods to be automatically discovered:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/metrics"
    spec:
      containers:
        - name: my-app
          image: my-app:latest
          ports:
            - containerPort: 8080
```

Or create a `ServiceMonitor` (more Kubernetes-native):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  namespace: monitoring
  labels:
    release: prometheus  # Must match Helm release name
spec:
  selector:
    matchLabels:
      app: my-app
  namespaceSelector:
    matchNames:
      - default
  endpoints:
    - port: http
      interval: 15s
      path: /metrics
```

---

## Setting Up Grafana

Once Grafana is running, let's configure it properly.

### Adding Prometheus Data Source

If not auto-provisioned:

1. Go to **Configuration** → **Data Sources**
2. Click **Add data source**
3. Select **Prometheus**
4. Set URL: `http://prometheus:9090` (Docker) or `http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090` (Kubernetes)
5. Click **Save & Test**

### Importing Pre-built Dashboards

Don't build dashboards from scratch—start with community dashboards:

1. Go to **Dashboards** → **Import**
2. Enter the dashboard ID and click **Load**
3. Select your Prometheus data source
4. Click **Import**

**Recommended Dashboard IDs:**

| Dashboard | ID | Purpose |
|-----------|-----|---------|
| Node Exporter Full | 1860 | Host metrics (CPU, memory, disk, network) |
| Docker Container & Host | 10619 | Container metrics via cAdvisor |
| Kubernetes Cluster | 6417 | K8s cluster overview |
| Kubernetes Pods | 6336 | Pod-level metrics |
| Prometheus Stats | 2 | Prometheus self-monitoring |

### Building a Custom Dashboard

Let's create a simple application dashboard:

1. Click **Dashboards** → **New** → **New Dashboard**
2. Click **Add visualization**
3. Select your Prometheus data source

**Example panels:**

#### Request Rate

```promql
sum(rate(http_requests_total[5m])) by (status)
```

- Visualization: **Time series**
- Legend: `{{status}}`

#### Error Rate

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
```

- Visualization: **Stat** or **Gauge**
- Unit: **Percent (0-100)**

#### Request Latency (p99)

```promql
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

- Visualization: **Time series**
- Unit: **Seconds**

#### Active Connections

```promql
sum(active_connections)
```

- Visualization: **Stat**

---

## What Should You Monitor?

### The Four Golden Signals

Google's Site Reliability Engineering book defines four golden signals:

| Signal | What to Measure | Example Metric |
|--------|-----------------|----------------|
| **Latency** | Time to serve a request | `http_request_duration_seconds` |
| **Traffic** | Demand on your system | `http_requests_total` |
| **Errors** | Failed requests rate | `http_requests_total{status=~"5.."}` |
| **Saturation** | How full your system is | CPU, memory, disk usage |

### USE Method (for Resources)

For infrastructure resources, use the USE method:

| Metric | CPU | Memory | Disk | Network |
|--------|-----|--------|------|---------|
| **Utilization** | % busy | % used | % full | bandwidth used |
| **Saturation** | run queue length | swap usage | I/O wait | dropped packets |
| **Errors** | — | OOM kills | disk errors | NIC errors |

### RED Method (for Services)

For microservices:

| Metric | Description |
|--------|-------------|
| **Rate** | Requests per second |
| **Errors** | Failed requests per second |
| **Duration** | Time per request (latency) |

---

## PromQL: Querying Your Metrics

PromQL (Prometheus Query Language) is how you query metrics. Let's go from basics to practical examples.

### Basic Queries

```promql
# Simple metric
up

# With label filter
up{job="node-exporter"}

# Multiple label filters
http_requests_total{method="GET", status="200"}

# Regex match
http_requests_total{status=~"2.."}

# Negative match
http_requests_total{status!="500"}
```

### Common Functions

#### rate() - Per-second rate of increase (for counters)

```promql
# Requests per second over the last 5 minutes
rate(http_requests_total[5m])
```

#### increase() - Total increase over time range

```promql
# Total requests in the last hour
increase(http_requests_total[1h])
```

#### sum() - Aggregate across labels

```promql
# Total requests per second across all instances
sum(rate(http_requests_total[5m]))

# Total requests per second grouped by status
sum(rate(http_requests_total[5m])) by (status)
```

#### avg(), min(), max()

```promql
# Average CPU across all instances
avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))

# Max memory usage
max(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)
```

#### histogram_quantile() - Calculate percentiles

```promql
# 99th percentile latency
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# 50th percentile (median)
histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

### Practical Query Examples

#### CPU Usage %

```promql
100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

#### Memory Usage %

```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

#### Disk Usage %

```promql
(1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100
```

#### Error Rate %

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
```

#### Request Latency p95

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint))
```

#### Container CPU Usage

```promql
sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name) * 100
```

#### Container Memory Usage

```promql
sum(container_memory_usage_bytes{name!=""}) by (name) / 1024 / 1024
```

#### Top 5 Pods by CPU

```promql
topk(5, sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) by (pod))
```

---

## Alerting with Alertmanager

Alertmanager handles alert routing, grouping, and notification.

### Alert Flow

```
┌────────────┐      ┌──────────────┐      ┌─────────────────┐
│ Prometheus │─────▶│ Alertmanager │─────▶│ Notification    │
│ (evaluate  │      │ (route,      │      │ (Slack, Email,  │
│  rules)    │      │  dedupe)     │      │  PagerDuty)     │
└────────────┘      └──────────────┘      └─────────────────┘
```

### Alert Rule Structure

```yaml
groups:
  - name: example
    rules:
      - alert: HighErrorRate           # Alert name
        expr: |                        # PromQL expression
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m                        # Must be true for this duration
        labels:
          severity: critical           # Custom labels
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | printf \"%.2f\" }}%"
```

### Alertmanager Routing

```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s       # Wait before sending first notification
  group_interval: 5m    # Wait before sending subsequent notifications
  repeat_interval: 4h   # Resend notifications for ongoing alerts

  routes:
    # Critical alerts → PagerDuty
    - match:
        severity: critical
      receiver: 'pagerduty'

    # Warning alerts → Slack
    - match:
        severity: warning
      receiver: 'slack'
```

### Notification Examples

#### Slack

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/xxx/xxx/xxx'
        channel: '#alerts'
        send_resolved: true
        title: '{{ .Status | toUpper }}: {{ .CommonLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

#### PagerDuty

```yaml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'your-service-key'
        severity: '{{ .CommonLabels.severity }}'
```

#### Email

```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@example.com'
  smtp_auth_username: 'alerts@example.com'
  smtp_auth_password: 'app-password'

receivers:
  - name: 'email'
    email_configs:
      - to: 'team@example.com'
        send_resolved: true
```

### Essential Alerts to Start With

Here's a starter alert rules file covering the basics:

```yaml
groups:
  - name: instance-health
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"

  - name: host-resources
    rules:
      - alert: HighCpuUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.instance }}"
          description: "CPU usage is {{ $value | printf \"%.1f\" }}%"

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | printf \"%.1f\" }}%"

      - alert: DiskSpaceLow
        expr: (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Disk {{ $labels.mountpoint }} is {{ $value | printf \"%.1f\" }}% full"

  - name: application
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100 > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | printf \"%.2f\" }}%"

      - alert: HighLatency
        expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "p99 latency is {{ $value | printf \"%.2f\" }}s"
```

---

## Production Considerations

Moving from development to production? Here's what to think about.

### Storage and Retention

```yaml
# prometheus.yml or Helm values
prometheus:
  prometheusSpec:
    retention: 15d                    # How long to keep data
    retentionSize: 50GB               # Or limit by size
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3       # Use fast storage
          resources:
            requests:
              storage: 100Gi
```

**Rule of thumb:** Each time series uses ~1-2 bytes per sample. With 15-second scrape interval:
- 1000 time series × 86400 seconds/day ÷ 15 × 2 bytes ≈ 11.5 MB/day

### High Availability

For production, run multiple Prometheus instances:

```yaml
# Two Prometheus instances scraping the same targets
prometheus-1: ──┬── scrapes ── targets
prometheus-2: ──┘

# Query through Thanos or Prometheus federation
```

Or use **Thanos** for long-term storage and global view:

```
┌────────────┐     ┌────────────┐
│ Prometheus │     │ Prometheus │
│ (cluster 1)│     │ (cluster 2)│
└─────┬──────┘     └─────┬──────┘
      │                  │
      ▼                  ▼
┌─────────────────────────────────┐
│         Thanos Query            │
├─────────────────────────────────┤
│     Thanos Store (S3/GCS)       │
└─────────────────────────────────┘
```

### Resource Requirements

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| Prometheus | 0.5-2 cores | 2-8 GB | 50-500 GB |
| Grafana | 0.1-0.5 cores | 256-512 MB | 1-10 GB |
| Alertmanager | 0.1 cores | 128-256 MB | 1 GB |
| Node Exporter | 0.1 cores | 50 MB | - |

### Security

1. **Don't expose Prometheus directly to the internet**

```bash
# Bad: Prometheus on public IP
# Good: Behind reverse proxy with auth

# nginx example
location /prometheus/ {
    auth_basic "Prometheus";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://localhost:9090/;
}
```

2. **Use network policies in Kubernetes**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: prometheus-ingress
  namespace: monitoring
spec:
  podSelector:
    matchLabels:
      app: prometheus
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - port: 9090
```

3. **Secure Grafana**

```yaml
# Environment variables
GF_SECURITY_ADMIN_PASSWORD: "strong-password"
GF_USERS_ALLOW_SIGN_UP: "false"
GF_AUTH_ANONYMOUS_ENABLED: "false"
```

### Scaling Tips

| Problem | Solution |
|---------|----------|
| Too many targets | Use hierarchical federation |
| High cardinality | Reduce labels, drop unused metrics |
| Slow queries | Add recording rules for expensive queries |
| Grafana slow | Enable query caching |
| Storage full | Reduce retention, use remote storage |

---

## Troubleshooting Common Issues

### Prometheus Not Scraping Targets

**Symptom:** Targets show as DOWN in Prometheus UI

**Check 1:** Can Prometheus reach the target?

```bash
# From Prometheus container/pod
curl http://target:port/metrics
```

**Check 2:** Is the metrics endpoint working?

```bash
# Should return Prometheus format metrics
curl http://localhost:8080/metrics
```

**Check 3:** Firewall/Security groups

```bash
# EC2: Check security group allows port
# K8s: Check NetworkPolicy
kubectl get networkpolicy -A
```

**Check 4:** Service discovery (Kubernetes)

```bash
# Check if ServiceMonitor is picked up
kubectl get servicemonitor -n monitoring

# Check Prometheus config
kubectl get secret prometheus-kube-prometheus-prometheus -n monitoring -o jsonpath='{.data.prometheus\.yaml\.gz}' | base64 -d | gunzip
```

### High Memory Usage

**Symptom:** Prometheus using too much RAM

**Cause:** Usually high cardinality (too many unique label combinations)

**Diagnose:**

```promql
# Check TSDB stats
prometheus_tsdb_head_series

# Find high cardinality metrics
topk(10, count by (__name__)({__name__=~".+"}))
```

**Fix:** Drop unused labels or metrics in scrape config:

```yaml
scrape_configs:
  - job_name: 'my-app'
    static_configs:
      - targets: ['app:8080']
    metric_relabel_configs:
      # Drop metrics you don't need
      - source_labels: [__name__]
        regex: 'go_.*'
        action: drop
      # Drop high-cardinality labels
      - regex: 'id'
        action: labeldrop
```

### Grafana Not Showing Data

**Symptom:** Panels show "No data"

**Check 1:** Data source connection

- Go to Data Sources → Prometheus → Save & Test

**Check 2:** Time range

- Ensure the time range selector includes when data was collected

**Check 3:** Query syntax

- Test query directly in Prometheus UI at `:9090/graph`

**Check 4:** Metric exists

```promql
# In Prometheus, check if metric exists
{__name__=~".*your_metric.*"}
```

### Alerts Not Firing

**Symptom:** Alert conditions met but no notifications

**Check 1:** Alert state in Prometheus

- Go to `:9090/alerts` and check alert state

**Check 2:** Alertmanager receiving alerts

- Go to `:9093` and check if alerts appear

**Check 3:** Alertmanager config

```bash
# Validate config
amtool check-config alertmanager.yml

# Check routing
amtool config routes show --config.file=alertmanager.yml
```

**Check 4:** Notification channel

- Test webhook/Slack manually
- Check Alertmanager logs for errors

---

## Quick Reference

### Essential Prometheus Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/metrics` | Prometheus's own metrics |
| `/targets` | Scrape target status |
| `/alerts` | Active alerts |
| `/graph` | Query interface |
| `/config` | Current configuration |
| `/rules` | Loaded rules |
| `/-/reload` | Reload config (POST) |
| `/-/healthy` | Health check |

### Common PromQL Patterns

```promql
# Rate of counter over time
rate(metric_total[5m])

# Percentage
(a / b) * 100

# Top N
topk(5, metric)

# Percentile from histogram
histogram_quantile(0.99, sum(rate(metric_bucket[5m])) by (le))

# Increase over time period
increase(metric_total[1h])

# Average across instances
avg by (label) (metric)

# Absent (for alerting on missing metrics)
absent(up{job="my-job"})
```

### Useful Grafana Variables

Add these as dashboard variables for dynamic filtering:

```
# Instance selector
label_values(up, instance)

# Job selector
label_values(up, job)

# Namespace selector (Kubernetes)
label_values(kube_pod_info, namespace)
```

---

## Conclusion

Monitoring is a journey, not a destination. Start simple:

1. **Deploy the stack** (Docker Compose or Helm)
2. **Import community dashboards** (Node Exporter, your platform)
3. **Set up basic alerts** (instance down, high resource usage)
4. **Instrument your applications** (add /metrics endpoints)
5. **Build custom dashboards** for your specific needs
6. **Iterate** based on incidents and questions

The best monitoring setup is one that helps you answer: "Is my system healthy right now?" and "What went wrong yesterday at 3 PM?"

---

## Further Reading

- [Prometheus Documentation](https://prometheus.io/docs/introduction/overview/)
- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Awesome Prometheus Alerts](https://awesome-prometheus-alerts.grep.to/) - Pre-built alert rules
- [Grafana Dashboard Library](https://grafana.com/grafana/dashboards/) - Community dashboards
- [Google SRE Book - Monitoring Chapter](https://sre.google/sre-book/monitoring-distributed-systems/)
