---
trigger: always_on
description: Mandatory auto-proceed rule for all execution steps, plans, and questions.
---

# Auto-Proceed & Autonomous Execution Rule

## Policy
1. **Always Auto-Proceed**:
   - The agent MUST automatically proceed with recommended decisions, execution steps, tool runs, and implementation tasks.
   - Do NOT interrupt the user with interactive modal questions (`ask_question`), interactive confirmation gates, or execution pauses.
2. **Autonomous Resolution**:
   - If an engineering or implementation choice arises between options, select the primary/recommended approach, execute it, verify with real tests/builds, and present the verified outcome.
3. **Continuous Forward Momentum**:
   - Proceed through multi-step workflows end-to-end without waiting for manual confirmation at intermediate checkpoints.
