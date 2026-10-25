#!/usr/bin/env python3
"""
Biomni-R0 High-Performance Port 18000 Multi-Protocol API Bridge.
Exposes both:
  1) OpenAI-compatible API (/v1/chat/completions, /v1/models, /v1/embeddings)
  2) Anthropic Messages API (/v1/messages, /messages) for Claude Code Extension & CLI
Backed by local GPU Biomni-R0 instance in Ollama (127.0.0.1:11434).
"""

import os
import re
import json
import uuid
import time
import logging
import httpx
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("biomni-bridge")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

app = FastAPI(title="Biomni-R0 Multi-Protocol Bridge", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.head("/")
@app.get("/health")
@app.head("/health")
@app.get("/api/hello")
@app.head("/api/hello")
async def health():
    """Health check endpoint required by start scripts and verification checks."""
    return {
        "status": "ok",
        "service": "Biomni-R0 Bridge",
        "protocols": ["openai", "anthropic"],
        "port": 18000,
        "ollama_target": OLLAMA_BASE_URL
    }


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

    return {
        "object": "list",
        "data": [
            {"id": "biomni-r0", "object": "model", "owned_by": "biomni-hpc"},
            {"id": "biomni-r0:latest", "object": "model", "owned_by": "biomni-hpc"},
            {"id": "biomni:latest", "object": "model", "owned_by": "biomni-hpc"},
        ]
    }


def clean_think_tags(text: str) -> str:
    """Strip reasoning/think tags if present in model output."""
    if not text:
        return ""
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    return cleaned if cleaned else text.strip()


# =========================================================================
# OpenAI Chat Completions Endpoint
# =========================================================================
@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request):
    """Proxy OpenAI-compatible chat completions with streaming & tool support."""
    body = await request.json()
    model = body.get("model", "biomni-r0")
    if model in ("biomni-r0", "biomni") or "biomni" in model or "claude" in model:
        body["model"] = "biomni-r0"

    # Default reasonable max_tokens to prevent runaway context generation
    if "max_tokens" not in body or body["max_tokens"] is None or body["max_tokens"] > 8192:
        body["max_tokens"] = 4096

    is_stream = body.get("stream", False)
    headers = {"Content-Type": "application/json"}
    auth_header = request.headers.get("Authorization")
    if auth_header:
        headers["Authorization"] = auth_header

    client = httpx.AsyncClient(timeout=300.0)

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


# =========================================================================
# Anthropic Messages API Endpoint (For Claude Code Extension & Claude CLI)
# =========================================================================
def parse_anthropic_messages(messages_input: List[Dict[str, Any]], system_prompt: Optional[Any] = None) -> List[Dict[str, Any]]:
    """Convert Anthropic-formatted messages and system prompt to OpenAI chat format."""
    openai_msgs = []

    # Handle system prompt
    if system_prompt:
        if isinstance(system_prompt, str) and system_prompt.strip():
            openai_msgs.append({"role": "system", "content": system_prompt.strip()})
        elif isinstance(system_prompt, list):
            sys_texts = [b.get("text", "") for b in system_prompt if isinstance(b, dict) and b.get("type") == "text"]
            if sys_texts:
                openai_msgs.append({"role": "system", "content": "\n".join(sys_texts)})

    for m in messages_input:
        role = m.get("role", "user")
        content = m.get("content", "")

        if isinstance(content, str):
            openai_msgs.append({"role": role, "content": content})
        elif isinstance(content, list):
            text_chunks = []
            tool_calls = []
            for b in content:
                if isinstance(b, str):
                    text_chunks.append(b)
                elif isinstance(b, dict):
                    b_type = b.get("type")
                    if b_type == "text":
                        text_chunks.append(b.get("text", ""))
                    elif b_type == "tool_use":
                        tool_calls.append({
                            "id": b.get("id", f"call_{uuid.uuid4().hex[:8]}"),
                            "type": "function",
                            "function": {
                                "name": b.get("name", ""),
                                "arguments": json.dumps(b.get("input", {}))
                            }
                        })
                    elif b_type == "tool_result":
                        t_content = b.get("content", "")
                        if isinstance(t_content, list):
                            t_content = " ".join([x.get("text", "") for x in t_content if isinstance(x, dict) and x.get("type") == "text"])
                        openai_msgs.append({
                            "role": "tool",
                            "tool_call_id": b.get("tool_use_id", f"call_{uuid.uuid4().hex[:8]}"),
                            "content": str(t_content)
                        })

            if text_chunks or tool_calls:
                msg_entry = {"role": role, "content": "\n".join(text_chunks)}
                if tool_calls:
                    msg_entry["tool_calls"] = tool_calls
                openai_msgs.append(msg_entry)

    return openai_msgs


def parse_anthropic_tools(tools_input: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    """Convert Anthropic tool definitions to OpenAI format."""
    if not tools_input:
        return None
    openai_tools = []
    for t in tools_input:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": t.get("name"),
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}})
            }
        })
    return openai_tools


