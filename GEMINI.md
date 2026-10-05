# Codebase Navigation Rules: Graphify First

## Mandatory Rules for AI Agents (Antigravity, Claude, Cline)
1. **Always Use Knowledge Graph for Code Navigation**:
   - `graphify-out/graph.json` is the ground truth persistent knowledge graph of this codebase (2,600+ nodes, 4,700+ edges).
   - Whenever asked about architecture, dependencies, data flow, function callers, or file relationships, **query `graphify-out/graph.json` or `graphify query` FIRST** instead of blind multi-file grepping.

2. **Tracing Cross-Module Connections**:
   - To understand how any two modules or classes interact (e.g. `radextract_platform` <-> `gemini-web2api`), check the path in `graphify-out/graph.json` or use `graphify path <Source> <Target>`.

3. **Core Abstractions (God Nodes)**:
   - Always reference `graphify-out/GRAPH_REPORT.md` to identify central god nodes (`get_connection()`, `DeterministicScreener`, `A1`, `DoclingProcessor`) before proposing architectural refactors.

4. **Keep Graph Updated**:
   - When modifying code or adding new features, re-index changed files using `python -m graphify --update` (or `graphify update .`) so the knowledge graph remains synchronized.

5. **Delegating to Google Jules for Asynchronous & Repo-Wide Tasks**:
   - For repository-wide refactoring, broad test repairs, UI features, or asynchronous background tasks, delegate to **Google Jules** via its REST API (`https://jules.googleapis.com/v1alpha`).
   - Use header `x-goog-api-key: $JULES_API_KEY`.
   - **Target Repositories**:
     - Web UI & GitHub Pages: `sources/github/vidhidhaduk05/ExtractExperimenting-web` (Frontend, React, Vite, Pages)
     - Core Backend & Platform: `sources/github/vidhidhaduk05/ExtractExperimenting` (Python, Docling, Screening, APIs)
   - When a plan requires approval, inspect activities and call `POST /sessions/{id}:approvePlan`.
   - Once Jules creates a Pull Request, verify changes, merge into `main`, fast-forward the local branch, and re-run `graphify update .`.
   - Refer to `.agents/rules/jules.md` for complete API schemas and operational workflows.
