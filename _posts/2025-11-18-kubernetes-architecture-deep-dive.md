---
layout: post
title: "Kubernetes Architecture Deep Dive: Understanding Every Component"
date: 2025-11-28
description: Complete guide to Kubernetes control plane, worker nodes, and add-ons with real-world examples and troubleshooting
tags: [kubernetes, devops, tutorial, architecture, troubleshooting]
---

Ever wondered what's actually happening when you run `kubectl get pods`? Here's a complete breakdown of Kubernetes architecture - from control plane to worker nodes - with real-world analogies, practical examples, and **component-specific troubleshooting** from production clusters.

## The Problem

Kubernetes feels like magic:
- Run `kubectl apply -f deployment.yaml` → Pods appear
- Delete a pod → It comes back automatically
- Node crashes → Pods move to healthy nodes
- Update an image → Rolling update happens

But **what's actually happening behind the scenes?** Understanding the architecture helps you:
- Debug issues faster (know which component is failing)
- Design better deployments
- Pass the CKA exam
- Make informed decisions about managed vs self-hosted

**This guide covers:**
- How each component works
- What happens when it breaks
- How to fix it systematically

## Kubernetes Architecture Overview

Kubernetes has three main layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE                            │
│  (The Brain - Makes All Decisions)                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  kube-api    │  │  etcd        │  │  kube-       │     │
│  │  server      │  │  (database)  │  │  scheduler   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  kube-       │  │  cloud-      │                        │
│  │  controller  │  │  controller  │                        │
│  │  manager     │  │  manager     │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                         ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    WORKER NODES                              │
│  (The Workers - Run Your Applications)                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  kubelet     │  │  kube-proxy  │  │  container   │     │
│  │              │  │              │  │  runtime     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │           Your Application Pods                   │      │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐            │      │
│  │  │Pod 1│  │Pod 2│  │Pod 3│  │Pod 4│            │      │
│  │  └─────┘  └─────┘  └─────┘  └─────┘            │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                         ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    ADD-ONS (Optional but Common)             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  CoreDNS     │  │  Metrics     │  │  Ingress     │     │
│  │              │  │  Server      │  │  Controller  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## PART 1: Control Plane Components

The control plane is "the brain" - it makes all decisions but doesn't run your applications.

### 1. kube-apiserver: The Front Desk

**Real-world analogy:** Hotel front desk

Everything goes through the front desk:
- Check-in, check-out, requests, complaints
- Front desk talks to all departments
- Only authorized entry point

**What it does:**

```bash
# Every kubectl command goes through kube-apiserver
You run: kubectl get pods
   ↓
kubectl → kube-apiserver → etcd (database)
   ↓
kube-apiserver → Returns pod list
```

**Behind the scenes when you create a deployment:**

```bash
kubectl apply -f deployment.yaml

# Step-by-step:
1. kubectl sends HTTPS request to kube-apiserver
2. kube-apiserver authenticates you (are you allowed?)
3. kube-apiserver authorizes you (RBAC check)
4. kube-apiserver validates the YAML
5. kube-apiserver stores it in etcd
6. kube-apiserver tells scheduler: "We need pods"
7. Scheduler finds nodes
8. kube-apiserver tells kubelet: "Start these pods"
```

**Key characteristics:**

- **Stateless**: Doesn't store anything (etcd stores everything)
- **RESTful API**: Everything is an HTTP API call
- **Security gateway**: Authentication/Authorization happens here
- **Validation**: Checks if your YAML is valid
- **Only component that talks to etcd directly**

**In AWS EKS:**

```bash
✅ Managed by AWS
✅ Highly available (multi-AZ)
✅ Auto-upgraded by AWS
❌ You can't SSH into it
✅ You just use it via kubectl
```

#### Troubleshooting kube-apiserver

**Symptom 1: Can't Connect to Cluster**

```bash
Error: The connection to the server <endpoint> was refused
```

**Diagnosis:**

```bash
# Check if you can reach the endpoint
curl -k https://<cluster-endpoint>:443

# Check your kubeconfig
kubectl config view
kubectl config current-context

# Verify AWS credentials (EKS)
aws sts get-caller-identity
```

**Common Causes:**
- ❌ Wrong kubeconfig context
- ❌ Expired AWS credentials
- ❌ VPC/Security group blocking access
- ❌ Cluster endpoint not public (EKS)

**Fixes:**

```bash
# Update kubeconfig
aws eks update-kubeconfig --name <cluster> --region <region>

# Refresh AWS credentials
aws sso login  # or aws configure

# Check security groups allow your IP on port 443

# Enable public endpoint in EKS cluster settings (if needed)
```

**Symptom 2: Authentication Failures**

```bash
Error: User "system:anonymous" cannot get pods
```

**Diagnosis:**

```bash
# Check current user
kubectl auth whoami

# Check if user has permissions
kubectl auth can-i get pods
```

**Common Causes:**
- ❌ No valid credentials in kubeconfig
- ❌ RBAC not configured
- ❌ AWS IAM role not mapped to K8s

**Fixes (EKS):**

```bash
# Update aws-auth ConfigMap
kubectl edit configmap aws-auth -n kube-system
# Add your IAM user/role mapping

# Verify IAM permissions for EKS
aws eks describe-cluster --name <cluster>
```

---

### 2. etcd: The Database

**Real-world analogy:** Hospital medical records system

- Every patient record stored here
- Doctors/nurses read from here
- Critical: If records lost, chaos!

**What it stores:**

```bash
Everything about your cluster:
✅ All pod definitions
✅ All service configurations
✅ All ConfigMaps and Secrets
✅ All node information
✅ All namespace definitions
✅ Cluster state (current vs desired)

If etcd dies = Your entire cluster knowledge is gone!
```

**Example - Pod lifecycle in etcd:**

```bash
# When you create a pod:
kubectl run nginx --image=nginx
   ↓
kube-apiserver writes to etcd:
{
  "kind": "Pod",
  "name": "nginx",
  "namespace": "default",
  "image": "nginx",
  "status": "Pending"
}

# When pod starts:
kubelet updates via kube-apiserver → etcd:
{
  "status": "Running",
  "ip": "10.0.68.144",
  "node": "ip-10-0-90-96..."
}

# When you query:
kubectl get pod nginx
   ↓
kube-apiserver reads from etcd → Returns data
```

**Why it's critical:**

```bash
Scenario: etcd crashes and data lost

Before:
- 50 deployments running
- 200 pods active
- All your services working

After:
- Kubernetes has amnesia
- Doesn't know what should be running
- Can't recreate anything
- TOTAL DISASTER! 💥

Solution: Always backup etcd!
```

