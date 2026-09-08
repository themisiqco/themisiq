# Security Policy

## Reporting a vulnerability

Email **security@themisiq.co**.

Please include enough detail to reproduce the issue: the URL or endpoint, what
you did, what happened, and what you expected. If the finding involves customer
data, tell us what you saw but please do not download, retain or share it.

Do not open a public GitHub issue for a security report.

## What to expect

| | |
|---|---|
| **Acknowledgement** | Within 24 hours of your report |
| **Assessment** | We tell you whether we can reproduce it, and our view of its severity |
| **Progress** | We keep you updated while we work on a fix |
| **Resolution** | We confirm when the fix is deployed |

The 24-hour acknowledgement is the commitment published on
[themisiq.co/security](https://www.themisiq.co/security). It is an
acknowledgement, not a fix time — we do not publish a remediation window, because
we do not yet have the record to support one.

## Scope

In scope: the ThemisIQ application at `www.themisiq.co`, its API routes, and this
repository.

Out of scope: the infrastructure operated by our providers — Supabase, Vercel,
GitHub and Stripe. Report issues in their platforms to them directly; we will
also act on anything they tell us that affects our customers.

## Good-faith research

We do not pursue legal action against researchers acting in good faith. Please
avoid anything that would degrade the service or reach data belonging to other
customers — testing against your own account is the way to stay in scope.

We have no bug bounty programme and offer no payment for reports.

## Disclosure

We ask that you give us a reasonable opportunity to fix an issue before
disclosing it publicly. We are happy to credit you when we do.
