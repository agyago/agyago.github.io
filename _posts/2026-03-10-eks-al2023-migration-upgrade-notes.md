---
layout: post
title: "EKS AL2023 Migration + Upgrade to 1.34 — Why We Upgrade, What We Pin, and What Breaks"
date: 2026-03-10
description: Notes on upgrading EKS clusters from 1.32 to 1.34 with AL2023 migration, including the reasoning behind VPC-CNI version pinning at v1.19.2 and a full add-on compatibility assessment
tags: aws eks kubernetes devops sre upgrade vpc-cni
---

# EKS AL2023 Migration + Upgrade to 1.34

These are my notes from planning and executing an EKS upgrade across three environments (dev, admin, aqa) — going from EKS 1.32 to 1.34 while simultaneously migrating worker nodes from Amazon Linux 2 to AL2023.

---

## Why Upgrade at All?

The clusters were running EKS 1.32 with add-ons that were significantly behind — kube-proxy was at v1.29.3 (three minor versions behind the control plane, a critical skew violation), vpc-cni was at v1.9.1, and the cluster-autoscaler was at 1.30.0.

EKS versions reach end of standard support, and running outdated add-ons increases the risk of subtle incompatibilities. The longer you wait, the more breaking changes pile up between your current state and where you need to be, making the jump harder.

The goal: get to EKS 1.34 on AL2023 with all add-ons at compatible versions, in a controlled, environment-by-environment rollout with one week between each environment.

---

## Why AL2023 at the Same Time?

Amazon Linux 2 is approaching end of life. AL2023 is the replacement, and EKS-optimized AL2023 AMIs are the path forward.

The catch: AL2023 uses `nodeadm` for node bootstrapping instead of the old `/etc/eks/bootstrap.sh` script. The EKS Terraform module (v17) generates user data that calls `bootstrap.sh`, which does not exist on AL2023 AMIs. This means you need a custom `nodeadm-userdata.tpl` template that uses the same variables the module already provides (`cluster_name`, `endpoint`, `cluster_auth_base64`, `kubelet_extra_args`, etc.) but calls `nodeadm init` instead.

Since node replacement was already required for the vpc-cni iptables change (more on that below), bundling the AL2023 migration into the same node replacement avoids doing it twice.

---

## The Upgrade Path

The upgrade follows a strict sequence:

1. **Terraform changes** — AL2023 AMI data sources, nodeadm user data template, remove ARM instance types from x86 worker groups
2. **Add-on upgrades on 1.32** — kube-proxy, vpc-cni, coredns, cluster-autoscaler all brought to 1.32-compatible versions
3. **Node replacement** — pick up AL2023 OS and clean iptables rules in a single replacement
4. **Control plane upgrade to 1.33** — add-ons and cluster-autoscaler updated to match
5. **Control plane upgrade to 1.34** — add-ons and cluster-autoscaler updated to match, nodes replaced again for 1.34 kubelet

Nodes are not replaced between the 1.32-to-1.33 control plane upgrade because Kubernetes skew policy allows worker nodes to be one minor version behind the control plane. They are replaced after the final 1.34 upgrade to pick up the 1.34 kubelet and AMI.

---

## VPC-CNI: Why v1.19.2 and Not Latest

This is the most important decision in the entire upgrade. The vpc-cni went from v1.9.1 to v1.19.2-eksbuild.1 — a jump of 10 minor versions — but we deliberately did **not** go to the latest available (v1.21.1).

### Breaking Changes Assessed Between v1.9.1 and v1.21.1

| Change | Version | Applies to Us? | Reasoning |
|---|---|---|---|
| IPv6 mode | v1.10 | No | We use IPv4 |
| Bare metal prefix delegation | v1.11 | No | No bare metal instances |
| CRI socket removal | v1.12 | No | We use containerd, no CRI socket tooling |
| **iptables-wrapper backend change** | **v1.13.2** | **Yes** | **Existing nodes have old iptables-legacy rules. Node replacement required to get clean iptables-wrapper rules** |
| New nodeagent container | v1.14 | No | We don't use NetworkPolicies, port 8080 not conflicting |
| CNINode CRD | v1.15 | No | We don't use Security Groups for Pods |
| CNI spec 1.0.0 | v1.16 | No | No custom CNI chaining |
| Subnet discovery default change | v1.18 | No | No `kubernetes.io/role/cni` tagged subnets |
| AWS SDK v2 migration | v1.19 | No | No custom proxy, no credential chain customization |
| Plugin removal | v1.20 | No | We don't use Multus, but this is an unnecessary architectural change to absorb |
| Network Policy bug | v1.21.0 | No | We don't use NetworkPolicies, but this is a known-bad version |

### Why Stop at v1.19.2?

v1.19.2 is a stable, mature version that sits past all the major architectural changes (iptables-wrapper, nodeagent, CNINode CRD, AWS SDK v2) without picking up the v1.20+ plugin removal changes or the v1.21.0 bug risk.

### The v1.21.1 Risk