**etcd features:**

- **Distributed**: Runs on 3-5 nodes (high availability)
- **Consistent**: All nodes have same data
- **Watch mechanism**: Components can watch for changes
- **Fast**: Optimized for reads (most operations)

**In AWS EKS:**

```bash
✅ Managed by AWS (you never see it)
✅ Automatically backed up
✅ Multi-AZ for high availability
✅ Encrypted at rest
❌ You can't access it directly
❌ You can't backup manually (AWS does it)

⚠️  CKA exam: You WILL need to backup/restore etcd manually!
⚠️  EKS: AWS handles this for you
```

#### Troubleshooting etcd

**Symptom: Cluster State Inconsistencies**

```bash
Error: Pods show in kubectl but don't actually exist
```

**Diagnosis (Self-Managed):**

```bash
# Check etcd health
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint health

# Check etcd member list
ETCDCTL_API=3 etcdctl member list
```

**Common Causes:**
- ❌ etcd member out of sync
- ❌ Disk I/O issues
- ❌ Network partition

**In EKS:**

```bash
✅ AWS manages this - file support ticket if suspected
✅ Check AWS Service Health Dashboard
✅ Review CloudWatch logs for EKS control plane
```

---

### 3. kube-scheduler: The Matchmaker

**Real-world analogy:** Wedding planner matching guests to tables

- Considers preferences, conflicts, space
- Makes best match possible
- Updates seating chart

**What it does:**

```bash
Job: Find the best node for each new pod

Process:
1. Watch for new pods (status: Pending)
2. Filter nodes (which nodes CAN run this pod?)
3. Score nodes (which node is BEST for this pod?)
4. Assign pod to winning node
5. Update kube-apiserver
```

**Example - Scheduling a pod:**

```bash
You create deployment:
kubectl apply -f app.yaml

Scheduler thinks:
"New pod needs: 2GB RAM, 1 CPU, 10GB storage"

Step 1: Filter nodes
- Node 1: Only 1GB RAM available ❌
- Node 2: Has 4GB RAM available ✅
- Node 3: Has 3GB RAM available ✅

Step 2: Score nodes
- Node 2: 50% CPU used, close to pod's volume
- Node 3: 80% CPU used, far from volume

Winner: Node 2! (better resource availability)

Scheduler: "kube-apiserver, put pod on Node 2"
```

**Scheduling factors considered:**

```bash
Resource requirements:
- CPU requested
- Memory requested
- Storage needs

Node conditions:
- Disk pressure
- Memory pressure
- PID pressure (too many processes)

Affinity/Anti-affinity:
- Run near certain pods (affinity)
- Run away from certain pods (anti-affinity)
- Example: Don't run 2 database replicas on same node

Taints and tolerations:
- Node says: "I don't want most pods" (taint)
- Pod says: "I can tolerate that taint" (toleration)

Node selectors:
- Pod says: "I want GPU node"
- Scheduler: "Find nodes with GPU"
```

**In AWS EKS:**

```bash
✅ Managed by AWS
✅ Runs on control plane
✅ You can see scheduling decisions:
   kubectl describe pod <pod> | grep "Events"
✅ You can influence with nodeSelectors, affinity
❌ You can't modify scheduler algorithm
```

#### Troubleshooting kube-scheduler

**Symptom: Pods Stuck in Pending**

```bash
kubectl get pods
NAME      READY   STATUS    RESTARTS   AGE
my-pod    0/1     Pending   0          5m
```

**Diagnosis:**

```bash
# Check why pod is pending
kubectl describe pod <pod-name> -n <namespace>

# Look for events like:
# "0/3 nodes are available: 3 Insufficient cpu"
# "0/3 nodes are available: 3 node(s) had taint {key=value}"
```

**Common Causes & Fixes:**

**1. Insufficient Resources:**

```bash
kubectl get nodes -o wide
kubectl describe node <node-name> | grep -A5 "Allocated resources"

# Fix:
# ✅ Scale up nodes (add more nodes)
# ✅ Reduce pod resource requests
# ✅ Delete unused pods
```

**2. Node Taints:**

```bash
kubectl describe node <node-name> | grep Taints

# Fix:
# ✅ Add toleration to pod
# ✅ Remove taint:
kubectl taint node <node> key=value:NoSchedule-
```

**3. Node Selectors Not Matching:**

```bash
kubectl get pod <pod> -o yaml | grep -A5 nodeSelector
kubectl get nodes --show-labels

# Fix:
# ✅ Add correct label to node
kubectl label node <node> disktype=ssd

# ✅ Fix nodeSelector in pod spec
```

**4. Affinity Rules Preventing Scheduling:**

```bash
kubectl describe pod <pod> | grep -A10 "Node-Selectors"

# Fix:
# ✅ Adjust affinity rules
# ✅ Ensure target nodes exist
```

---

### 4. kube-controller-manager: The Autopilot

**Real-world analogy:** Thermostat

- You set: "70°F"
- Thermostat watches temperature
- Too cold? Turn on heater
- Too hot? Turn on AC
- Continuously maintains 70°F

**What it does:**

```bash
Kubernetes magic: "Desired state = Actual state"

You say: "I want 3 nginx pods running"
Controller: "I'll make sure 3 are ALWAYS running"

Reality:
- 1 pod crashes → Controller creates new one
- Node dies → Controller reschedules pods
- You scale to 5 → Controller creates 2 more
- You scale to 1 → Controller deletes 2

It never stops watching and fixing!
```

**Main controllers inside:**

#### Node Controller

```bash
Job: Monitor node health

Every 5 seconds:
- Check: Is node responding?
- If not: Mark as "NotReady"
- After 40 seconds: Start evicting pods
- Reschedule pods on healthy nodes

Example:
# Old node went down
Node: ip-10-0-82-40 (NotReady)
Node Controller: "This node is dead!"
Node Controller: "Move all pods to other nodes"
# Pods automatically rescheduled
```

#### ReplicaSet Controller

```bash
Job: Maintain pod replica count

Deployment says: replicas: 3
Controller watches:

Scenario 1: Pod crashes
- Current: 2 pods running
- Desired: 3 pods
- Action: Create 1 new pod

Scenario 2: Too many pods
- Current: 4 pods running
- Desired: 3 pods
- Action: Delete 1 pod

Scenario 3: Node fails
- Current: 0 pods on failed node
- Desired: 3 pods total
- Action: Create 3 pods on healthy nodes

This is why Kubernetes is "self-healing"!
```

