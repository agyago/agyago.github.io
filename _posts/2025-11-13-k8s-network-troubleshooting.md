---
layout: post
title: "Kubernetes Network Troubleshooting Guide"
description: Real-world network debugging techniques for production Kubernetes
tags: kubernetes k8s networking troubleshooting devops sre
date: 2025-11-13
---

# Kubernetes Network Troubleshooting Guide

Network issues are the #1 problem in production Kubernetes. This guide covers real-world scenarios and debugging techniques.

## Common Network Issues Overview

1. **Service Discovery** - "Can't connect to service"
2. **DNS Resolution** - "Cannot resolve hostname"
3. **Network Policies** - "Connection blocked"
4. **Load Balancer** - "External access not working"
5. **Pod-to-Pod** - "Pods can't talk to each other"

---

## Issue 1: Service Discovery Problems

### Symptoms:
- "Connection refused"
- "No such host"
- "Unable to connect to service"

### Step 1: Verify Service Exists
```bash
# Check if service exists
kubectl get svc -n healthcare-dev

# Check service details
kubectl describe svc healthcare-demo-dev -n healthcare-dev
```

### Step 2: Check Endpoints
```bash
# Are there any pods backing the service?
kubectl get endpoints healthcare-demo-dev -n healthcare-dev

# Output should show IP addresses:
# NAME                  ENDPOINTS                          AGE
# healthcare-demo-dev   10.244.1.5:80,10.244.1.5:443     5m
```

**If ENDPOINTS is empty or <none>**: The service selector doesn't match any pods!

### Step 3: Verify Selector Matches
```bash
# Check service selector
kubectl get svc healthcare-demo-dev -n healthcare-dev -o yaml | grep -A5 selector

# Check if pods have matching labels
kubectl get pods -n healthcare-dev --show-labels
```

### Solution:
```yaml
# Service selector must match pod labels exactly
selector:
  app.kubernetes.io/name: healthcare-demo
  app.kubernetes.io/instance: healthcare-demo-dev
```

---

## Issue 2: DNS Resolution Failures

### Symptoms:
- "Name or service not known"
- "Temporary failure in name resolution"
- "Could not resolve host"

### Step 1: Test DNS from Inside a Pod
```bash
# Launch a debug pod
kubectl run -it --rm debug --image=busybox --restart=Never -n healthcare-dev -- sh

# Inside the pod, test DNS
nslookup healthcare-demo-dev
nslookup healthcare-demo-dev.healthcare-dev.svc.cluster.local
nslookup kubernetes.default
```

### Step 2: Check CoreDNS
```bash
# Check if CoreDNS is running
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Check CoreDNS logs for errors
kubectl logs -n kube-system -l k8s-app=kube-dns
```

### Step 3: Test Different DNS Formats
```bash
# Short name (works only within same namespace)
curl http://healthcare-demo-dev

# Namespace qualified
curl http://healthcare-demo-dev.healthcare-dev

# Fully qualified domain name (FQDN)
curl http://healthcare-demo-dev.healthcare-dev.svc.cluster.local
```

### Common DNS Issues:
1. **Wrong service name** - It's case-sensitive!
2. **Wrong namespace** - Services in different namespaces need namespace in URL
3. **CoreDNS down** - Check kube-system namespace

---

## Issue 3: Connection Timeouts

### Symptoms:
- Connection hangs
- "Operation timed out"
- Works sometimes, fails sometimes

### Step 1: Test Connectivity
```bash
# From your local machine
kubectl port-forward svc/healthcare-demo-dev 8080:80 -n healthcare-dev

# Test
curl -v http://localhost:8080

# From inside cluster
kubectl run test-curl --rm -it --image=curlimages/curl -- sh
curl -v http://healthcare-demo-dev.healthcare-dev:80
```

### Step 2: Check Network Policies
```bash
# List network policies
kubectl get networkpolicies -n healthcare-dev

# If any exist, check if they're blocking traffic
kubectl describe networkpolicy <policy-name> -n healthcare-dev
```

### Step 3: Trace the Network Path
```bash
# Get pod IPs
kubectl get pods -n healthcare-dev -o wide

# Test direct pod-to-pod connectivity
kubectl exec -it <source-pod> -n healthcare-dev -- curl <target-pod-ip>:80
```

---

## Issue 4: Intermittent Connection Failures

### Symptoms:
- Works 50% of the time
- Random "connection refused"
- Load balancing issues

### Debugging Steps:
```bash
# Check if all pod replicas are healthy
kubectl get pods -n healthcare-dev
kubectl describe pods -n healthcare-dev | grep -A10 "Conditions:"

# Watch endpoints in real-time
kubectl get endpoints healthcare-demo-dev -n healthcare-dev -w

# Test multiple times to see pattern
for i in {1..10}; do
  kubectl exec -it <test-pod> -- curl -s -o /dev/null -w "%{http_code}\n" http://healthcare-demo-dev
done
```

### Common Causes:
1. **Failing health checks** - Pods removed from service
2. **Resource limits** - Pods getting OOMKilled
3. **Network policies** - Partial blocking

---

## Issue 5: External Access Problems

### Symptoms:
- Can't access from outside cluster
- LoadBalancer stuck in "Pending"
- Ingress not working

