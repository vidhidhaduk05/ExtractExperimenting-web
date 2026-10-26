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

## 5. Master Theme & UI Aesthetics Coherence
- **Strict Single Theme**: Every user interface surface, card, modal, notification toast, checklist, and data display must use the Master Theme defined in [`docs/MASTER_THEME.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/docs/MASTER_THEME.md) and [`.agents/rules/master_theme.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/.agents/rules/master_theme.md).
- **Brand Tokens**: Primary Wine (`#3a0f34`), Paper Canvas (`#fbf9f4`), Card White (`#ffffff`), Border (`#d2c2cb`), Editorial Plum (`#814d75`), and Reading Inks (`#4f444b`, `#62535d`).
- **Typography**: Headings use `Serifon Editorial`, body copy uses `QuadraatSmallCaps`, and controls/labels use `Work Sans`.
- **Zero Saturated Slop**: No ad-hoc generic Tailwind colors (`bg-blue-600`, `text-indigo-500`), no heavy gradients, and no generic rounded SaaS bubble designs.

