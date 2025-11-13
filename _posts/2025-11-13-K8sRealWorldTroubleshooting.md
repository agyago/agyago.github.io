---
layout: post
title: "Kubernetes Real-World Troubleshooting Guide"
description: Production debugging scenarios with container crashes, config issues, and systematic troubleshooting workflows
tags: kubernetes k8s troubleshooting debugging devops sre containers
date: 2025-11-13
---

# Kubernetes Troubleshooting Guide - Real World Scenarios

This guide documents actual issues encountered in production and how to diagnose/fix them. These are common problems you'll face running applications in Kubernetes.

## Issue 1: PHP Redis Extension Build Failure (ARM64)

### Symptoms:
```
ERROR: failed to solve: process "/bin/sh -c pecl install redis && docker-php-ext-enable redis" did not complete successfully: exit code: 1
```

### Diagnosis Commands:
```bash
# Check your architecture
uname -m  # Shows arm64 on M1/M2 Macs

# Check Docker build logs
docker build --no-cache -f docker/php-fpm/Dockerfile .
```

### Root Cause:
PECL extensions sometimes fail to compile on ARM64 without proper build tools.

### Solution:
Add build dependencies and use specific version:
```dockerfile
# Add build tools
RUN apk add --no-cache \
    autoconf \
    g++ \
    make \
    linux-headers

# Install Redis with proper cleanup
RUN apk add --no-cache --virtual .build-deps $PHPIZE_DEPS \
    && pecl install redis-5.3.7 \
    && docker-php-ext-enable redis \
    && apk del .build-deps
```

---

## Issue 2: MySQL Container Permission Denied

### Symptoms:
```
mkdir: cannot create directory '/var/log/mysql': Permission denied
```

### Diagnosis Commands:
```bash
# Check pod status
kubectl get pods -n healthcare-dev

# Check container logs
kubectl logs <pod-name> -n healthcare-dev -c mysql

# Check security context
kubectl get pod <pod-name> -n healthcare-dev -o yaml | grep -A10 securityContext
```

### Root Cause:
MySQL container was forced to run as user 1001, but MySQL needs to run as the `mysql` user.

### Solution:
1. Remove custom securityContext from MySQL in values.yaml
2. Let MySQL use its default user:
```yaml
# Before (wrong):
mysql:
  securityContext:
    runAsUser: 1001

# After (correct):
mysql:
  # No securityContext - use container defaults
```

---

## Issue 3: MySQL Startup Failure - Invalid Configuration

### Symptoms:
```
[ERROR] [MY-000067] [Server] unknown variable 'query_cache_type=1'.
[ERROR] [MY-010119] [Server] Aborting
```

### Diagnosis Commands:
```bash
# Get detailed logs from crashed container
kubectl logs <pod-name> -n healthcare-dev -c mysql --previous

# Check ConfigMap
kubectl get configmap <configmap-name> -n healthcare-dev -o yaml
```

### Root Cause:
MySQL 8.0 removed query cache, but our config still had it.

### Solution:
Remove deprecated options from ConfigMap:
```yaml
# Remove these lines:
# query_cache_type = 1
# query_cache_size = 32M
```

### Alternative Quick Fix:
Disable custom MySQL config temporarily:
```yaml
volumeMounts:
  - name: mysql-data
    mountPath: /var/lib/mysql
  # Comment out custom config
  # - name: mysql-config
  #   mountPath: /etc/mysql/conf.d
```

---

## Issue 4: "Primary Script Unknown" - PHP Files Not Found

### Symptoms:
```
FastCGI sent in stderr: "Primary script unknown"
```

### Diagnosis Commands:
```bash
# Check if files exist in container
kubectl exec -it <pod-name> -n healthcare-dev -c php-fpm -- ls -la /var/www/html/
kubectl exec -it <pod-name> -n healthcare-dev -c php-fpm -- ls -la /var/www/html/public/

# Check volume mounts
kubectl describe pod <pod-name> -n healthcare-dev | grep -A20 "Mounts:"
```