#### Deployment Controller

```bash
Job: Manage rolling updates

You update image: nginx:1.19 → nginx:1.20

Deployment Controller:
1. Create new ReplicaSet with nginx:1.20
2. Scale new ReplicaSet up (1 → 2 → 3)
3. Scale old ReplicaSet down (3 → 2 → 1 → 0)
4. Delete old pods gradually
5. If anything fails: Rollback automatically

Zero downtime updates! ✨
```

#### Service/Endpoints Controller

```bash
Job: Keep service endpoints updated

Service: my-api-service
Selector: app=my-api

Controller watches:
- New pod with label app=my-api created?
  → Add to service endpoints
- Pod with app=my-api deleted?
  → Remove from service endpoints
- Pod becomes unhealthy?
  → Remove from service endpoints

This is how services always route to healthy pods!
```

#### StatefulSet Controller

```bash
Job: Manage stateful applications (like databases)

database-0 (a StatefulSet pod):
- Gets unique name: database-0 (not random)
- Gets persistent volume attached
- If deleted, recreated with SAME name
- If rescheduled, volume follows it

Why databases use StatefulSet:
- Need same identity
- Need persistent storage
- Can't lose data

Regular deployment would give random names!
```

**Example - Automatic recovery:**

```bash
# What happened during cluster upgrade:

database-0 pod definition:
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: database
spec:
  replicas: 1

Upgrade scenario:
1. Old node cordoned (marked unschedulable)
2. StatefulSet Controller: "database-0 is on bad node"
3. Controller: "Delete database-0"
4. Controller: "Create database-0 on good node"
5. Controller: "Attach same volume"
6. Database starts with all data intact!

Automatic! Controller handled everything!
```

**In AWS EKS:**

```bash
✅ Managed by AWS
✅ Runs on control plane
✅ All controllers running automatically
✅ You see effects in events:
   kubectl get events --all-namespaces
❌ You can't modify controller behavior
```

#### Troubleshooting kube-controller-manager

**Symptom 1: Pods Not Recreating After Failure**

```bash
# Deployment says 3 replicas, only 1 running
kubectl get deployment <deployment> -n <namespace>
```

**Diagnosis:**

```bash
# Check deployment status
kubectl get deployment <deployment> -n <namespace>
kubectl describe deployment <deployment> -n <namespace>

# Check ReplicaSet
kubectl get rs -n <namespace>
kubectl describe rs <replicaset> -n <namespace>

# Check controller manager logs (self-managed)
kubectl logs -n kube-system kube-controller-manager-<node>
```

**Common Causes:**
- ❌ Image pull failures
- ❌ Resource constraints
- ❌ PVC not available
- ❌ Controller manager not running

**Fixes:**

```bash
# ✅ Fix image name/pull secrets
kubectl describe pod <pod> | grep -A5 "Events"

# ✅ Add more node capacity
kubectl get nodes
kubectl top nodes

# ✅ Check PVC status
kubectl get pvc

# ✅ In EKS, AWS handles controller - check AWS support
```

**Symptom 2: Services Not Getting Endpoints**

```bash
# Service exists but has no endpoints
kubectl get endpoints <service-name> -n <namespace>
# Shows: <none>
```

**Diagnosis:**

```bash
# Check service
kubectl get svc <service-name> -n <namespace>

# Check endpoints
kubectl get endpoints <service-name> -n <namespace>

# Check pod labels
kubectl get pods -n <namespace> --show-labels

# Check service selector
kubectl get svc <service-name> -n <namespace> -o yaml | grep -A5 selector
```

**Fix:**

```bash
# ✅ Update service selector to match pod labels
kubectl edit svc <service-name>

# ✅ Or update pod labels to match service selector
kubectl label pod <pod> app=my-app

# Example:
# Service selector: app=nginx
# Pod labels: app=web ← Doesn't match!
kubectl label pod <pod> app=nginx  # Add matching label
```

---

### 5. cloud-controller-manager: The Cloud Liaison

**Real-world analogy:** Embassy diplomat

- Translates between two countries
- Handles special requests needing government help
- Coordinates complex operations

**What it does:**

```bash
When Kubernetes needs cloud resources:

Kubernetes: "I need a LoadBalancer"
cloud-controller-manager: "AWS, create ELB please"
AWS: "Here's your ELB: a1b2c3.elb.amazonaws.com"
cloud-controller-manager: "Kubernetes, here's the LoadBalancer"

Kubernetes: "Delete this node"
cloud-controller-manager: "AWS, terminate EC2 instance"
```

**Main responsibilities:**

#### Node Controller (Cloud Version)

```bash
Job: Sync Kubernetes nodes with cloud instances

Actions:
1. New EC2 instance starts
   → cloud-controller adds it to Kubernetes

2. EC2 instance terminated
   → cloud-controller removes from Kubernetes

3. Check if node is actually running
   → Query AWS API
   → Update node status

This is why kubectl get nodes shows your EC2 instances!
```

#### Route Controller

```bash
Job: Configure network routes in cloud

Example:
- Pod on Node 1 needs to talk to Pod on Node 2
- cloud-controller configures AWS VPC routes
- Traffic flows correctly between nodes

Without this: Pod-to-pod networking breaks!
```

#### Service Controller (Load Balancer)

```bash
Job: Create/delete cloud load balancers

You create:
apiVersion: v1
kind: Service
metadata:
  name: my-api
spec:
  type: LoadBalancer
  ports:
  - port: 80

cloud-controller-manager:
1. Sees LoadBalancer service
2. Calls AWS API: "Create ELB"
3. Configures target groups
4. Updates service with ELB DNS
5. Traffic flows!

You delete service:
1. cloud-controller sees deletion
2. Calls AWS: "Delete ELB"
3. Cleans up AWS resources

This prevents orphaned load balancers! 💰
```

**In AWS EKS:**

```bash
✅ AWS-specific version running
✅ Handles ELB/ALB/NLB creation
✅ Manages node lifecycle
✅ Configures VPC networking
✅ Integrates with AWS IAM
❌ You never interact with it directly
```

---

## PART 2: Worker Node Components

Worker nodes are "the workers" - they actually run your containers.

### 6. kubelet: The Node Manager

**Real-world analogy:** Building superintendent

- Receives orders from management
- Executes work in the building
- Reports back on status
- Handles day-to-day operations

**What it does:**

```bash
Main job: Run containers as instructed by control plane

Process:
1. Watch kube-apiserver for pod assignments
2. See pod assigned to this node
3. Tell container runtime to start containers
4. Monitor container health
5. Report status back to kube-apiserver

Kubelet is the ONLY thing that runs containers!
```

