#!/usr/bin/env python3
"""
Biomni-R0 High-Performance Port 18000 API Bridge.
Exposes an OpenAI-compatible API on 0.0.0.0:18000 backed by the local GPU Biomni instance in Ollama.
Provides /health, /v1/models, /v1/chat/completions (streaming + tool calling), and full CORS support.
"""

import os
import json
import logging
from typing import Any, Dict, Optional
import httpx
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("biomni-bridge")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

app = FastAPI(title="Biomni-R0 Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/health")
async def health():
    """Health check endpoint required by start scripts and verification checks."""
    return {"status": "ok", "service": "Biomni-R0 Bridge", "port": 18000, "ollama_target": OLLAMA_BASE_URL}


@app.get("/v1/models")
@app.get("/models")
async def list_models():
    """Returns OpenAI-compatible model list containing biomni-r0."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/v1/models")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])
                ids = {m.get("id") for m in models}
                # Ensure biomni-r0 is explicitly present
                if "biomni-r0" not in ids:
                    models.insert(0, {
                        "id": "biomni-r0",
                        "object": "model",
                        "created": 1792785451,
                        "owned_by": "biomni-hpc"
                    })
                return {"object": "list", "data": models}
    except Exception as e:
        logger.warning(f"Error fetching models from Ollama: {e}")

    # Fallback response
    return {
        "object": "list",
        "data": [
            {"id": "biomni-r0", "object": "model", "owned_by": "biomni-hpc"},
            {"id": "biomni-r0:latest", "object": "model", "owned_by": "biomni-hpc"},
            {"id": "biomni:latest", "object": "model", "owned_by": "biomni-hpc"},
        ]
    }


@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request):
    """Proxy OpenAI-compatible chat completions with streaming & tool support."""
    body = await request.json()
    model = body.get("model", "biomni-r0")
    if model in ("biomni-r0", "biomni"):
        body["model"] = "biomni-r0"

    is_stream = body.get("stream", False)
    headers = {"Content-Type": "application/json"}
    auth_header = request.headers.get("Authorization")
    if auth_header:
        headers["Authorization"] = auth_header

    client = httpx.AsyncClient(timeout=180.0)

    if is_stream:
        async def stream_generator():
            try:
                req = client.build_request(
                    "POST",
                    f"{OLLAMA_BASE_URL}/v1/chat/completions",
                    json=body,
                    headers=headers
                )
                r = await client.send(req, stream=True)
                async for chunk in r.aiter_bytes():
                    yield chunk
            finally:
                await client.aclose()

        return StreamingResponse(stream_generator(), media_type="text/event-stream")

    try:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/v1/chat/completions",
            json=body,
            headers=headers
        )
        await client.aclose()
        if resp.status_code != 200:
            return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")

        data = resp.json()
        # If response has reasoning and empty content without tool calls, promote reasoning to content
        choices = data.get("choices", [])
        if choices:
            msg = choices[0].get("message", {})
            if not msg.get("tool_calls") and not msg.get("content") and msg.get("reasoning"):
                msg["content"] = msg["reasoning"]

        return JSONResponse(content=data)
    except Exception as e:
        await client.aclose()
        logger.error(f"Chat completion error: {e}")
        raise HTTPException(status_code=502, detail=f"Biomni Ollama backend error: {e}")


@app.post("/v1/embeddings")
@app.post("/embeddings")
async def embeddings(request: Request):
    """Proxy OpenAI-compatible embeddings."""
    body = await request.json()
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{OLLAMA_BASE_URL}/v1/embeddings", json=body)
        return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


if __name__ == "__main__":
    logger.info("Starting Biomni-R0 Bridge on 0.0.0.0:18000 -> forwarding to Ollama at 127.0.0.1:11434")
    uvicorn.run(app, host="0.0.0.0", port=18000, log_level="info")