### Root Cause:
Application files were copied during Docker build, but then overwritten by empty volume mount.

### Solution:
Remove volume mount that overwrites application code:
```yaml
# Before:
volumeMounts:
  - name: app-content
    mountPath: /var/www/html  # This overwrites our COPY!

# After:
volumeMounts:
  # app-content removed - files are in the image
```

### Key Learning:
- Volume mounts OVERRIDE anything at that path from the image
- Use volumes for data that changes, not for static code

---

## Issue 5: PHP Extensions Not Found (PDO MySQL, Redis)

### Symptoms:
```
Database connection failed: could not find driver
PHP Fatal error: Class "Redis" not found
```

### Diagnosis Commands:
```bash
# Check loaded PHP extensions
kubectl exec -it <pod-name> -n healthcare-dev -c php-fpm -- php -m

# Check specific extensions
kubectl exec -it <pod-name> -n healthcare-dev -c php-fpm -- php -m | grep -E "pdo|redis"

# Test PHP configuration
kubectl exec -it <pod-name> -n healthcare-dev -c php-fpm -- php -i | grep -E "pdo|redis"
```

### Root Cause:
PHP namespace issue - classes were being looked for in wrong namespace.

### Solution:
Use global namespace for PHP built-in classes:
```php
// Before:
use Redis;
use PDO;

// After:
use \Redis;     // Note the backslash
use \PDO;       // This means "global namespace"
```

---

## General Kubernetes Debugging Commands

### 1. Pod Not Starting
```bash
# Get pod status
kubectl get pods -n <namespace>

# Describe pod for events
kubectl describe pod <pod-name> -n <namespace>

# Check events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

### 2. Container Crashing
```bash
# Current logs
kubectl logs <pod-name> -n <namespace> -c <container-name>

# Previous crashed container logs
kubectl logs <pod-name> -n <namespace> -c <container-name> --previous

# Follow logs in real-time
kubectl logs -f <pod-name> -n <namespace> -c <container-name>
```

### 3. Exec Into Container
```bash
# Bash shell
kubectl exec -it <pod-name> -n <namespace> -c <container-name> -- /bin/bash

# Sh shell (for Alpine)
kubectl exec -it <pod-name> -n <namespace> -c <container-name> -- /bin/sh

# Run single command
kubectl exec <pod-name> -n <namespace> -c <container-name> -- <command>
```

### 4. Resource Issues
```bash
# Check resource usage
kubectl top pods -n <namespace>
kubectl top nodes

# Check resource limits
kubectl describe pod <pod-name> -n <namespace> | grep -A10 "Limits:"
```

### 5. Configuration Issues
```bash
# Check ConfigMaps
kubectl get configmaps -n <namespace>
kubectl describe configmap <name> -n <namespace>

# Check Secrets
kubectl get secrets -n <namespace>
kubectl get secret <name> -n <namespace> -o yaml

# Decode secret
kubectl get secret <name> -n <namespace> -o jsonpath='{.data.<key>}' | base64 -d
```

### 6. Networking Issues
```bash
# Check services
kubectl get svc -n <namespace>
kubectl describe svc <service-name> -n <namespace>

# Check endpoints
kubectl get endpoints -n <namespace>

