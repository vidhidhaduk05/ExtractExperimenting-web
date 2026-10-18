---
trigger: always_on
description: Mandatory rules for code generation, architectural coherence, graphify navigation, and skill synergy.
---

# Code Engineering & Multi-Skill Coherence Rules

## 1. Graphify-Driven Code Structure & Navigation
- **Pre-Implementation Mapping**: Before authoring or refactoring components, inspect existing nodes, god nodes, and call paths using `graphify query` / `graphify path` (or MCP graph tools). Never create duplicate abstractions or parallel data flows where architectural conduits already exist.
- **Architectural Coherence**: Maintain strict separation across established layers (`radextract_core`, `radextract_platform/backend`, `radextract_platform/frontend`, etc.).
- **Graph Synchronization**: Whenever new modules, services, or structural changes are made, run `graphify update .` to keep `graphify-out/graph.json` synchronized.

## 2. Local Laya & Systematic Screening Coherence
- **Mandatory Screener**: Use local Laya (`JEV_MODE=on` / `settings.jev_mode = "on"`, `settings.jev_provider = "laya"`) across study eligibility screening tasks.
- **Contract Adherence**: Any screening code additions or modifications must conform to the PICO criteria schema and handle the fallback semantics defined in [`radextract_platform/backend/services/jev_client.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/jev_client.py).

## 3. Skill Synergies & Workflow Alignment
- **TDD & Verification Loop**: Combine `python-testing` / `tdd-workflow` with `verification-loop`. Write or update unit/integration tests before claiming completion.
- **Systematic Review Domain Alignment**: Integrate research and extraction pipelines cleanly with the domain rules in `.agents/skills/systematic-review` and logged protocol specifications in `.agents/DECISIONS.md`.
- **Autonomous Delegation**: For large-scale multi-file refactors or repo-wide test repairs, delegate to Google Jules following `.agents/rules/jules.md`.

## 4. Irrelevant Skills Exclusion & Scope Discipline
- **Strictly Ignored Domains**: This codebase is a Python/FastAPI backend, React/Vite web application, and systematic literature review platform. Never invoke, suggest, or load skills related to unrelated ecosystems, specifically:
  - Mobile/Native stacks: `android-*`, `compose-multiplatform-*`, `dart-flutter-*`, `flutter-*`, `ios-*`, `swift-*`, `swiftui-*`
  - Unrelated backends: `csharp-*`, `dotnet-*`, `fsharp-*`, `quarkus-*`, `laravel-*`, `perl-*`
  - Unrelated hardware/domain tools: `cisco-*`, `homelab-*`, `blender-*`
