# Future Plans for Security

Created: 2026-10-26  
Status: Future planning and ongoing security backlog. No audit or implementation has been performed by creating this document.

## Purpose

Collect security requirements, observations, logs, and checklist items supplied by the user over time. Preserve their source and date, then assess applicability and prioritize them during a future security audit.

This document does not authorize code changes, production testing, configuration changes, or deployment. A checklist is a starting point and does not replace a professional penetration test.

## How to maintain this plan

- Append future contributions with the date, source, affected feature if known, and supporting evidence.
- Keep user-supplied concerns separate from independently verified findings.
- Do not label an item a confirmed vulnerability without evidence.
- Track each item as: Not assessed, Applicable, Not applicable with rationale, Planned, In progress, Verified, or Deferred with rationale.
- Record the owner, implementation scope, acceptance criteria, and observed verification results when work is authorized.
- Do not store passwords, API keys, session tokens, personal information, or other sensitive raw log content here. Use redacted evidence and references.
- Keep historical requirements when refining them; explain duplicates or superseding decisions.

## Contribution 1 — User-supplied 20-point pre-launch checklist

Received: 2026-10-26  
Source: Checklist supplied by the user, attributed to Michael's video. The video and its wording have not been independently verified.  
Initial status of every item: **Not assessed**.

| ID | User-supplied requirement | Future audit scope |
| --- | --- | --- |
| SEC-001 | Add HSTS | Assess HTTPS enforcement and HSTS headers at the actual serving layer for frontend and API domains. |
| SEC-002 | Add CSRF tokens | Assess cross-site request forgery defenses for forms and state-changing requests against the application's actual authentication model. |
| SEC-003 | Reset sessions on password change | Check whether password changes invalidate existing sessions and refresh credentials as required. |
| SEC-004 | Expire reset links | Check that password-reset tokens are time-limited, single-use, and invalidated after successful use. |
| SEC-005 | Prevent user enumeration | Review login and password-reset responses for disclosure of account existence. |
| SEC-006 | Whitelist upload types | Review explicit upload allowlists, actual file-content validation, and rejection of unsupported files. |
| SEC-007 | Verify payment webhooks | If payments exist, assess server-side provider signature verification and handling of replayed or duplicate events. |
| SEC-008 | Set prices server-side | If payments exist, ensure authoritative prices and payable amounts are determined and validated server-side. |
| SEC-009 | Block prompt injection | Assess untrusted inputs, uploaded documents, retrieved content, model instructions, tool permissions, and output handling. Treat the checklist's “sanitize inputs” wording as an audit starting point, not proof that prompt injection can be eliminated by sanitization. |
| SEC-010 | Cap AI usage | Review rate limits, quotas, concurrency limits, and cost budgets for AI operations. |
| SEC-011 | Limit request size | Review payload and upload limits at the application and serving layers, including resource-intensive processing. |
| SEC-012 | Rate limit password resets | Review reset-request throttling and abuse handling. |
| SEC-013 | Sanitize before storing | Review input validation and safe persistence. Assess injection defenses and context-appropriate output handling without blindly modifying legitimate research text. |
| SEC-014 | Lock down CORS | Review allowed origins and credential behavior against the actual deployment. |
| SEC-015 | Disable directory listing | Check production static/file-serving configuration and unintended file exposure. |
| SEC-016 | Remove default admin routes | Inventory administrative endpoints. Assess whether unused default routes should be removed; remaining admin functions require authorization regardless of route name. Renaming alone is not a security control. |
| SEC-017 | Lock accounts after failed logins | Assess temporary lockouts or equivalent throttling after repeated failures, including the risk of attackers locking out legitimate users. |
| SEC-018 | Log security events | Review login successes/failures, password changes, privileged actions, and useful audit records while preventing secret leakage. |
| SEC-019 | Set secure cookie flags | For cookies actually used, assess HttpOnly, Secure, SameSite, scope, and expiry according to their purpose. |
| SEC-020 | Restrict database permissions | Assess least privilege for application storage access. Adapt checks to the deployed database backend; do not assume a particular database-user model. |

## Future audit evidence template

For each assessed item record:

- **Item ID and status:**
- **Affected repository, revision, environment, and feature:**
- **Expected security property:**
- **Observed behavior and redacted evidence:**
- **Applicability and risk assessment:**
- **Proposed remediation and dependencies:**
- **Required authorization or operational precautions:**
- **Acceptance criteria and verification results:**
- **Remaining limitations:**

## Future contributions

Append additional user-supplied security requirements and redacted logs here. No further contributions recorded yet.
