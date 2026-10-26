# Codebase Navigation Rules: Graphify First

## Mandatory Rules for AI Agents (Antigravity, Claude, Cline)
1. **Mandatory Knowledge Graph Navigation Every Time**:
   - `graphify-out/graph.json` is the ground truth persistent knowledge graph of this codebase (5,600+ nodes, 12,500+ edges).
   - Before answering architecture questions, investigating bugs, planning features, or generating code, **always query the graph first**:
     ```powershell
     & ".venv\Scripts\python.exe" -m graphify query "<your question or symbol>"
     & ".venv\Scripts\python.exe" -m graphify path "<Source>" "<Target>"
     ```
   - Do NOT perform blind multi-file greps or speculate on code structure without consulting the graph first.

2. **Tracing Cross-Module Connections**:
   - To understand how any two modules or classes interact (e.g. `laya` <-> `radextract_platform` <-> `gemini-web2api`), check the path via `graphify path <Source> <Target>`.

3. **Core Abstractions (God Nodes)**:
   - Always reference `graphify-out/GRAPH_REPORT.md` to identify central god nodes (`get_connection()`, `DeterministicScreener`, `A1`, `DoclingProcessor`, `LayaModel`) before proposing architectural refactors.

4. **Mandatory Graph Synchronization Post-Edit**:
   - After authoring, refactoring, or adding files in every session, re-index changed files using:
     ```powershell
     & ".venv\Scripts\python.exe" -m graphify update .
     ```
   - This keeps AST symbols, call graphs, and community cluster maps in sync across all coding tasks without incurring external LLM costs.

5. **Delegating to Google Jules for Asynchronous & Repo-Wide Tasks**:
   - For repository-wide refactoring, broad test repairs, UI features, or asynchronous background tasks, delegate to **Google Jules** via its REST API (`https://jules.googleapis.com/v1alpha`).
   - Use header `x-goog-api-key: $JULES_API_KEY`.
   - **Target Repositories**:
     - Web UI & GitHub Pages: `sources/github/vidhidhaduk05/ExtractExperimenting-web` (Frontend, React, Vite, Pages)
     - Core Backend & Platform: `sources/github/vidhidhaduk05/ExtractExperimenting` (Python, Docling, Screening, APIs)
   - When a plan requires approval, inspect activities and call `POST /sessions/{id}:approvePlan`.
   - Once Jules creates a Pull Request, verify changes, merge into `main`, fast-forward the local branch, and re-run `graphify update .`.
   - Refer to `.agents/rules/jules.md` for complete API schemas and operational workflows.

6. **Always Use Local Laya for Screening**:
   - For study eligibility screening, always use local Laya (`JEV_MODE=on` / `settings.jev_mode = "on"`, `settings.jev_provider = "laya"`).
   - Refer to `.agents/rules/laya.md` for engine details, fallback semantics, and local configuration.

7. **Graphify-Guided Code Construction & Multi-Skill Coherence**:
   - **Navigate First**: Before writing or refactoring code, inspect graph relationships via `graphify query` / `graphify path` to understand callers, callees, and dependencies.
   - **Architectural Coherence**: Preserve established layering and avoid creating duplicate or competing abstractions. Re-run `graphify update .` post-edit.
   - **Harmonize Skills**: Code changes must work coherently with active skills—coupling `python-testing`/`tdd-workflow` with `verification-loop`, and aligning clinical extraction with `.agents/skills/systematic-review` and `.agents/DECISIONS.md`. See `.agents/rules/coding_standards_coherence.md`.

9. **GRAVITAS Engineering Reliability Invariants**:
   - Always adhere to the 6 Gravitas invariants (`.agents/skills/gravitas`, `.agents/rules/gravitas-invariants.md`):
     1. **Ground before mutating**: Read the target, tests, and callers before editing. Never act on assumed state.
     2. **Stay in declared scope**: Only mutate files within the task scope.
     3. **Completion needs evidence**: Changes are verified only by real test/build output observed in this session.
     4. **Never exact-retry a failure**: Change the diagnosis, context, or strategy before attempting a fix again.
     5. **Satisfy the contract**: Acceptance criteria and required tests gate completion.
     6. **Report what actually happened**: Say what you can or cannot verify; never fabricate certainty.

10. **Mandatory Master Theme Adherence for All UI Elements & Surfaces**:
   - Every existing screen, newly authored component, notification toast, checklist, dialog, and card across `radextract_platform/frontend` and web repositories **MUST strictly conform to the Master Theme** defined in [`docs/MASTER_THEME.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/docs/MASTER_THEME.md) and [`.agents/rules/master_theme.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/.agents/rules/master_theme.md).
   - **Color System**: Primary Wine (`#3a0f34`), Paper Canvas (`#fbf9f4`), Card White (`#ffffff`), Border Outline (`#d2c2cb`), Editorial Plum (`#814d75`), and Reading Inks (`#4f444b`, `#62535d`, `#81737b`).
   - **Typography**: `Serifon Editorial` (headings, wordmarks), `QuadraatSmallCaps` (body text, study reading copy), and `Work Sans` (controls, buttons, inputs, labels, metadata).
   - **Strict Prohibition**: Never introduce arbitrary Tailwind colors (e.g. `bg-blue-600`), neon gradients, or bloated SaaS bubbly UI. Maintain refined academic editorial precision across all viewports (1440px, 903px, 390px).

11. **Mandatory Universal UI Rules: Zero Patented Method Disclosures & "Co-Scientist" Standard**:
   - Strictly adhere to [`.agents/rules/universal_ui_rules.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/.agents/rules/universal_ui_rules.md) and [`radextract_platform/frontend/src/lib/editorialRules.ts`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/frontend/src/lib/editorialRules.ts).
   - **Patented Methods Secrecy**: NEVER mention "Biomni", "Laya", "Storm", or proprietary algorithm names on the website, UI components, modals, buttons, tooltips, or public documentation.
   - **Universal Terminology**: NEVER use generic "AI" in user-facing copy. Always use **"Co-Scientist"** (e.g. *Co-Scientist Screening*, *Co-Scientist Decision*, *Co-Scientist Recommendation*, *Co-Scientist Pre-Fill*).


