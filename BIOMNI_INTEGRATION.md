# Biomni-R0 32B Model Integration Reference

## 1. Local Server Details
- **Node**: `hsc-hpc-g-002` (WVU CTSI HPC)
- **GPU**: NVIDIA Tesla V100S-PCIE-32GB
- **Model**: `mradermacher/Biomni-R0-32B-Preview-GGUF` (Q4_K_M, 19 GB)
- **Process PID**: `4097181` (`llama-server`)
- **Direct Port**: `http://127.0.0.1:18000/v1`
- **Proxy Port**: `http://127.0.0.1:18003/v1`
- **Active Cloudflare Tunnel**: `https://prize-burton-generate-routines.trycloudflare.com/v1`
- **Biomni Gradio UI**: [https://ctsi-hpc.hsc.wvu.edu/rnode/hsc-hpc-g-002/7860/](https://ctsi-hpc.hsc.wvu.edu/rnode/hsc-hpc-g-002/7860/)

## 2. API Credentials & Parameters
- **API Key**: `sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e`
- **Master Key**: `9f9c0f3b7265d167ab5c69b5e00dbf1e49316cb53cab894b7e52a5fbb28571ac`
- **Model Identifier**: `biomni-r0`
- **Chat Endpoint**: `http://127.0.0.1:18000/v1/chat/completions`
- **Models Endpoint**: `http://127.0.0.1:18000/v1/models`

## 3. Configuration in Software (`/home/vd00026/Desktop/Software`)
- `radextract_platform/backend/.env`: Configured with `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and `RADEXTRACT_*` equivalents.
- `radextract_platform/backend/config.py`: Default fallbacks updated to Biomni-R0.
- `radextract_platform/backend/data/llm_config.json`: Persisted runtime config for the settings UI.
- `dev-start.py`: Auto-detects port 18000 and injects Biomni environment variables into the backend.
- `radextract_platform/frontend/src/components/layout/AppLayout.tsx`: Defaults UI local provider to `http://127.0.0.1:18000/v1` and `biomni-r0`.

## 4. Verification
- **Tool Calling**: Tested `extract_variables` tool via `ToolCallingClient` — successfully returns structured arguments with verbatim quotes.
- **Latency**: Sub-70ms prompt evaluation on Tesla V100S GPU.
- **Unit Tests**: `test_settings.py` passing 14/14.