@app.post("/v1/messages")
@app.post("/messages")
async def anthropic_messages(request: Request):
    """
    Anthropic Messages API bridge.
    Translates Anthropic Messages requests into Biomni Ollama requests,
    and returns responses in Anthropic protocol (both SSE streaming and JSON).
    """
    body = await request.json()
    model = body.get("model", "biomni-r0")
    messages = body.get("messages", [])
    system_prompt = body.get("system")
    tools = body.get("tools")
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens", 4096)
    if max_tokens > 8192:
        max_tokens = 4096

    openai_msgs = parse_anthropic_messages(messages, system_prompt)
    openai_tools = parse_anthropic_tools(tools)

    openai_payload: Dict[str, Any] = {
        "model": "biomni-r0",
        "messages": openai_msgs,
        "max_tokens": max_tokens,
        "stream": stream,
        "temperature": body.get("temperature", 0.7),
    }
    if openai_tools:
        openai_payload["tools"] = openai_tools

    headers = {"Content-Type": "application/json"}
    msg_id = f"msg_{uuid.uuid4().hex[:24]}"

    client = httpx.AsyncClient(timeout=300.0)

    if stream:
        async def anthropic_stream_generator():
            try:
                # 1. message_start event
                start_event = {
                    "type": "message_start",
                    "message": {
                        "id": msg_id,
                        "type": "message",
                        "role": "assistant",
                        "content": [],
                        "model": "biomni-r0",
                        "stop_reason": None,
                        "stop_sequence": None,
                        "usage": {"input_tokens": 50, "output_tokens": 1}
                    }
                }
                yield f"event: message_start\ndata: {json.dumps(start_event)}\n\n".encode("utf-8")

                # 2. content_block_start event (text block index 0)
                block_start = {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "text", "text": ""}
                }
                yield f"event: content_block_start\ndata: {json.dumps(block_start)}\n\n".encode("utf-8")

                # 3. Stream content deltas
                req = client.build_request(
                    "POST",
                    f"{OLLAMA_BASE_URL}/v1/chat/completions",
                    json=openai_payload,
                    headers=headers
                )
                r = await client.send(req, stream=True)

                in_think_block = False
                output_tokens = 0

                async for line in r.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        raw_data = line[6:].strip()
                        if raw_data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw_data)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                text = delta.get("content") or ""
                                reasoning = delta.get("reasoning") or ""

                                # If model sends reasoning tags or content
                                if "<think>" in text:
                                    in_think_block = True
                                    text = text.replace("<think>", "")
                                if "</think>" in text:
                                    in_think_block = False
                                    text = text.split("</think>")[-1]

                                # Send visible content
                                emit_text = text if not in_think_block else ""
                                if not emit_text and not in_think_block and reasoning:
                                    emit_text = reasoning

                                if emit_text:
                                    output_tokens += 1
                                    delta_event = {
                                        "type": "content_block_delta",
                                        "index": 0,
                                        "delta": {"type": "text_delta", "text": emit_text}
                                    }
                                    yield f"event: content_block_delta\ndata: {json.dumps(delta_event)}\n\n".encode("utf-8")
                        except Exception:
                            continue

                # 4. content_block_stop event
                block_stop = {"type": "content_block_stop", "index": 0}
                yield f"event: content_block_stop\ndata: {json.dumps(block_stop)}\n\n".encode("utf-8")

                # 5. message_delta event
                msg_delta = {
                    "type": "message_delta",
                    "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                    "usage": {"output_tokens": max(output_tokens, 1)}
                }
                yield f"event: message_delta\ndata: {json.dumps(msg_delta)}\n\n".encode("utf-8")

                # 6. message_stop event
                msg_stop = {"type": "message_stop"}
                yield f"event: message_stop\ndata: {json.dumps(msg_stop)}\n\n".encode("utf-8")

            finally:
                await client.aclose()

        return StreamingResponse(anthropic_stream_generator(), media_type="text/event-stream")

    # Non-streaming
    try:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/v1/chat/completions",
            json=openai_payload,
            headers=headers
        )
        await client.aclose()
        if resp.status_code != 200:
            return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")

        data = resp.json()
        choices = data.get("choices", [])
        content_text = ""
        tool_calls = []

        if choices:
            msg = choices[0].get("message", {})
            content_text = msg.get("content") or msg.get("reasoning") or ""
            tool_calls = msg.get("tool_calls") or []

        content_text = clean_think_tags(content_text)

        anthropic_blocks: List[Dict[str, Any]] = []
        if content_text:
            anthropic_blocks.append({"type": "text", "text": content_text})

        for tc in tool_calls:
            try:
                fn_args = json.loads(tc.get("function", {}).get("arguments", "{}"))
            except Exception:
                fn_args = {}
            anthropic_blocks.append({
                "type": "tool_use",
                "id": tc.get("id", f"toolu_{uuid.uuid4().hex[:8]}"),
                "name": tc.get("function", {}).get("name", ""),
                "input": fn_args
            })

        stop_reason = "tool_use" if tool_calls else "end_turn"
        usage = data.get("usage", {})

        anthropic_resp = {
            "id": msg_id,
            "type": "message",
            "role": "assistant",
            "model": "biomni-r0",
            "content": anthropic_blocks,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {
                "input_tokens": usage.get("prompt_tokens", 50),
                "output_tokens": usage.get("completion_tokens", 25)
            }
        }
        return JSONResponse(content=anthropic_resp)
    except Exception as e:
        await client.aclose()
        logger.error(f"Anthropic messages error: {e}")
        raise HTTPException(status_code=502, detail=f"Biomni backend error: {e}")


# =========================================================================
# Embeddings
# =========================================================================
@app.post("/v1/embeddings")
@app.post("/embeddings")
async def embeddings(request: Request):
    """Proxy OpenAI-compatible embeddings."""
    body = await request.json()
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{OLLAMA_BASE_URL}/v1/embeddings", json=body)
        return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


if __name__ == "__main__":
    logger.info("Starting Biomni-R0 Multi-Protocol Bridge on 0.0.0.0:18000 -> Ollama 127.0.0.1:11434")
    uvicorn.run(app, host="0.0.0.0", port=18000, log_level="info")