**Example - Starting a pod:**

```bash
Scheduler decides: "nginx-pod goes on node-1"

kubelet on node-1:
1. Sees: "Hey, I got a new pod assignment!"
2. Checks: Do I have the image? (nginx:latest)
3. If not: Pull from Docker Hub
4. Creates: Container with image
5. Starts: Container
6. Monitors: Is it healthy?
7. Reports: "nginx-pod is Running" → kube-apiserver

Every 10 seconds:
- Check if container still running
- Run liveness probe (is app healthy?)
- Run readiness probe (is app ready for traffic?)
- Report status to kube-apiserver
```

**Main responsibilities:**

#### Pod Lifecycle Management

```bash
Create pod:
1. Pull image (if needed)
2. Create container
3. Start container
4. Monitor container

Delete pod:
1. Send SIGTERM (graceful shutdown)
2. Wait 30 seconds (grace period)
3. Send SIGKILL (force kill)
4. Clean up resources
5. Remove container
```

#### Health Monitoring

```bash
Liveness Probe:
"Is the application alive?"
- If fails: Kill and restart container
- Example: HTTP GET /health returns 200?

Readiness Probe:
"Is the application ready for traffic?"
- If fails: Remove from service endpoints
- Example: Database connection ready?

Startup Probe:
"Has the application finished starting?"
- Gives slow-starting apps time
- Example: App takes 2 min to start
```

#### Resource Management

```bash
Enforces limits:
spec:
  containers:
  - name: my-app
    resources:
      requests:
        memory: "2Gi"
        cpu: "1000m"
      limits:
        memory: "4Gi"
        cpu: "2000m"

kubelet:
- Guarantees: At least 2Gi RAM, 1 CPU
- Prevents: Using more than 4Gi RAM, 2 CPU
- If exceeds memory limit: OOMKilled
- If exceeds CPU limit: Throttled
```

#### Volume Management

```bash
Example StatefulSet:
volumeMounts:
- name: data
  mountPath: /var/lib/mysql

kubelet:
1. Sees volume requirement
2. Attaches EBS volume (via AWS API)
3. Mounts volume to /var/lib/mysql
4. Container sees files
5. When pod deleted: Unmounts safely
6. Volume persists (data safe!)
```

**In AWS EKS:**

```bash
✅ Runs on every worker node (EC2/Fargate)
✅ Auto-installed on managed node groups
✅ Communicates with EKS control plane
✅ Manages container runtime (containerd)
❌ You rarely interact with it directly
✅ Logs available: journalctl -u kubelet
```

#### Troubleshooting kubelet

**Symptom 1: Node Shows NotReady**

```bash
kubectl get nodes
NAME          STATUS     ROLES    AGE   VERSION
node-1        NotReady   <none>   5d    v1.32
```

**Diagnosis:**

```bash
# Check node status
kubectl get nodes
kubectl describe node <node-name>

# Look for conditions:
# MemoryPressure: True
# DiskPressure: True
# PIDPressure: True

# SSH to node and check kubelet
ssh ec2-user@<node-ip>
sudo systemctl status kubelet
sudo journalctl -u kubelet -f
```

**Common Causes & Fixes:**

**1. Kubelet Crashed:**

```bash
sudo systemctl status kubelet

# Fix:
sudo systemctl restart kubelet
sudo systemctl enable kubelet
```

**2. Disk Full:**

```bash
df -h

# Fix: Clean up
sudo crictl rmi --prune  # Remove unused images
sudo journalctl --vacuum-time=3d  # Clean old logs
```

**3. Memory Pressure:**

```bash
free -h

# Fix:
# - Kill memory-hogging processes
# - Add memory to node
# - Scale down pods
```

**4. Network Issues:**

```bash
# Check if node can reach kube-apiserver
curl -k https://<apiserver>:443

# Fix: Check security groups, routes
```

**5. Certificate Expired:**

```bash
sudo ls -la /var/lib/kubelet/pki/
# Check cert expiry dates

# Fix: Renew certificates or rotate node
```

**Symptom 2: Pods Not Starting on Node**

```bash
# Pod stuck in ContainerCreating
kubectl get pods
NAME      READY   STATUS              RESTARTS   AGE
my-pod    0/1     ContainerCreating   0          5m
```

**Diagnosis:**

```bash
kubectl describe pod <pod-name> -n <namespace>

# Check events for errors like:
# "Failed to create pod sandbox"
# "Failed to pull image"
# "Error: ImagePullBackOff"

# On the node:
ssh ec2-user@<node-ip>
sudo crictl ps -a  # Check container status
sudo crictl logs <container-id>
```

**Common Causes & Fixes:**

**1. Image Pull Failures:**

```bash
Error: ImagePullBackOff

# Check:
kubectl describe pod <pod> | grep -A10 "Events:"

# Fixes:
# ✅ Verify image name is correct
# ✅ Add imagePullSecrets if private registry
# ✅ Check network connectivity to registry
# ✅ Check disk space: df -h
```

**2. Volume Mount Failures:**

```bash
Error: Unable to attach or mount volumes

# Check:
kubectl get pvc -n <namespace>
kubectl describe pvc <pvc-name>

# Fixes:
# ✅ Verify PVC is Bound
# ✅ Check StorageClass exists
# ✅ Verify EBS volume exists (AWS)
# ✅ Check node has permission to attach volumes
```

**3. Resource Limits:**

```bash
Error: Pod exceeded memory limit

# Fix:
# ✅ Increase limits in deployment
spec:
  containers:
  - name: app
    resources:
      limits:
        memory: "2Gi"  # Increase this

# ✅ Or optimize application to use less memory
```

**Symptom 3: High CPU/Memory Usage on Node**

```bash
# Node performance degraded
kubectl top node <node-name>
NAME     CPU    MEMORY
node-1   95%    88%
```

**Diagnosis:**

```bash
# Check node resource usage
kubectl top node <node-name>

# Check which pods are using resources
kubectl top pods --all-namespaces --sort-by=memory
kubectl top pods --all-namespaces --sort-by=cpu

# On the node:
ssh ec2-user@<node-ip>
top
htop  # If installed
```

**Fixes:**

```bash
# ✅ Identify resource-hogging pods
kubectl top pods --all-namespaces

# ✅ Set resource limits on pods
# ✅ Scale down non-critical workloads
# ✅ Add more nodes to cluster
# ✅ Upgrade node instance type
```

---

### 7. kube-proxy: The Traffic Cop

**Real-world analogy:** Traffic police directing cars

