---
layout: post
title: "When Let's Encrypt Broke Our HL7 mTLS: A Certificate Incident Post-Mortem"
description: "A public CA silently dropped the clientAuth EKU from renewed certificates, breaking our healthcare HL7 mTLS integration. Here's what happened, what we learned, and why self-managed CAs are the right choice for healthcare interoperability."
tags: devops sre security certificates tls healthcare hl7 mirth ansible infrastructure incident
date: 2026-03-10
---

You don't expect a routine certificate renewal to take down a healthcare integration. But that's exactly what happened when Let's Encrypt dropped the `clientAuth` Extended Key Usage (EKU) from our renewed certificates as part of an industry-wide policy shift. Messages stopped flowing. No alerts fired. The automation that was supposed to keep things running is what broke them.

This post walks through the full incident, the root cause, and the seven lessons we took away from it. No customer names, but the architecture and mistakes are real.

If you're using **any** public CA for mTLS today, pay attention — this isn't a Let's Encrypt-specific problem. Every major public CA is on a timeline to drop `clientAuth` by mid-2026.

---

## The Setup

Our stack uses [Mirth Connect](https://www.nextgen.com/products-and-services/integration-engine) as an HL7 integration engine, handling healthcare messages over TCP/MLLP (Minimal Lower Layer Protocol). The connection to the remote health system uses **mutual TLS (mTLS)** — both sides present certificates and verify each other's identity.

Here's what the architecture looked like before the incident:

```
┌──────────────────────┐          mTLS (TCP/MLLP)          ┌──────────────────────┐
│    Mirth Connect     │◄────────────────────────────────►  │   Remote HL7 System  │
│   (HL7 TCP Sender)   │         Port 18032                │   (Epic / Gateway)   │
│                      │                                    │                      │
│  Cert: Let's Encrypt │                                    │  Cert: Enterprise CA │
│  EKU: serverAuth +   │                                    │  Trust: Our CA root  │
│       clientAuth     │                                    │                      │
└──────────────────────┘                                    └──────────────────────┘
```

The key detail: our Mirth server's TLS certificate was issued by **Let's Encrypt** via an automated ACME renewal process managed by Ansible. This had been working fine for months. The certificate carried both `serverAuth` and `clientAuth` in its Extended Key Usage — which is what the remote system required to establish the mTLS handshake.

An Ansible playbook ran daily via cron to check certificate expiry and renew when needed. Clean, automated, hands-off. Until it wasn't.

---

## What Happened

### The Industry Shift Behind Our Outage

On **February 11, 2026**, Let's Encrypt changed the default behavior of their "classic" ACME profile: certificates issued after this date **no longer include the `clientAuth` EKU**. Our automated renewal ran, got a fresh certificate, and everything looked fine — valid cert, correct CN/SAN, proper chain. Except it was missing `id-kp-clientAuth`, and our mTLS partner rejected the handshake.

For the vast majority of Let's Encrypt users, this change is completely invisible. Web browsers and HTTPS clients only care about `serverAuth`. But for mTLS, where the server certificate is also used to authenticate as a *client* to the remote peer, `clientAuth` is mandatory.

### Why Is This Happening Across the Entire Industry?

This wasn't a Let's Encrypt quirk. It's a coordinated, industry-wide policy change driven by **Google's Chrome Root Program Policy v1.6**, which mandates that certificate hierarchies included in Chrome's trust store must be **dedicated solely to TLS server authentication** by June 2026.

The rationale:
- **Security risk reduction** — Multipurpose certificates (with both `serverAuth` and `clientAuth`) could be misused. A compromised server cert shouldn't also grant client authentication capabilities.
- **Certificate purpose specificity** — Public CAs should assert exactly what they're vouching for. Server identity and client identity are fundamentally different trust models.
- **Browsers don't need it** — No major browser checks `clientAuth` on a website's certificate. Including it was a legacy behavior, not a requirement.

Google's Chrome Root Program gave CAs a deadline, and every major public CA is complying:

| CA | Default Removal | Complete Removal |
|----|-----------------|------------------|
| **Let's Encrypt** | Feb 11, 2026 | May 13, 2026 |
| **Sectigo** | Sep 15, 2025 | May 15, 2026 |
| **DigiCert** | Oct 1, 2025 | May 1, 2026 |
| **SSL.com** | Sep 15, 2025 | — |
| **Google Trust Services** | Nov 10, 2025 | Apr 13, 2026 |

Let's Encrypt did provide a temporary migration path — a `tlsclient` ACME profile that still includes `clientAuth` — but it will be **retired on May 13, 2026**. After that date, no Let's Encrypt certificate will carry `clientAuth`, period. And after **June 15, 2026**, Chrome will reject any public SSL certificate that still contains `clientAuth`.

This is worth emphasizing: **this is not something you can opt out of.** If you're using any public CA for mTLS client authentication, you are on a countdown.

### Why HL7 mTLS Is Especially Vulnerable

HL7 v2.x has **no built-in security** — the standard explicitly states that information security is outside its scope. Messages are sent in plaintext by default over MLLP with no authentication or encryption. mTLS was bolted on as the transport-layer fix: authenticate both parties before any HL7 message exchange.

The problem is that many healthcare integration teams (including us) used the same public CA certificate for both the server-side and client-side of the TLS connection. This worked fine when public CAs included both EKUs. Now it doesn't.

The [HL7 FHIR security specification](https://hl7.org/fhir/security.html) explicitly lists `mutual-authenticated-TLS` as a valid client authentication method. But FHIR doesn't prescribe *how* you manage the certificates — and using a public CA for the client side was always a shortcut, not a best practice.

### The Incident Timeline

1. Automated renewal runs on schedule, obtains a new certificate from Let's Encrypt
2. New cert is issued under the updated "classic" profile — no `clientAuth` EKU
3. Ansible imports the new cert into Mirth's SSL Manager (no errors, cert is valid)
4. Mirth attempts to send HL7 messages to the remote system
5. Remote system rejects the TLS handshake — our cert lacks `clientAuth`
6. **HL7 messages stop flowing**

No monitoring caught this. Our certificate monitoring checked for expiry, not for EKU contents. The cert was valid, not expired, and had the right CN/SAN — it just lacked one critical extension.

---

## The Fix

The emergency fix was straightforward in concept but had several gotchas in execution:

1. **Generate a self-signed CA** (root key pair) for each environment (UAT and Prod)
2. **Issue leaf certificates** signed by our own CA, with explicit `serverAuth` + `clientAuth` EKUs and correct SAN
3. **Import the `.p12` bundles** into Mirth's SSL Manager
4. **Coordinate with the remote system** to add our new CA root to their trust stores
5. **Disable the Let's Encrypt cron** to prevent re-breaking on the next renewal

The permanent fix replaced the Let's Encrypt ACME automation with a self-signed CA workflow, where the CA keys live in AWS SSM Parameter Store and leaf certificates are generated and renewed by Ansible.

---

## Seven Lessons from the Incident

### 1. Public CAs Are Dropping clientAuth — This Is Industry-Wide

This is the core lesson. Let's Encrypt dropped `clientAuth` from their default ACME profile on February 11, 2026, as part of compliance with Google's Chrome Root Program Policy v1.6. Every major public CA is on the same timeline, with complete removal by mid-2026.

This wasn't a surprise if you were watching the CA/Browser Forum, but it was invisible if you were just relying on automated renewals. The [Let's Encrypt announcement](https://letsencrypt.org/2025/05/14/ending-tls-client-authentication) was clear, but how many ops teams are subscribed to CA policy updates?

**The rule:** Never rely on a public CA for `clientAuth` certificates used in mTLS scenarios. Public CAs are aligned to browser TLS. Healthcare HL7 mTLS needs self-managed CAs where you control the EKU.

If you're using Let's Encrypt or any other public CA for mTLS, audit your certs right now:

```bash
openssl x509 -in your-cert.crt -noout -text | grep -A5 "Extended Key Usage"
```

If you see only `TLS Web Server Authentication` and no `TLS Web Client Authentication`, your mTLS setup is one renewal away from breaking.

### 2. SAN Must Match the Environment

During the emergency fix, the first UAT leaf cert was accidentally generated with a **production** SAN (`hl7tls.prod.example.com`) because the `openssl` command's `-extfile` was copy-pasted from the prod cert generation.

Modern TLS clients **do not check CN** (Common Name). They exclusively validate the **Subject Alternative Name (SAN)**. A cert with `CN=hl7tls.uat.example.com` but `SAN=hl7tls.prod.example.com` will fail validation on UAT.

Always verify after generation:

```bash
openssl x509 -in cert.crt -noout -text | grep -A2 "Subject Alternative"
```

This should be a non-negotiable step in any cert generation runbook.

### 3. Multiple Trust Stores Require Individual Attention

The remote system in this case had **two separate** ingestion points:

| System | Protocol | Port | Trust Store |
|--------|----------|------|-------------|
| HL7 Engine | TCP/MLLP | 18032 | Separate JKS/PKCS12 |
| API Gateway | HTTPS | 2005 | Separate trust config |

Adding our CA root to one trust store didn't fix the other. Each system maintains its own certificate trust independently.

**The lesson:** When coordinating cert trust changes with a remote party, always ask: *"Which specific systems and ports are affected?"* and confirm each one individually. Don't assume that "we added your CA" means all paths are covered.

### 4. Mirth's SSL Manager Replaces the Entire Store

This one bit us during the fix. Mirth Connect's SSL Manager API (`POST /api/extensions/ssl/all`) performs a **full replacement** of both identity certificates and trusted CA certificates. It doesn't merge — it wipes and replaces.

This means:
- Any CA cert added manually through the Mirth UI gets **blown away** on the next Ansible run
- The Ansible variable `pki_trust_pem_list` (in `mirth/defaults/main.yml`) is the **single source of truth**
- If a new outbound CA needs to be trusted, it must be added to `pki_trust_pem_list`, not just the UI

If you're managing Mirth certificates with automation, treat the automation config as authoritative. Manual UI changes are temporary.

### 5. Disabling Cron Doesn't Eliminate All Trigger Points

Our immediate response was to disable the daily renewal cron job. Problem solved, right? Not quite.

There were **two entry points** that triggered certificate operations:

1. **`play-renew-mirth-certificate.yml`** — the daily cron job (disabled)
2. **`roles/mirth/tasks/ssl.yml`** — called by `play-mirth-server.yml` on every fresh instance launch via cloud-init

If a Mirth EC2 instance had been replaced during the incident (auto-scaling event, instance failure, version upgrade), the cloud-init bootstrap would have run the full server playbook, which would have called Let's Encrypt ACME again and generated another cert without `clientAuth`.

**The lesson:** When disabling an automated process during an incident, trace **all** code paths that invoke it. Cron is usually the obvious one, but boot scripts, CI/CD pipelines, and infrastructure-as-code provisioning are all potential triggers.

### 6. Certificate Alias vs Filename in PKCS12

During manual recovery, someone renamed the `.p12` file thinking that would change the certificate alias visible in Mirth's SSL Manager. It didn't.

The Mirth SSL Manager alias is determined by the **`-name` flag** in the `openssl pkcs12` command, not the filename:

```bash
# The alias is "hl7-letsencrypt", regardless of what you name the .p12 file
openssl pkcs12 -export \
  -in cert.crt \
  -inkey cert.key \
  -out whatever-filename-you-want.p12 \
  -name "hl7-letsencrypt"    # <-- THIS sets the alias
```

Mirth channels reference certificates by alias. If the alias doesn't match what the channel expects, the channel won't find the cert — even if the `.p12` file is correctly imported.

Document this in your runbooks. It's a common point of confusion during incident response when people are under pressure.

### 7. Self-Signed CAs Are Appropriate for Healthcare mTLS

There's sometimes an instinct to use a "real" CA for everything, because self-signed feels less professional or less secure. For healthcare HL7 mTLS, the opposite is true.

A self-signed CA gives you:
- **Full control over EKUs** — you decide what goes in the certificate
- **Control over validity periods** — 10-year CA certs, 1-year leaf certs, whatever your policy requires
- **Control over CN and SAN** — no domain validation restrictions
- **No dependency on external infrastructure** — no ACME challenges, no DNS verification, no rate limits
- **Simplicity** — a two-level hierarchy (root CA + leaf cert, no intermediate) is perfectly adequate

The trade-off is that you need to distribute your CA root to every party that needs to trust your certificates. In healthcare integrations, you're already doing this coordination anyway — exchanging trust materials is a standard part of onboarding.

The final architecture:

```
┌──────────────────────────────────────────────────────────────────┐
│                    Self-Signed CA (per environment)               │
│                                                                  │
│  Root CA Key    → AWS SSM Parameter Store (SecureString)         │
│  Root CA Cert   → AWS SSM Parameter Store                       │
│  Validity       → 10 years                                       │
│                                                                  │
│         ┌───────────────────┐                                    │
│         │    Leaf Cert      │                                    │
│         │  EKU: serverAuth  │                                    │
│         │     + clientAuth  │                                    │
│         │  Validity: 1 year │                                    │
│         │  Auto-renewed by  │                                    │
│         │  Ansible          │                                    │
│         └───────────────────┘                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## What We Changed

### Automation Updates

The permanent fix required changes across both Ansible and Terraform:

**New Ansible task: `renew_outbound_cert.yml`**
- Pulls the CA key and cert from SSM Parameter Store
- Generates a new leaf private key (PKCS#8 format for Mirth compatibility)
- Creates a CSR with correct CN, SAN, and EKUs (`serverAuth` + `clientAuth`)
- Signs the leaf cert with the CA (1-year validity)
- Assembles the certificate chain (leaf + CA)
- Persists the new key and chain back to SSM
- Cleans up the CA private key from the temp filesystem in an `always` block

**Toggle variable: `mirth_outbound_cert_provider`**
- Defaults to `acme` (preserving existing behavior for all other stacks)
- Set to `self_signed_ca` for the affected stack via group vars
- Both `ssl.yml` (full deploy path) and `play-renew-mirth-certificate.yml` (cron path) are conditional on this toggle

**Terraform IAM update:**
- Added `pki/ca/private/*` to the SSM `GetParameter` policy so the Mirth EC2 instance can read the CA private key during renewal

### What We Did Not Change

Equally important: the existing `acme_certificate` role was left **completely untouched**. It's still used by nginx-based stacks and other Mirth deployments that don't use mTLS. The toggle variable ensures the change is scoped to only the affected stacks.

---

## Detection Gaps and Monitoring Improvements

The fact that this incident wasn't caught by monitoring is arguably the most important failure. Here's what we added:

1. **EKU validation in cert monitoring** — Don't just check expiry. Check that the certificate contains the expected EKU extensions. A cert that's valid for 90 more days but lacks `clientAuth` is just as broken as an expired one.

2. **Post-renewal verification** — After any certificate renewal (automated or manual), verify the full certificate chain including EKUs, SAN, and chain trust before deploying it to the application.

3. **HL7 message flow monitoring** — Monitor the actual message throughput, not just the cert. If messages stop flowing, alert regardless of what the certificate looks like.

```bash
# Quick EKU check you can add to any cert monitoring script
if ! openssl x509 -in /etc/pki/tls/certs/hl7-letsencrypt.crt -noout -text \
     | grep -q "TLS Web Client Authentication"; then
    echo "CRITICAL: Certificate missing clientAuth EKU"
    exit 2
fi
```

---

## Action Items If You're Affected

If you're running mTLS with certificates from any public CA, here's your timeline:

1. **Now:** Audit all systems using public CA certificates for mTLS/client authentication
   ```bash
   # Check every cert in your infrastructure
   openssl x509 -in your-cert.crt -noout -text | grep -A5 "Extended Key Usage"
   ```
2. **Before May 13, 2026:** Migrate client authentication to a private CA. Let's Encrypt's temporary `tlsclient` ACME profile expires on this date.
3. **Before June 15, 2026:** Ensure no production systems depend on public CA certificates with `clientAuth` EKU — Chrome will reject them after this date.

For private CA options, consider: self-managed OpenSSL CA (what we did), [AWS Private CA](https://aws.amazon.com/private-ca/), [HashiCorp Vault PKI](https://developer.hashicorp.com/vault/docs/secrets/pki), or [EJBCA](https://www.ejbca.org/). For healthcare specifically, a simple two-level hierarchy (root + leaf) managed by Ansible/Terraform is often the right level of complexity.

---

## Key Takeaways

If you're running healthcare integrations over mTLS, here's the summary:

- **Don't use public CAs for mTLS client certificates.** They optimize for browser TLS and are actively removing `clientAuth` across the board by mid-2026.
- **Self-signed CAs are not a compromise** — they're the correct architecture for point-to-point mTLS in healthcare. The [FHIR security spec](https://hl7.org/fhir/security.html) lists mTLS as a valid authentication method, but it doesn't require a public CA.
- **Monitor certificate content, not just expiry.** EKU, SAN, chain length, and issuer are all things that can change on renewal.
- **Trace all code paths** that touch certificates. Cron jobs, boot scripts, deploy playbooks — any of them can reintroduce a bad cert.
- **Document the non-obvious.** PKCS12 alias semantics, trust store boundaries, SAN vs CN behavior — these are the things that trip people up during 2 AM incident response.
- **HIPAA doesn't mandate a specific CA type.** It requires "technical safeguards" for PHI access control and encryption in transit (TLS 1.2+). A private CA satisfies these requirements just as well as — arguably better than — a public CA for point-to-point integrations.

The incident cost us several hours of downtime and a lot of cross-team coordination. The permanent fix — a self-managed CA with automated renewal — is actually simpler and more reliable than what we had before. Sometimes the "less sophisticated" approach is the right one.

---

## Further Reading

- [Let's Encrypt: Ending TLS Client Authentication Certificate Support in 2026](https://letsencrypt.org/2025/05/14/ending-tls-client-authentication)
- [Google Chrome Root Program Policy](https://googlechrome.github.io/chromerootprogram/)
- [HL7 FHIR Security Specification](https://hl7.org/fhir/security.html)
- [The End of clientAuth EKU — F5 DevCentral](https://community.f5.com/kb/technicalarticles/the-end-of-clientauth-eku%E2%80%A6oh-mercy%E2%80%A6what-to-do/344363)
- [DigiCert: Sunsetting Client Authentication EKU](https://knowledge.digicert.com/alerts/sunsetting-client-authentication-eku-from-digicert-public-tls-certificates)
- [Sectigo: TLS Client Authentication Changes 2026](https://www.sectigo.com/blog/tls-client-authentication-public-ca-end-2026)
