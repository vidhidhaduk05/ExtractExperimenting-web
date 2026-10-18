# Laya (System-1 Decision Engine) Screening Rules

## Overview
Laya (`receptron/laya`) is a local, non-autoregressive "System 1" decision engine based on ModernBERT-large. It provides rapid, zero-latency, local title/abstract and full-text screening against PICO eligibility criteria with zero API key dependencies.

## Mandatory Rules for AI Agents
1. **Always Use Laya for Screening**:
   - For study eligibility screening (title/abstract and full text), always use the local Laya screening engine (`jev_mode = "on"`, `jev_provider = "laya"`).
   - The local engine runs via [`laya/laya_engine.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/laya/laya_engine.py) integrated through [`radextract_platform/backend/services/jev_client.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/jev_client.py) and [`radextract_platform/backend/services/jev_screener.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/jev_screener.py).

2. **Configuration**:
   - `jev_mode = "on"`
   - `jev_provider = "laya"` (local ONNX, zero external API calls or keys required)
   - Model weights are located in [`laya/models/`](file:///d:/Desktop/Rad%20Extract%20Experimenting/laya/models).

3. **Fallback & Circuit Breaker Behavior**:
   - If local Laya is unavailable or errors out, the pipeline is designed to gracefully fall back to the standard LLM screening path rather than failing the run. Do not bypass or disable this fallback mechanism.
