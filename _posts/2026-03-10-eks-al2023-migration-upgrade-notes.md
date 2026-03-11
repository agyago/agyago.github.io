---
layout: post
title: "EKS AL2023 Migration + Upgrade to 1.34 — Lessons Learned"
date: 2026-03-10
description: Lessons learned from upgrading EKS clusters from 1.32 to 1.34 with AL2023 migration, including the reasoning behind VPC-CNI version pinning at v1.19.2 and add-on compatibility assessment
tags: aws eks kubernetes devops sre upgrade vpc-cni
---

# EKS AL2023 Migration + Upgrade to 1.34 — Lessons Learned

These are my notes from planning and executing an EKS upgrade across multiple environments — going from EKS 1.32 to 1.34 while simultaneously migrating worker nodes from Amazon Linux 2 to AL2023.

---

## Why Upgrade at All?

The clusters were running EKS 1.32 with add-ons that were significantly behind — kube-proxy was at v1.29.3 (three minor versions behind the control plane, a critical skew violation), vpc-cni was at v1.9.1, and the cluster-autoscaler was at 1.30.0.

EKS versions reach end of standard support, and running outdated add-ons increases the risk of subtle incompatibilities. The longer you wait, the more breaking changes pile up between your current state and where you need to be, making the jump harder.

The goal: get to EKS 1.34 on AL2023 with all add-ons at compatible versions, in a controlled, environment-by-environment rollout with spacing between each environment.

---

## Why AL2023 at the Same Time?

Amazon Linux 2 is approaching end of life. AL2023 is the replacement, and EKS-optimized AL2023 AMIs are the path forward.

The catch: AL2023 uses `nodeadm` for node bootstrapping instead of the old `/etc/eks/bootstrap.sh` script. If you're using an older EKS Terraform module (like v17), the generated user data calls `bootstrap.sh`, which does not exist on AL2023 AMIs. This means you need a custom `nodeadm-userdata.tpl` template that uses the same variables the module already provides (`cluster_name`, `endpoint`, `cluster_auth_base64`, `kubelet_extra_args`, etc.) but calls `nodeadm init` instead.

Since node replacement was already required for the vpc-cni iptables change (more on that below), bundling the AL2023 migration into the same node replacement avoids doing it twice.

---

## The Upgrade Path

The upgrade follows a strict sequence:

1. **Terraform changes** — AL2023 AMI data sources via SSM parameters, nodeadm user data template, clean up any ARM instance types mistakenly placed in x86 worker groups
2. **Add-on upgrades on 1.32** — kube-proxy, vpc-cni, coredns, cluster-autoscaler all brought to 1.32-compatible versions
3. **Node replacement** — pick up AL2023 OS and clean iptables rules in a single replacement
4. **Control plane upgrade to 1.33** — add-ons and cluster-autoscaler updated to match
5. **Control plane upgrade to 1.34** — add-ons and cluster-autoscaler updated to match, nodes replaced again for 1.34 kubelet

Nodes are not replaced between the 1.32-to-1.33 control plane upgrade because Kubernetes skew policy allows worker nodes to be one minor version behind the control plane. They are replaced after the final 1.34 upgrade to pick up the 1.34 kubelet and AMI.

---

## VPC-CNI: Why v1.19.2 and Not Latest

This is the most important decision in the entire upgrade. The vpc-cni went from v1.9.1 to v1.19.2-eksbuild.1 — a jump of 10 minor versions — but we deliberately did **not** go to the latest available (v1.21.1).

### Breaking Changes Assessed Between v1.9.1 and v1.21.1

| Change | Version | Risk Level | Notes |
|---|---|---|---|
| IPv6 mode | v1.10 | Low | Only matters if you use IPv6 |
| Bare metal prefix delegation | v1.11 | Low | Only matters if you run bare metal instances |
| CRI socket removal | v1.12 | Low | Only matters if you have custom CRI socket tooling |
| **iptables-wrapper backend change** | **v1.13.2** | **High** | **Existing nodes carry old iptables-legacy rules. Node replacement required to get clean rules** |
| New nodeagent container | v1.14 | Low | Relevant if you use NetworkPolicies or port 8080 conflicts |
| CNINode CRD | v1.15 | Low | Only matters if you use Security Groups for Pods |
| CNI spec 1.0.0 | v1.16 | Low | Only matters if you have custom CNI chaining |
| Subnet discovery default change | v1.18 | Medium | Check if you have `kubernetes.io/role/cni` tagged subnets |
| AWS SDK v2 migration | v1.19 | Low | Matters if you have custom proxy or credential chain config |
| Plugin removal | v1.20 | Medium | Multus users affected, unnecessary architectural change to absorb otherwise |
| Network Policy bug | v1.21.0 | **High** | Known bug in this version |

### Why Stop at v1.19.2?

v1.19.2 is a stable, mature version that sits past all the major architectural changes (iptables-wrapper, nodeagent, CNINode CRD, AWS SDK v2) without picking up the v1.20+ plugin removal changes or the v1.21.0 bug risk.

### The v1.21.1 Risk