**What it does:**

```bash
Job: Routes traffic to correct pods

Service: my-api-service (ClusterIP: 10.96.0.1)
Actual pods:
- pod-1 (IP: 10.0.68.144)
- pod-2 (IP: 10.0.68.145)
- pod-3 (IP: 10.0.68.146)

kube-proxy:
1. Watches services via kube-apiserver
2. Sets up iptables rules on every node
3. Traffic to 10.96.0.1:80 → Load balances to pods
4. Automatically removes unhealthy pods from rotation

Without kube-proxy: Services don't work!
```

**How it works:**

```bash
# On every node, kube-proxy creates iptables rules:

# When you curl 10.96.0.1:80
iptables intercepts:
- 33% chance → 10.0.68.144:8080 (pod-1)
- 33% chance → 10.0.68.145:8080 (pod-2)
- 33% chance → 10.0.68.146:8080 (pod-3)

Load balancing built-in!
```

**Common issue - Version mismatch:**

```bash
Problem:
Cluster: Kubernetes 1.32
kube-proxy: 1.29 ← 3 versions behind!

Risk:
- Doesn't understand new service features
- May route traffic incorrectly
- Security vulnerabilities

Fix: Update kube-proxy to match cluster version
```

**In AWS EKS:**

```bash
✅ Runs as DaemonSet (one pod per node)
✅ Can be managed add-on (AWS auto-updates)
⚠️  Or self-managed (you update manually)
✅ Check version: kubectl get ds kube-proxy -n kube-system
```

#### Troubleshooting kube-proxy

**Symptom 1: Can't Connect to Services**

```bash
# Error: Connection refused when accessing service
curl http://my-service
curl: (7) Failed to connect
```

**Diagnosis:**

```bash
# Check service exists
kubectl get svc <service-name> -n <namespace>

# Check endpoints exist
kubectl get endpoints <service-name> -n <namespace>
# If <none> - no pods backing the service!

# Check kube-proxy running
kubectl get pods -n kube-system -l k8s-app=kube-proxy

# Check kube-proxy logs
kubectl logs -n kube-system -l k8s-app=kube-proxy

# On the node, check iptables rules
ssh ec2-user@<node-ip>
sudo iptables-save | grep <service-name>
```

**Common Causes & Fixes:**

**1. No Endpoints:**

```bash
kubectl get endpoints <service> -n <namespace>
# Shows: <none>

# Fix:
# ✅ Check pod selector matches service selector
kubectl get svc <service> -o yaml | grep -A5 selector
kubectl get pods --show-labels
```

**2. kube-proxy Not Running:**

```bash
kubectl get pods -n kube-system | grep kube-proxy

# Fix:
# ✅ Check DaemonSet
kubectl get ds kube-proxy -n kube-system

# ✅ Check for errors
kubectl describe ds kube-proxy -n kube-system
```

**3. Wrong Version (Version Mismatch):**

```bash
kubectl get daemonset kube-proxy -n kube-system -o jsonpath='{.spec.template.spec.containers[0].image}'

# Fix:
# ✅ Update to match cluster version
kubectl set image daemonset kube-proxy -n kube-system \
  kube-proxy=<registry>/kube-proxy:v1.32.6
```

**4. Network Policy Blocking Traffic:**

```bash
kubectl get networkpolicies -n <namespace>

# Fix:
# ✅ Review and adjust network policies
# ✅ Temporarily delete to test
kubectl delete networkpolicy <policy>
```

**Symptom 2: Intermittent Connection Failures**

```bash
# Service works sometimes, fails sometimes
```

**Diagnosis:**

```bash
# Test multiple times
for i in {1..20}; do
  kubectl exec -it <test-pod> -- curl -s http://<service> || echo "FAIL"
done

# Check if all pods are healthy
kubectl get pods -n <namespace>
kubectl describe pods -n <namespace> | grep -A5 "Conditions:"
```

**Common Causes:**
- ❌ One pod in service is failing health checks
- ❌ kube-proxy rules not updated
- ❌ Network policy intermittently blocking

**Fixes:**

```bash
# ✅ Fix failing pods (check logs)
kubectl logs <pod>

# ✅ Restart kube-proxy
kubectl delete pod -n kube-system -l k8s-app=kube-proxy

# ✅ Review network policies
kubectl get networkpolicies -A
```

---

### 8. Container Runtime: The Engine

**Real-world analogy:** Car engine

- Kubernetes is the driver
- Container runtime is the engine
- Driver controls, engine does the work

**Container runtime options:**

```bash
Historical:
1. Docker (deprecated in K8s 1.24)
   - First popular runtime
   - Too heavy for Kubernetes
   - Removed from Kubernetes

2. containerd (most common now) ✅
   - Lightweight
   - Industry standard
   - Docker without the bloat

3. CRI-O
   - Designed specifically for Kubernetes
   - Lightweight
   - Used by OpenShift

Most EKS clusters use: containerd
```

**What it does:**

```bash
kubelet says: "Start this container"

Container runtime:
1. Pull image from registry
2. Extract image layers
3. Create container filesystem
4. Set up networking
5. Set up storage volumes
6. Start container process
7. Monitor container
8. Report status to kubelet

Low-level work that kubelet delegates!
```

**Checking your runtime:**

```bash
# Check container runtime on nodes:
kubectl get nodes -o wide
# Output shows: containerd://1.7.27

# On the node itself (if you SSH):
crictl ps           # List containers (like docker ps)
crictl images       # List images (like docker images)
crictl logs <id>    # Get logs (like docker logs)
```

**In AWS EKS:**

```bash
✅ containerd pre-installed
✅ Managed by AWS
✅ Auto-updated with node AMI
❌ You rarely need to interact with it
✅ kubelet handles everything
```

#### Troubleshooting Container Runtime

**Symptom: Containers Won't Start**

```bash
Error: Failed to create container
```

**Diagnosis:**

```bash
# On the node
ssh ec2-user@<node-ip>

# Check containerd status
sudo systemctl status containerd

# Check container logs
sudo crictl ps -a
sudo crictl logs <container-id>

# Check containerd logs
sudo journalctl -u containerd -f
```

**Common Causes & Fixes:**

**1. Containerd Not Running:**

```bash
sudo systemctl status containerd

# Fix:
sudo systemctl restart containerd
sudo systemctl enable containerd
```

**2. Disk Space Full:**

```bash
df -h

# Fix:
# Remove unused images
sudo crictl rmi --prune

# Remove stopped containers
sudo crictl rm $(sudo crictl ps -a -q --state=exited)
```

