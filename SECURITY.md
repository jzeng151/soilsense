# Security Policy

**SoilSense** | NASA Space Apps Challenge 2026: *Field Shift: Adapting Farms with NASA Data*

SoilSense is a decision-support prototype built by a small volunteer team, not a commercial product. We still take security seriously, especially because the app accepts phone calls and field locations from farmers.

*Last updated: November 15, 2026*

---

## Supported Versions

| Version | Supported |
| :------ | :-------- |
| `main` branch and the currently deployed Cloudflare Worker | Yes |
| Older commits, forks, and unmerged branches | No |

There are no tagged releases. Fixes are made on `main` and redeployed.

---

## Reporting a Vulnerability

**Please do not open a public issue, pull request, or discussion for a security problem.**

Use GitHub private vulnerability reporting. Go to the repository's **Security** tab, choose **Report a vulnerability**, and fill in the form. Only the maintainers can see it.

### What to Include

- What you found and where (route, file, or feature)
- Steps to reproduce, or a proof of concept
- The impact you think it has
- Your name or handle if you would like credit (optional)

> **Note:** Please do not include real farmer data, real phone numbers, or leaked credentials in your report.

---

## What to Expect

We are a student and volunteer team, so these are good-faith targets, not guarantees.

| Step | Target |
| :--- | :----- |
| Acknowledge your report | Within 5 days |
| Initial assessment and severity | Within 10 days |
| Fix or mitigation for high-severity issues | Within 30 days |
| Public disclosure | After a fix is deployed, coordinated with you |

If we cannot reproduce or fix something, we will tell you why. With your permission, we will credit you in the fix commit or release notes.

---

## Scope

### In Scope

- The Cloudflare Worker and its routes: `/api/health`, `/api/field`, `/api/plan`, `/api/ask`, `/api/logs`, and `/voice/*`
- The React dashboard in `web/`
- Twilio webhook handling, including `X-Twilio-Signature` validation bypasses
- Authentication and authorization on `/api/logs` (`ADMIN_TOKEN`)
- Input validation flaws, such as bad coordinates, malformed bodies, or injection
- Prompt injection or data leakage through `/api/ask` (Workers AI)
- Leakage of secrets, phone numbers, or other personal data through logs, responses, the D1 cache, or repository history
- Vulnerable dependencies that are actually exploitable in this project

### Out of Scope

- Vulnerabilities in third-party services themselves: Cloudflare, Twilio, NASA POWER, NASA GIBS, USDA SSURGO, USDA CDL, USDA NASS, FCC Area API, USGS, and Zippopotam.us. Please report those to the provider.
- Volumetric denial-of-service or load testing against the live deployment
- Social engineering, phishing, or physical attacks against team members
- Findings that depend on `TWILIO_VALIDATE=false`, which is intended for local development only
- Missing security headers or best-practice suggestions with no demonstrated impact
- Agronomic or scientific accuracy of rotation plans. These are documented limitations, not security issues; see "Assumptions and limits" in the README.

---

## Data Handling

- **Accounts:** SoilSense has no user accounts and no passwords.
- **Inputs:** Field locations are used to fetch climate, soil, and crop-history data. Phone callers provide a ZIP code, crop, irrigation status, and priority.
- **Phone numbers:** Stored masked (for example, `***0123`) in plan and call logs.
- **Caching:** Upstream responses are cached in Cloudflare D1: NASA POWER for 30 days, soil for 90 days, and crop history for 180 days.
- **Secrets:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `NASS_API_KEY`, and `ADMIN_TOKEN` are stored as Cloudflare Worker secrets and are never committed. `.dev.vars.example` contains placeholders only.

---

## Security Measures in Place

- Every Twilio webhook is validated against `X-Twilio-Signature` using a constant-time comparison, on by default
- Request input is validated, and coordinates must fall within the contiguous US
- Basic per-instance rate limiting, with Cloudflare rate-limiting rules recommended for hard limits
- `/api/logs` can be protected with a Bearer `ADMIN_TOKEN`
- Upstream calls use timeouts and retries
- Structured logging with Workers observability enabled

---

## Leaked Credentials

If you spot an API key, token, or credential in the repository, its history, or a deployed response, report it privately right away. We will rotate it first and clean up afterward.

---

## Safe Harbor

We will not pursue or support legal action against anyone who makes a good-faith effort to follow this policy. Good faith means you:

- Test only against your own local copy, or make minimal requests to the live site
- Do not access, modify, or retain data that is not yours
- Do not degrade the service for others
- Give us reasonable time to fix the issue before disclosing it publicly

---

Thank you for helping keep SoilSense and the farmers who rely on it secure.
