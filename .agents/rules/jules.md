---
trigger: always_on
description: Protocol and rules for delegating repository tasks, bugfixes, and refactors to Google Jules.
---

# Google Jules Autonomous Agent Rules

## Purpose
Google Jules is an autonomous coding agent capable of deep codebase analysis, multi-file refactoring, automated testing, and creating pull requests directly on the repository. AI agents in this project should utilize Jules for heavy, multi-file, or asynchronous tasks.

## 1. When to Delegate to Jules
- **Multi-file test suite repairs and bug hunting**: Complex regression or test suite breakages spanning backend and frontend.
- **Large-scale refactoring**: Structural improvements across modules (e.g., `radextract_core`, `radextract_platform`, `gemini-web2api`).
- **Asynchronous PR creation**: Tasks that need autonomous execution, validation, and a clean GitHub Pull Request without occupying the interactive agent session.
- **Do NOT use Jules for**: Simple 1-2 line edits, local debugging of immediate tool outputs, or read-only Q&A.

## 2. Jules API Protocol
- **Base Endpoint**: `https://jules.googleapis.com/v1alpha`
- **Repository Source Identifiers**:
  - **Web Frontend & GitHub Pages**: `sources/github/vidhidhaduk05/ExtractExperimenting-web`
  - **Core Platform & Backend**: `sources/github/vidhidhaduk05/ExtractExperimenting`

### Key REST Methods
| Operation | Method & URI | Body / Notes |
| :--- | :--- | :--- |
| **List Sources** | `GET /sources` | Validates connected repos and access permissions |
| **List Sessions** | `GET /sessions` | Checks active / recent session states |
| **Get Session** | `GET /sessions/{sessionId}` | Inspects status: `IN_PROGRESS`, `AWAITING_PLAN_APPROVAL`, `COMPLETED` |
| **List Activities** | `GET /sessions/{sessionId}/activities` | Returns thought steps, suggested plans, and git patches |
| **Create Session** | `POST /sessions` | Initializes an autonomous task (see payload schema below) |
| **Approve Plan** | `POST /sessions/{sessionId}:approvePlan` | `{}` — unblocks sessions in `AWAITING_PLAN_APPROVAL` |
| **Send Message** | `POST /sessions/{sessionId}:sendMessage` | `{"prompt": "..."}` — guides or continues an active session |

### Session Creation Payload
```json
{
  "prompt": "Clear, explicit instructions detailing the problem, failing test files, expected behavior, and constraints.",
  "sourceContext": {
    "source": "sources/github/vidhidhaduk05/ExtractExperimenting",
    "githubRepoContext": {
      "startingBranch": "main"
    }
  },
  "requirePlanApproval": false,
  "automationMode": "AUTO_CREATE_PR"
}
```

## 3. Post-Jules Merge Workflow
When Jules completes a session:
1. Verify the generated PR or branch (`git fetch origin`, inspect `git log origin/fix/...`).
2. Merge the PR or branch into `main` (either via GitHub CLI `gh pr merge --auto --merge` or git fast-forward).
3. Update local `main`: `git checkout main && git pull origin main`.
4. Run `graphify update .` to keep the codebase knowledge graph synchronized with all changes Jules introduced.