**3. Image Corruption:**

```bash
sudo crictl images
sudo crictl rmi <image-id>  # Remove and re-pull
```

**4. Runtime Configuration Issues:**

```bash
sudo cat /etc/containerd/config.toml
# Check for misconfigurations

# Fix: Reset to defaults if needed
sudo containerd config default | sudo tee /etc/containerd/config.toml
sudo systemctl restart containerd
```

---

## PART 3: Add-on Components

Add-ons are optional but commonly used components.

### 9. CoreDNS: The Phonebook

**What it does:**

```bash
Translates service names → IP addresses

my-api.default.svc.cluster.local → 10.96.0.1

Without CoreDNS:
- Pods can't find services by name
- Must use IP addresses (breaks when pods restart)
- Service discovery doesn't work
```

**Example:**

```bash
# Inside a pod:
curl http://my-api-service
   ↓
Pod asks CoreDNS: "What's the IP of my-api-service?"
   ↓
CoreDNS responds: "10.96.0.1"
   ↓
Pod connects to 10.96.0.1
   ↓
kube-proxy routes to actual pod
```

**In AWS EKS:**

```bash
✅ Included as add-on
✅ Runs as deployment in kube-system namespace
✅ Usually 2 replicas (high availability)
⚠️  Self-managed by default (manual updates)
✅ Can migrate to managed add-on (AWS auto-updates)
```

#### Troubleshooting CoreDNS

**Symptom 1: DNS Resolution Failures**

```bash
Error: Cannot resolve service names
```

**Diagnosis:**

```bash
# Test DNS from a pod
kubectl run debug --rm -it --image=busybox --restart=Never -- sh
nslookup kubernetes.default
nslookup <service-name>.<namespace>

# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Check CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns
```

**Common Causes & Fixes:**

**1. CoreDNS Pods Not Running:**

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Fix:
kubectl rollout restart deployment coredns -n kube-system
```

**2. CoreDNS ConfigMap Issues:**

```bash
kubectl get configmap coredns -n kube-system -o yaml

# Fix:
# ✅ Review and fix configuration
# ✅ Restart CoreDNS after changes
kubectl rollout restart deployment coredns -n kube-system
```

**3. DNS Service Not Working:**

```bash
kubectl get svc kube-dns -n kube-system

# Fix:
# ✅ Verify service has endpoints
kubectl get endpoints kube-dns -n kube-system
```

**4. Wrong DNS in Pod:**

```bash
kubectl exec -it <pod> -- cat /etc/resolv.conf
# Should show: nameserver 10.96.0.10 (or cluster DNS IP)

# Fix:
# ✅ Check kubelet --cluster-dns flag
# ✅ Restart kubelet if needed
```

**5. Version Mismatch:**

```bash
kubectl get deployment coredns -n kube-system -o jsonpath='{.spec.template.spec.containers[0].image}'

# Fix:
# ✅ Update to match cluster version
```

**Symptom 2: Slow DNS Resolution**

```bash
# DNS queries taking too long
```

**Diagnosis:**

```bash
# Time DNS queries
time kubectl exec -it <pod> -- nslookup google.com

# Check CoreDNS resource usage
kubectl top pods -n kube-system -l k8s-app=kube-dns

# Check CoreDNS logs for errors
kubectl logs -n kube-system -l k8s-app=kube-dns | grep -i error
```

**Fixes:**

```bash
# ✅ Scale up CoreDNS replicas
kubectl scale deployment coredns -n kube-system --replicas=3

# ✅ Increase CoreDNS resources
kubectl edit deployment coredns -n kube-system
# Increase memory/CPU limits

# ✅ Check upstream DNS (for external queries)
kubectl get configmap coredns -n kube-system -o yaml
# Verify forward directive
```

---

### 10. Metrics Server: The Accountant

**Real-world analogy:** Electricity meter

- Measures how much power you use
- Helps you monitor usage
- Needed for billing/budgeting

**What it does:**

```bash
Every 15 seconds:
1. Ask kubelet: "How much CPU/RAM is each pod using?"
2. kubelet checks with container runtime
3. Metrics Server aggregates data
4. Makes available via API

You run: kubectl top pods
         kubectl top nodes

Data comes from Metrics Server!
```

**Why you need it:**

```bash
# Without Metrics Server:
kubectl top nodes
error: Metrics API not available

# With Metrics Server:
kubectl top nodes
NAME                CPU   MEMORY
node-1             45%   62%
node-2             15%   28%

kubectl top pods -n production
NAME           CPU    MEMORY
api-pod-1      500m   1800Mi
api-pod-2      320m   1200Mi
```

**Critical for:**

- `kubectl top` commands
- HorizontalPodAutoscaler (autoscaling based on CPU/memory)
- Resource-based scheduling decisions
- Monitoring dashboards

**In AWS EKS:**

```bash
❌ Not included by default (you must install it)
✅ Lightweight (minimal resources)
✅ Essential for autoscaling
✅ Install with: kubectl apply -f metrics-server.yaml
```

#### Troubleshooting Metrics Server

**Symptom: kubectl top Doesn't Work**

```bash
Error: Metrics API not available
```

**Diagnosis:**

```bash
# Check if metrics-server is installed
kubectl get deployment metrics-server -n kube-system

# Check if it's running
kubectl get pods -n kube-system -l k8s-app=metrics-server

# Check logs
kubectl logs -n kube-system -l k8s-app=metrics-server
```

**Common Causes & Fixes:**

**1. Metrics Server Not Installed:**

```bash
kubectl get deployment metrics-server -n kube-system
# Error: not found

# Fix: Install metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

**2. Certificate Issues:**

```bash
kubectl logs -n kube-system -l k8s-app=metrics-server
# Error: x509: certificate signed by unknown authority

# Fix:
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

**3. Network Issues:**

```bash
# Metrics server can't reach kubelet

# Fix:
# ✅ Check security groups allow metrics-server to kubelet communication
# ✅ Verify kubelet port 10250 is accessible
```

---

### 11. Ingress Controller: The Receptionist

**Real-world analogy:** Hotel receptionist

- Guests arrive (external traffic)
- Check reservation (routing rules)
- Direct to correct room (correct service)

**Cost savings:**

```bash
Without Ingress:
- Need LoadBalancer for EACH service ($$)
- service-1: LoadBalancer ($16/month)
- service-2: LoadBalancer ($16/month)
- service-3: LoadBalancer ($16/month)
Total: $48/month