There is a known issue ([GitHub #3584](https://github.com/aws/amazon-vpc-cni-k8s/issues/3584)) specifically affecting EKS 1.33 where VPC CNI v1.21.1-eksbuild.3 can cause pods to get stuck in `ContainerCreating`. Since our setup has Jenkins agents on Fargate and the controller on EC2, any networking disruption between them breaks CI/CD pipelines. Pinning to v1.19.2 avoids this entirely.

**VPC-CNI will stay at v1.19.2 until the v1.21.x line stabilizes or a newer version is confirmed safe for our cluster topology.**

---

## The iptables-Wrapper Change (v1.13.2)

This deserves its own section because it directly drives the node replacement strategy.

VPC-CNI v1.13.2 changed the iptables backend. Existing nodes running the old vpc-cni have iptables-legacy rules baked in. After upgrading the vpc-cni DaemonSet, the new pods on old nodes work (the wrapper handles both), but you carry forward stale iptables-legacy rules.

Replacing nodes after the vpc-cni upgrade gives you clean AL2023 nodes with only the new iptables-wrapper rules — no legacy cruft. This is why we do the vpc-cni upgrade first (Step 2), then replace nodes (Step 2e), rather than upgrading the control plane and vpc-cni simultaneously.

---

## kube-proxy: Fixing a Critical Skew Violation

kube-proxy was at v1.29.3-eksbuild.2 on a 1.32 control plane — three minor versions behind. Kubernetes officially supports kube-proxy being at most one minor version behind the control plane. Running three versions behind means you're in unsupported skew territory where subtle networking bugs can appear.

Upgrading to v1.32.11-eksbuild.2 brings it back in line with the control plane version.

---

## CoreDNS: A Safe Minor Bump

CoreDNS went from v1.11.1-eksbuild.9 to v1.11.4-eksbuild.28. Same v1.11.x line, just patch-level updates. Very low risk.

---

## Cluster-Autoscaler: Match the Cluster Version

The cluster-autoscaler version policy is that each minor release is tested against the corresponding Kubernetes minor version. The tolerance is approximately plus or minus two minor versions, but the further you drift, the more likely you hit subtle scaling issues.

We went from 1.30.0 to 1.32.0, then 1.33.0, then 1.34.0 — upgrading at each control plane version bump to stay matched.

One environment-specific detail: on us-admin and us-aqa, the cluster-autoscaler runs on Fargate (not EC2), so its PodDisruptionBudget won't block node drains. On us-dev it runs on EC2, so it can block drains if there's no spare capacity — which is why we always scale the ASG up by one node before starting drains.

---

## Node Replacement Strategy

Nodes are replaced using a production-safe approach: scale the ASG up by one first, wait for the new AL2023 node to join and become Ready, then drain and terminate old nodes one at a time. The Jenkins node is always drained last.

This prevents PodDisruptionBudget deadlocks. When you drain a node, pods with PDBs (like ebs-csi-controller or cluster-autoscaler) can only be evicted if their replacement can schedule elsewhere. Adding a new node first guarantees that capacity exists.

Total node replacements per environment: **two**.
1. After AL2023 Terraform changes + all add-on upgrades to 1.32-compatible — picks up AL2023 OS and clean iptables rules
2. After the final 1.34 control plane upgrade — picks up v1.34 kubelet and 1.34 AL2023 AMI

Not replaced between 1.32 and 1.33 because Kubernetes skew policy allows nodes to be one minor version behind.

---

## Helm Release Compatibility

EKS 1.33 and 1.34 have no major API group removals. All the big breaking changes (PodSecurityPolicy, v1beta1 Ingress, etc.) were removed before Kubernetes 1.25. Since everything already runs on 1.32, most Helm charts continue working without changes.

The only Helm release that **must** be upgraded is cluster-autoscaler (to match the cluster version). Everything else — Jenkins, aws-load-balancer-controller, aws-for-fluent-bit, aws-ebs-csi-driver, ingress-nginx, kube-prometheus-stack, metrics-server, velero — uses stable APIs and is safe through 1.34.

Two releases (external-dns and opcache) are already broken with ImagePullBackOff on 1.32 and are unaffected by the upgrade.

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

## Environment-Specific Differences

The upgrade steps are identical across all three environments with a few exceptions:

| Difference | us-dev | us-admin | us-aqa |
|---|---|---|---|
| Cluster name | `lumeon-eks` | `admin-eks` | `lumeon-eks-ci` |
| Terraform path | `us-dev/eks` | `us-admin/eks` | `us-aqa/eks` |
| variables.tf fix (1.31 to 1.32) | No | Yes (was manually upgraded) | No |
| ARM instance type removal from spot-1 | Yes | Yes | No (already x86-only) |
| Cluster-autoscaler on Fargate | No (EC2 node) | Yes | Yes |

The rollout schedule spaces environments one week apart: us-dev first, then us-admin, then us-aqa. This gives time to catch issues in lower environments before touching higher ones.

---

## Key Takeaways

1. **VPC-CNI is the riskiest add-on to upgrade** — it controls pod networking. Pin to a known-stable version (v1.19.2) rather than chasing latest. The v1.21.1 GitHub issue (#3584) causing pods to stick in ContainerCreating on EKS 1.33 validates this caution.

2. **Bundle node replacements** — if you're already replacing nodes for one reason (AL2023 migration), stack other changes that need node replacement (iptables cleanup) into the same cycle.

3. **Always add capacity before draining** — scale ASG +1, wait for the new node, then drain old ones. PDB deadlocks are real and will block your drain indefinitely if there's nowhere for evicted pods to go.

4. **Kubernetes skew policy is your friend** — nodes can be one minor version behind the control plane. Use this to avoid unnecessary node replacements between consecutive control plane upgrades.

5. **Check API removals before upgrading** — for 1.33/1.34 there are none that matter, but this won't always be the case. The big removals already happened before 1.25.