# Test connectivity from pod
kubectl exec -it <pod-name> -n <namespace> -- curl <service-name>:<port>
```

---

## Debugging Workflow for Interviews

When presented with a failing pod, follow this sequence:

1. **Check Pod Status**
   ```bash
   kubectl get pods -n <namespace>
   # Look for: Pending, CrashLoopBackOff, Error, etc.
   ```

2. **Get More Details**
   ```bash
   kubectl describe pod <pod-name> -n <namespace>
   # Look for: Events, Failed mounts, Image pulls, etc.
   ```

3. **Check Logs**
   ```bash
   kubectl logs <pod-name> -n <namespace>
   # If multi-container pod:
   kubectl logs <pod-name> -n <namespace> -c <container-name>
   ```

4. **Check Previous Logs (if crashing)**
   ```bash
   kubectl logs <pod-name> -n <namespace> --previous
   ```

5. **Exec Into Container (if running)**
   ```bash
   kubectl exec -it <pod-name> -n <namespace> -- /bin/sh
   # Then check files, test connections, etc.
   ```

6. **Check Resources**
   ```bash
   kubectl top pods -n <namespace>
   # Check if hitting resource limits
   ```

7. **Review Configuration**
   ```bash
   # ConfigMaps
   kubectl get cm -n <namespace>
   # Secrets
   kubectl get secrets -n <namespace>
   # Volume mounts
   kubectl get pod <pod-name> -n <namespace> -o yaml | grep -A20 volumeMounts
   ```

---

## Common Patterns and Solutions

### Pattern 1: CrashLoopBackOff
- **Check**: Previous logs
- **Common causes**: Bad config, missing dependencies, permissions

### Pattern 2: ImagePullBackOff
- **Check**: Image name, registry credentials
- **Fix**: Correct image tag, add imagePullSecrets

### Pattern 3: Pending Pod
- **Check**: Events, node resources
- **Common causes**: No nodes available, PVC not bound

### Pattern 4: "Permission Denied"
- **Check**: Security context, file ownership
- **Fix**: Adjust securityContext or file permissions

### Pattern 5: "Connection Refused"
- **Check**: Service names, ports, network policies
- **Fix**: Verify service discovery, check firewall rules

---

## Interview Tips

1. **Always check logs first** - They usually tell you exactly what's wrong
2. **Use --previous for crashed containers** - Current logs might be empty
3. **Describe pod shows events** - Great for mount/pull/scheduling issues
4. **Exec is powerful** - Test connections, check files, run diagnostics
5. **Volume mounts override image content** - Common gotcha
6. **Security contexts affect permissions** - Each container can have different user

## Quick Reference Card

```bash
# The Holy Trinity of Debugging
kubectl get pods -n <namespace>
kubectl describe pod <pod> -n <namespace>
kubectl logs <pod> -n <namespace> [-c <container>] [--previous]

# Interactive Debugging
kubectl exec -it <pod> -n <namespace> [-c <container>] -- /bin/sh

# Configuration Check
kubectl get cm,secret,svc,ep -n <namespace>

# Resource Check
kubectl top pods -n <namespace>
```

---

## Systematic Debugging Approach

Remember: In interviews, verbalize your debugging process. Say things like:
- "First, I'll check the pod status..."
- "The logs show a permission error, so I'll check the security context..."
- "This looks like a configuration issue, let me check the ConfigMap..."

This shows systematic thinking, which is what interviewers want to see!

### The 5-Step Debug Method:

1. **Observe** - What's the actual symptom?
2. **Gather** - Collect logs, events, configs
3. **Hypothesize** - What could cause this?
4. **Test** - Validate your hypothesis
5. **Fix** - Apply the solution and verify

### Example Application:

**Symptom**: Pod in CrashLoopBackOff

1. **Observe**: `kubectl get pods` shows CrashLoopBackOff
2. **Gather**: `kubectl logs pod --previous` shows "Permission denied on /data"
3. **Hypothesize**: Security context or volume permissions issue
4. **Test**: `kubectl describe pod` shows runAsUser: 1001, but volume owned by root
5. **Fix**: Update securityContext or initContainer to fix permissions

---

## Pro Tips for Production

1. **Always use --previous for crashed pods** - Current container might have just started
2. **Events are time-sensitive** - They expire, so check early
3. **Multi-container pods need -c flag** - Specify which container's logs
4. **Resource limits cause OOMKilled** - Check memory limits vs actual usage
5. **InitContainers fail differently** - Check them separately if pod stuck initializing
6. **Volume mount issues prevent pod start** - Check PVC status and mount paths
7. **Image pull errors are common** - Verify image exists and credentials are correct

This guide covers the most common real-world Kubernetes issues you'll encounter in production environments!