With Ingress:
- 1 LoadBalancer for ALL services
- Ingress Controller routes based on URL
- app1.example.com → service-1
- app2.example.com → service-2
- app3.example.com → service-3
Total: $16/month + controller cost

Saves money! 💰
```

**How it works:**

```bash
1. Traffic hits: api.example.com
2. DNS resolves to: LoadBalancer IP
3. LoadBalancer → Ingress Controller pod
4. Ingress Controller reads rules:

   apiVersion: networking.k8s.io/v1
   kind: Ingress
   spec:
     rules:
     - host: api.example.com
       http:
         paths:
         - path: /
           backend:
             service:
               name: api-service
               port: 80

5. Ingress Controller: "Route to api-service:80"
6. kube-proxy → actual pod
7. Response back to client
```

**Popular options:**

```bash
1. NGINX Ingress Controller ✅
   - Most popular
   - Feature-rich
   - Open source

2. AWS ALB Ingress Controller
   - Creates AWS Application Load Balancers
   - Native AWS integration
   - More expensive

3. Traefik
   - Modern, dynamic
   - Good for microservices

4. HAProxy
   - High performance
   - Enterprise features
```

**In AWS EKS:**

```bash
❌ Not included by default
✅ Install NGINX Ingress or AWS Load Balancer Controller
✅ Handles SSL/TLS termination
✅ Path-based routing
✅ Host-based routing
```

#### Troubleshooting Ingress Controller

**Symptom: Can't Access Application via Ingress**

```bash
Error: 404 Not Found or Connection Timeout
```

**Diagnosis:**

```bash
# Check ingress resource
kubectl get ingress -n <namespace>
kubectl describe ingress <ingress-name> -n <namespace>

# Check ingress controller pods
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx <ingress-controller-pod>

# Check if ingress has address
kubectl get ingress <ingress-name> -n <namespace>
# ADDRESS column should show LoadBalancer DNS/IP
```

**Common Causes & Fixes:**

**1. Ingress Controller Not Running:**

```bash
kubectl get pods -n ingress-nginx

# Fix:
# ✅ Install/reinstall ingress controller
helm install nginx-ingress ingress-nginx/ingress-nginx -n ingress-nginx
```

**2. No LoadBalancer Address:**

```bash
kubectl get ingress <ingress> -n <namespace>
# ADDRESS: <none>

# Fix:
# ✅ Wait (takes 2-5 minutes to provision)
# ✅ Check cloud-controller-manager logs
# ✅ Verify LoadBalancer service exists
kubectl get svc -n ingress-nginx
```

**3. Wrong Host in Ingress:**

```bash
kubectl get ingress <ingress> -n <namespace> -o yaml

# Fix:
# ✅ Verify host matches DNS name you're accessing
# ✅ Check DNS resolution
nslookup <your-domain>
```

**4. Backend Service Not Found:**

```bash
kubectl describe ingress <ingress> -n <namespace>
# Look for events: "Service not found"

# Fix:
# ✅ Verify service exists
kubectl get svc <service-name> -n <namespace>

# ✅ Fix service name in ingress spec
```

**5. Certificate/TLS Issues:**

```bash
kubectl describe ingress <ingress> | grep -A5 TLS

# Fix:
# ✅ Verify secret exists
kubectl get secret <tls-secret>

# ✅ Check certificate is valid
kubectl get secret <tls-secret> -o yaml
```

---

## PART 4: Cross-Component Troubleshooting

### Complete Diagnosis Flow: Pods Running But Not Accessible

```bash
# 1. Verify pod is running
kubectl get pods -n <namespace>
# STATUS should be Running

# 2. Check pod is Ready
kubectl get pods -n <namespace>
# READY should be 1/1 (or X/X for multi-container)

# 3. If not ready, check readiness probe
kubectl describe pod <pod> -n <namespace> | grep -A10 "Readiness"

# 4. Check service exists
kubectl get svc <service> -n <namespace>

# 5. Check service has endpoints
kubectl get endpoints <service> -n <namespace>
# Should show pod IPs

# 6. If no endpoints, check selector match
kubectl get svc <service> -n <namespace> -o yaml | grep -A5 selector
kubectl get pod <pod> -n <namespace> --show-labels

# 7. Test direct pod connectivity
kubectl exec -it <test-pod> -- curl http://<pod-ip>:<port>

# 8. Test service connectivity
kubectl exec -it <test-pod> -- curl http://<service>:<port>

# 9. Check DNS resolution
kubectl exec -it <test-pod> -- nslookup <service>

# 10. Check kube-proxy
kubectl logs -n kube-system -l k8s-app=kube-proxy | grep -i error

# 11. Check network policies
kubectl get networkpolicies -n <namespace>
```

### High Resource Usage / OOMKilled Pods

**Diagnosis:**

```bash
# 1. Check pod status
kubectl get pods -n <namespace>
# Look for: OOMKilled, CrashLoopBackOff

# 2. Check pod events
kubectl describe pod <pod> -n <namespace> | grep -A10 "Events"
# Look for: "OOMKilled", "Exceeded memory limit"

# 3. Check resource limits
kubectl describe pod <pod> -n <namespace> | grep -A10 "Limits:"

# 4. Check actual usage
kubectl top pod <pod> -n <namespace>

# 5. Check node resources
kubectl top node
kubectl describe node <node> | grep -A5 "Allocated resources"
```

**Fixes:**

```yaml
# Increase memory limits
spec:
  containers:
  - name: app
    resources:
      requests:
        memory: "256Mi"
        cpu: "250m"
      limits:
        memory: "1Gi"     # Increase this
        cpu: "500m"

# Or optimize application to use less memory
```

### Persistent Volume Issues

**Diagnosis:**

```bash
# 1. Check PVC status
kubectl get pvc -n <namespace>
# STATUS should be Bound

# 2. If Pending, check events
kubectl describe pvc <pvc> -n <namespace>

# 3. Check if PV exists
kubectl get pv

# 4. Check storage class
kubectl get storageclass
kubectl describe storageclass <class-name>

# 5. Check pod using PVC
kubectl describe pod <pod> | grep -A10 "Volumes:"
```

**Common Causes:**

```bash
1. No matching PV:
# ✅ Create PV or use dynamic provisioning
# ✅ Check StorageClass exists

2. PV already bound to another PVC:
# ✅ Create new PV
# ✅ Or delete old PVC

3. Node can't attach volume (EBS):
# ✅ Check node has IAM permission to attach volumes
# ✅ Check EBS volume exists in AWS
# ✅ Check EBS volume is in same AZ as node