There is a known issue ([GitHub #3584](https://github.com/aws/amazon-vpc-cni-k8s/issues/3584)) specifically affecting EKS 1.33 where VPC CNI v1.21.1-eksbuild.3 can cause pods to get stuck in `ContainerCreating`. If your architecture has workloads split between Fargate and EC2 (e.g., CI/CD agents on Fargate, controllers on EC2), any networking disruption between them can break your pipelines. Pinning to v1.19.2 avoids this entirely.

**VPC-CNI should stay at v1.19.2 until the v1.21.x line stabilizes or a newer version is confirmed safe for your cluster topology.**

---

## The iptables-Wrapper Change (v1.13.2)

This deserves its own section because it directly drives the node replacement strategy.

VPC-CNI v1.13.2 changed the iptables backend. Existing nodes running the old vpc-cni have iptables-legacy rules baked in. After upgrading the vpc-cni DaemonSet, the new pods on old nodes work (the wrapper handles both), but you carry forward stale iptables-legacy rules.

Replacing nodes after the vpc-cni upgrade gives you clean nodes with only the new iptables-wrapper rules — no legacy cruft. This is why you should do the vpc-cni upgrade first, then replace nodes, rather than upgrading the control plane and vpc-cni simultaneously.

---

## kube-proxy: Fixing a Critical Skew Violation

kube-proxy was at v1.29.3 on a 1.32 control plane — three minor versions behind. Kubernetes officially supports kube-proxy being at most one minor version behind the control plane. Running three versions behind means you're in unsupported skew territory where subtle networking bugs can appear.

Always upgrade kube-proxy to match the cluster version.

---

## CoreDNS: A Safe Minor Bump

CoreDNS went from v1.11.1-eksbuild.9 to v1.11.4-eksbuild.28. Same v1.11.x line, just patch-level updates. Very low risk.

---

## Cluster-Autoscaler: Match the Cluster Version

The cluster-autoscaler version policy is that each minor release is tested against the corresponding Kubernetes minor version. The tolerance is approximately plus or minus two minor versions, but the further you drift, the more likely you hit subtle scaling issues.

Upgrade it at each control plane version bump to stay matched. If your cluster-autoscaler runs on Fargate, its PodDisruptionBudget won't block node drains. If it runs on EC2, it can block drains if there's no spare capacity — another reason to always scale up before draining.

---

## Node Replacement Strategy

Nodes are replaced using a production-safe approach: scale the ASG up by one first, wait for the new node to join and become Ready, then drain and terminate old nodes one at a time. Stateful workloads (like a Jenkins controller) should always be drained last.

This prevents PodDisruptionBudget deadlocks. When you drain a node, pods with PDBs (like ebs-csi-controller or cluster-autoscaler) can only be evicted if their replacement can schedule elsewhere. Adding a new node first guarantees that capacity exists.

Total node replacements per environment: **two**.
1. After AL2023 Terraform changes + all add-on upgrades — picks up new OS and clean iptables rules
2. After the final 1.34 control plane upgrade — picks up v1.34 kubelet and latest AMI

Not replaced between 1.32 and 1.33 because Kubernetes skew policy allows nodes to be one minor version behind.

---

## Helm Release Compatibility for 1.33/1.34

EKS 1.33 and 1.34 have no major API group removals. All the big breaking changes (PodSecurityPolicy, v1beta1 Ingress, etc.) were removed before Kubernetes 1.25. If your Helm charts already run on 1.32, they will almost certainly continue working on 1.33 and 1.34 without modifications.

The only Helm release that **must** be upgraded in lockstep is cluster-autoscaler. Common charts like aws-load-balancer-controller, aws-ebs-csi-driver, ingress-nginx, kube-prometheus-stack, and metrics-server all use stable APIs and are safe through 1.34.

---

## K8s 1.33/1.34 API Changes Worth Knowing

### Removed in 1.33
- `gitRepo` volume type (disabled by default)
- `status.nodeInfo.kubeProxyVersion` field

### Removed in 1.34
- No API removals

### Deprecated (still works, future removal)
- **Endpoints API (v1)** — deprecated in 1.33, replaced by EndpointSlices. Does not affect workloads that don't create Endpoints objects directly
- **containerd 1.7** — deprecated in 1.34, unsupported from 1.36+. AL2023 ships containerd 1.7.x, safe for now but worth tracking

**Bottom line: no Helm charts break from API removals in 1.33 or 1.34.**

---

## Key Takeaways

1. **VPC-CNI is the riskiest add-on to upgrade** — it controls pod networking. Pin to a known-stable version (v1.19.2) rather than chasing latest. The v1.21.1 GitHub issue (#3584) causing pods to stick in ContainerCreating on EKS 1.33 validates this caution.

2. **Bundle node replacements** — if you're already replacing nodes for one reason (AL2023 migration), stack other changes that need node replacement (iptables cleanup) into the same cycle.

3. **Always add capacity before draining** — scale ASG +1, wait for the new node, then drain old ones. PDB deadlocks are real and will block your drain indefinitely if there's nowhere for evicted pods to go.

4. **Kubernetes skew policy is your friend** — nodes can be one minor version behind the control plane. Use this to avoid unnecessary node replacements between consecutive control plane upgrades.

5. **Check API removals before upgrading** — for 1.33/1.34 there are none that matter, but this won't always be the case. The big removals already happened before 1.25.

6. **Upgrade add-ons before the control plane** — bring kube-proxy, vpc-cni, coredns to versions compatible with your current cluster version first. Then upgrade the control plane. This isolates failures — if an add-on upgrade breaks something, you haven't also changed the control plane at the same time.

7. **Space out environments** — upgrade lower environments first and wait before touching the next one. A week between environments gives enough time to catch issues in production-like conditions.