### For LoadBalancer Services:
```bash
# Check LoadBalancer status
kubectl get svc -n healthcare-dev

# If EXTERNAL-IP is <pending>
kubectl describe svc healthcare-demo-dev -n healthcare-dev
# Look for events explaining why
```

### For Ingress:
```bash
# Check ingress
kubectl get ingress -n healthcare-dev
kubectl describe ingress <ingress-name> -n healthcare-dev

# Check ingress controller
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx <ingress-controller-pod>
```

---

## Network Debugging Tools

### 1. Network Debugging Pod
```bash
# Create a debug pod with network tools
kubectl run netshoot --rm -it --image=nicolaka/netshoot -- bash

# Tools available:
# - ping, curl, wget
# - dig, nslookup, host
# - tcpdump, netstat, ss
# - iptables, ipvsadm
```

### 2. TCP/UDP Connectivity Test
```bash
# Test TCP port
kubectl exec -it <pod> -- nc -zv <target-host> <port>

# Test with timeout
kubectl exec -it <pod> -- timeout 5 bash -c "cat < /dev/null > /dev/tcp/<host>/<port>"
```

### 3. DNS Debugging
```bash
# Detailed DNS query
kubectl exec -it <pod> -- dig +search +short healthcare-demo-dev

# Show full DNS resolution
kubectl exec -it <pod> -- dig +trace healthcare-demo-dev.healthcare-dev.svc.cluster.local
```

### 4. Service Discovery Debug
```bash
# See how service discovery works
kubectl exec -it <pod> -- env | grep -i service

# Each service creates env vars:
# HEALTHCARE_DEMO_DEV_SERVICE_HOST=10.96.123.45
# HEALTHCARE_DEMO_DEV_SERVICE_PORT=80
```

---

## Real-World Debugging Workflow

### Scenario: "MySQL Connection Refused"

```bash
# 1. Check if MySQL is running
kubectl get pods -n healthcare-dev
# healthcare-demo-dev-xxx   3/4   Running   (MySQL container not ready)

# 2. Check MySQL logs
kubectl logs <pod> -n healthcare-dev -c mysql

# 3. Test connection from PHP container
kubectl exec -it <pod> -n healthcare-dev -c php-fpm -- mysql -h 127.0.0.1 -u root -p

# 4. Check if it's a localhost issue (common in multi-container pods)
kubectl exec -it <pod> -n healthcare-dev -c php-fpm -- nc -zv 127.0.0.1 3306
kubectl exec -it <pod> -n healthcare-dev -c php-fpm -- nc -zv localhost 3306
```

### Scenario: "Service Unavailable from Another Namespace"

```bash
# 1. Try FQDN
kubectl run test --rm -it --image=busybox -n other-namespace -- wget -O- http://healthcare-demo-dev.healthcare-dev.svc.cluster.local

# 2. Check NetworkPolicies
kubectl get networkpolicies --all-namespaces

# 3. Test from same namespace (to isolate issue)
kubectl run test --rm -it --image=busybox -n healthcare-dev -- wget -O- http://healthcare-demo-dev
```

---

## Quick Network Debugging Checklist

1. **Service exists?** → `kubectl get svc`
2. **Endpoints populated?** → `kubectl get endpoints`
3. **Labels match?** → `kubectl get pods --show-labels`
4. **DNS working?** → `nslookup` from inside pod
5. **Port correct?** → Check service and pod ports
6. **Network policy?** → `kubectl get networkpolicies`
7. **Firewall/Security groups?** → Cloud provider specific

---

## Common Fixes

### Fix 1: Service Selector Mismatch
```yaml
# Check pod labels
kubectl get pods --show-labels

# Update service selector to match
kubectl edit svc healthcare-demo-dev
```

### Fix 2: DNS Not Resolving
```bash
# Restart CoreDNS
kubectl rollout restart deployment coredns -n kube-system

# Or delete pods to force restart
kubectl delete pods -n kube-system -l k8s-app=kube-dns
```

### Fix 3: Connection Refused
```bash
# Usually means:
# 1. Service port wrong
# 2. Container not listening on expected port
# 3. Application crashed

# Verify port
kubectl get svc healthcare-demo-dev -o yaml | grep port
kubectl exec -it <pod> -- netstat -tlnp
```

---

## Interview Answer Template

When asked about network issues, structure your answer:

1. **Identify the layer**
   - "Is this a DNS issue, service discovery, or network policy?"

2. **Gather information**
   - "I'll check services, endpoints, and pod status"

3. **Test connectivity**
   - "I'll test from inside a pod to isolate the issue"

4. **Check configurations**
   - "I'll verify selectors, ports, and policies"

5. **Apply fix**
   - "Based on the findings, I'll update the configuration"

Example:
> "I see connection refused. First, I'll check if the service exists with `kubectl get svc`. Then verify endpoints are populated with `kubectl get endpoints`. If empty, I'll check pod labels match the service selector..."

---

## Pro Tips

1. **Always test from inside the cluster** - External issues are different from internal
2. **Use FQDN for cross-namespace** - Short names only work within namespace
3. **Check both TCP and UDP** - Some services use UDP (DNS, game servers)
4. **Remember localhost in multi-container pods** - Containers share network namespace
5. **NetworkPolicies are deny-by-default** - Once you add one, all other traffic is blocked

This guide covers 90% of network issues you'll see in production Kubernetes!