4. Volume mount failures:
# ✅ Check volume exists
# ✅ Check mount path doesn't conflict
# ✅ Check permissions
```

---

## Emergency Debugging Commands

### Quick Health Check

```bash
# Cluster overview
kubectl get nodes
kubectl get pods --all-namespaces | grep -v Running | grep -v Completed

# Component health
kubectl get pods -n kube-system
kubectl get componentstatuses  # Deprecated but useful

# Resource usage
kubectl top nodes
kubectl top pods --all-namespaces --sort-by=memory | head -20

# Recent errors
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | grep -i error | head -20
```

### Detailed Component Logs

```bash
# Control plane (in self-managed K8s)
kubectl logs -n kube-system kube-apiserver-<node>
kubectl logs -n kube-system kube-scheduler-<node>
kubectl logs -n kube-system kube-controller-manager-<node>

# Node components
kubectl logs -n kube-system -l k8s-app=kube-proxy
kubectl logs -n kube-system -l k8s-app=kube-dns

# On the node itself
sudo journalctl -u kubelet -f
sudo journalctl -u containerd -f
```

### Network Debugging

```bash
# Create debug pod with network tools
kubectl run netdebug --rm -it --image=nicolaka/netshoot -- bash

# Inside the pod:
ping <service-name>
nslookup <service-name>
curl http://<service-name>
traceroute <service-name>
nc -zv <service-name> <port>
```

---

## Troubleshooting Decision Tree

```bash
Issue: "My application isn't working"
    ↓
Is the pod running?
├─ No → Check: kubectl describe pod
│         ├─ Pending → Check scheduler (resources, taints, node selectors)
│         ├─ ImagePullBackOff → Check image name, pull secrets, registry
│         ├─ CrashLoopBackOff → Check logs: kubectl logs --previous
│         └─ Error → Check events: kubectl describe pod
│
└─ Yes → Is the pod Ready?
          ├─ No → Check readiness probe
          │         └─ Fix application health endpoint
          │
          └─ Yes → Can you access the pod directly?
                    ├─ No → Check kubelet, container runtime
                    │
                    └─ Yes → Can you access via service?
                              ├─ No → Check kube-proxy, endpoints, selectors
                              │
                              └─ Yes → Can you access via ingress?
                                        ├─ No → Check ingress controller, DNS
                                        │
                                        └─ Yes → Problem is elsewhere
                                                  (DNS, firewall, app logic)
```

---

## Summary - All Components at a Glance

### Control Plane (Managed by AWS in EKS)

| Component | Job | Analogy |
|-----------|-----|---------|
| kube-apiserver | Main entry point, handles all requests | Front desk |
| etcd | Database storing cluster state | Medical records |
| kube-scheduler | Decides which node runs each pod | Matchmaker |
| kube-controller-manager | Maintains desired state | Thermostat |
| cloud-controller-manager | Talks to AWS | Embassy |

### Worker Node (Runs on EC2)

| Component | Job | Analogy |
|-----------|-----|---------|
| kubelet | Runs containers on node | Building superintendent |
| kube-proxy | Routes network traffic | Traffic cop |
| Container Runtime | Actually runs containers | Car engine |

### Add-ons (Optional but Common)

| Component | Job | Typical in EKS |
|-----------|-----|----------------|
| CoreDNS | DNS resolution | ✅ Yes (can be managed) |
| Metrics Server | Resource monitoring | ❌ Manual install |
| Ingress Controller | HTTP/HTTPS routing | ❌ Manual install |

---

## What's Managed in EKS vs Self-Managed

### AWS EKS Manages (You Don't See):

```bash
✅ kube-apiserver (control plane)
✅ etcd (database)
✅ kube-scheduler
✅ kube-controller-manager
✅ cloud-controller-manager

Benefits:
- High availability (multi-AZ)
- Auto-patched
- Auto-backed up
- Monitored 24/7
- You just use it via kubectl

Cost: $0.10/hour per cluster ($73/month)
```

### You Manage:

```bash
⚠️  Worker nodes (EC2 instances)
⚠️  kubelet (on each node)
⚠️  kube-proxy (on each node)
⚠️  Container runtime (containerd)
⚠️  Add-ons (CoreDNS, metrics-server, ingress)

But EKS makes it easier:
- Managed node groups (AWS handles patching)
- Fargate (serverless, AWS manages nodes)
- EKS add-ons (optional managed CoreDNS, kube-proxy)
```

---

## Lessons Learned from Production

### Lesson 1: Always Check Component Versions

I once had a cluster where kube-proxy was 3 versions behind the control plane. Services randomly failed because the old kube-proxy didn't understand new service features.

**Fix:**

```bash
# Check all component versions
kubectl get nodes -o wide  # Shows kubelet version
kubectl get ds kube-proxy -n kube-system -o yaml | grep image:
kubectl get deploy coredns -n kube-system -o yaml | grep image:

# Update to match control plane version
```

### Lesson 2: Metrics Server is Essential

I deployed an autoscaling setup without metrics-server installed. The HorizontalPodAutoscaler couldn't get CPU metrics and never scaled.

**Always install metrics-server first!**

### Lesson 3: etcd Backups Save Lives

A team lost their entire cluster configuration when etcd corrupted. They had to recreate everything from scratch - deployments, services, secrets.

**In EKS:** AWS handles this automatically
**Self-managed:** Use `etcdctl snapshot save` regularly

### Lesson 4: Systematic Troubleshooting Saves Time

When things break, resist the urge to randomly restart pods. Follow the decision tree:
1. Is the pod running?
2. Is it ready?
3. Can you access it directly?
4. Does the service have endpoints?
5. Does DNS resolve?

This systematic approach finds root causes faster than guessing.

---

## Conclusion

Kubernetes architecture may seem complex, but each component has a clear job:

- **Control plane** = The brain (makes decisions)
- **Worker nodes** = The hands (does the work)
- **Add-ons** = The tools (makes life easier)

Understanding these components helps you:
- **Debug faster** (know which component is failing)
- **Design better** (know what's possible and what's not)
- **Optimize costs** (know what you're paying for)
- **Pass certifications** (CKA/CKAD require this knowledge)
- **Sleep better** (fewer 3 AM incidents)

**When something breaks:**
1. Identify which component is involved
2. Check component-specific symptoms
3. Follow systematic troubleshooting steps
4. Fix root cause, not symptoms

In AWS EKS, you get the best of both worlds:
- AWS manages the complex parts (control plane, etcd)
- You control your applications (worker nodes, pods)
- Optional managed add-ons (CoreDNS, kube-proxy)



source: notes from my KodeKloud watched videos && and some googling 
