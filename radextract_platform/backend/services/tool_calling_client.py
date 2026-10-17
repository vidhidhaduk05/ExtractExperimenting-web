"""Provider-agnostic Tool Calling Client with automatic schema validation and fallback.

Sends OpenAI-compatible function calling schemas in the request body,
validates tool_calls returned from the gateway, repairs recoverable
anomalies, and falls back to text prompt-and-parse if tool execution fails.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx

from config import settings
from services.circuit_breaker import CircuitBreaker
from services.json_utils import parse_json_from_text
from services.tool_registry import get_tool, validate_tool_response

logger = logging.getLogger("radextract.tool_client")

# Global circuit breaker instance
_circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60.0)

# Global in-memory cache for tool results (cache_key -> (timestamp, result, ttl))
_tool_cache: Dict[str, Tuple[float, Dict[str, Any], float]] = {}


class ToolCallingClient:
    """Provider-agnostic client supporting tool calling with validation, caching, & fallback."""

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        tool_calling_enabled: Optional[bool] = None,
        fallback_enabled: Optional[bool] = None,
        timeout: Optional[int] = None,
        max_retries: Optional[int] = None,
        circuit_breaker: Optional[CircuitBreaker] = None,
    ):
        # Settings saved from the UI (services/llm_config_service) override config.py, but explicit
        # arguments always win. With nothing saved this is identical to using config.py.
        try:
            from services import llm_config_service
            override = llm_config_service.get_runtime_override()
        except Exception:
            override = {}

        raw_url = api_url or override.get("api_url") or settings.llm_api_url or ""
        if raw_url and not raw_url.endswith("/chat/completions"):
            raw_url = raw_url.rstrip("/") + "/chat/completions"
        self.api_url = raw_url
        self.api_key = api_key or override.get("api_key") or settings.llm_api_key
        self.model = model or override.get("model") or getattr(settings, "llm_model", "gemini-3.7-flash")
        self.tool_calling_enabled = (
            tool_calling_enabled
            if tool_calling_enabled is not None
            else getattr(settings, "llm_tool_calling_enabled", True)
        )
        self.fallback_enabled = (
            fallback_enabled
            if fallback_enabled is not None
            else getattr(settings, "llm_tool_call_fallback", True)
        )
        self.timeout = timeout or getattr(settings, "llm_request_timeout", 90)
        self.max_retries = (
            max_retries
            if max_retries is not None
            else getattr(settings, "llm_max_retries", 2)
        )
        self.circuit_breaker = circuit_breaker or CircuitBreaker(failure_threshold=5, recovery_timeout=60.0)
        self._cache: Dict[str, Tuple[float, Dict[str, Any], float]] = {}

    def _get_cache_key(self, tool_name: str, prompt: str) -> str:
        return hashlib.md5(f"{tool_name}:{prompt}".encode("utf-8")).hexdigest()

    def _get_cached(self, key: str) -> Optional[Dict[str, Any]]:
        if key in self._cache:
            ts, val, ttl = self._cache[key]
            if time.time() - ts < ttl:
                return val
            else:
                del self._cache[key]
        return None

    def _set_cached(self, key: str, val: Dict[str, Any], ttl: float = 3600.0):
        self._cache[key] = (time.time(), val, ttl)

    def _log_token_usage(self, tool_name: str, usage: Dict[str, Any]):
        if usage:
            logger.info(
                f"Tool '{tool_name}' token usage: prompt={usage.get('prompt_tokens', 0)}, "
                f"completion={usage.get('completion_tokens', 0)}, "
                f"total={usage.get('total_tokens', 0)}"
            )

    def call_with_tool(
        self,
        tool_name: str,
        prompt: str,
        system_prompt: str = "You are a helpful AI assistant.",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        use_cache: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Call the LLM with a specific tool schema, validating output against tool specs."""
        cache_key = self._get_cache_key(tool_name, prompt)
        if use_cache:
            cached = self._get_cached(cache_key)
            if cached is not None:
                logger.info(f"Tool '{tool_name}' cache hit for key {cache_key[:8]}")
                return cached

        # Check circuit breaker
        if not self.circuit_breaker.can_execute():
            logger.warning(f"Circuit breaker is OPEN. Skipping LLM request for tool '{tool_name}'.")
            return None

        # 1. Try tool calling if enabled
        if self.tool_calling_enabled:
            result = self._try_tool_call(tool_name, prompt, system_prompt, temperature, max_tokens)
            if result is not None:
                self.circuit_breaker.record_success()
                if use_cache:
                    self._set_cached(cache_key, result)
                return result

        # 2. Fall back to prompt-and-parse
        if self.fallback_enabled:
            result = self._fallback_prompt_parse(tool_name, prompt, system_prompt, temperature, max_tokens)
            if result is not None:
                self.circuit_breaker.record_success()
                if use_cache:
                    self._set_cached(cache_key, result)
                return result

        self.circuit_breaker.record_failure()
        logger.error(f"Tool '{tool_name}' failed all paths (tool_call, repair, fallback)")
        return None

    async def call_with_tool_async(
        self,
        tool_name: str,
        prompt: str,
        system_prompt: str = "You are a helpful AI assistant.",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        use_cache: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """Async variant for high-concurrency batch operations (e.g. asyncio.gather)."""
        cache_key = self._get_cache_key(tool_name, prompt)
        if use_cache:
            cached = self._get_cached(cache_key)
            if cached is not None:
                return cached

        if not self.circuit_breaker.can_execute():
            logger.warning(f"Circuit breaker OPEN. Skipping async call for '{tool_name}'.")
            return None

        tool_def = get_tool(tool_name)
        body: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tool_def and self.tool_calling_enabled:
            body["tools"] = [tool_def]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(self.api_url, json=body, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    self._log_token_usage(tool_name, data.get("usage", {}))
                    choices = data.get("choices", [])
                    if choices:
                        msg = choices[0].get("message", {})
                        tool_calls = msg.get("tool_calls", [])
                        if tool_calls:
                            fn = tool_calls[0].get("function", {})
                            args_str = fn.get("arguments", "{}")
                            args = json.loads(args_str) if isinstance(args_str, str) else args_str
                            valid, _ = validate_tool_response(tool_name, args)
                            if valid:
                                self.circuit_breaker.record_success()
                                if use_cache:
                                    self._set_cached(cache_key, args)
                                return args
                        content = msg.get("content", "")
                        parsed = parse_json_from_text(content)
                        if parsed:
                            repaired = self._repair_response(tool_name, parsed)
                            if repaired:
                                self.circuit_breaker.record_success()
                                if use_cache:
                                    self._set_cached(cache_key, repaired)
                                return repaired
        except Exception as e:
            logger.warning(f"Async tool call error for '{tool_name}': {e}")

        self.circuit_breaker.record_failure()
        return None

    def _try_tool_call(
        self,
        tool_name: str,
        prompt: str,
        system_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> Optional[Dict[str, Any]]:
        """Send request with tools and parse tool_calls from response with retry logic."""
        tool_def = get_tool(tool_name)
        if not tool_def:
            logger.warning(f"Tool definition '{tool_name}' not found in registry.")
            return None

        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "tools": [tool_def],
            "tool_choice": "auto",
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    res = client.post(self.api_url, json=body, headers=headers)

                if res.status_code != 200:
                    logger.warning(
                        f"Tool calling returned HTTP {res.status_code} (attempt {attempt + 1}/{self.max_retries + 1}): {res.text[:200]}"
                    )
                    if attempt < self.max_retries:
                        time.sleep(2 ** attempt)
                        continue
                    return None

                data = res.json()
                self._log_token_usage(tool_name, data.get("usage", {}))
                choices = data.get("choices", [])
                if not choices:
                    logger.warning(f"No choices in tool calling response: {data}")
                    return None

                msg = choices[0].get("message", {})
                tool_calls = msg.get("tool_calls", [])

                if not tool_calls:
                    content = msg.get("content", "")
                    if content:
                        parsed = self._parse_content_as_tool_response(tool_name, content)
                        if parsed is not None:
                            return parsed
                    logger.info(f"LLM returned no tool_calls for '{tool_name}', falling back to content parse")
                    return None

                # Find the matching tool call
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    fn_name = fn.get("name", "")
                    if fn_name != tool_name:
                        continue

                    raw_args = fn.get("arguments", "")
                    if isinstance(raw_args, dict):
                        args = raw_args
                    elif isinstance(raw_args, str):
                        try:
                            args = json.loads(raw_args)
                        except json.JSONDecodeError:
                            args = parse_json_from_text(raw_args)
                    else:
                        args = None

                    if args is None:
                        logger.warning(f"Failed to parse tool call arguments: {raw_args[:200]}")
                        continue

                    # Validate against registry schema
                    is_valid, err_msg = validate_tool_response(tool_name, args)
                    if is_valid:
                        return args

                    logger.info(f"Tool call validation failed ({err_msg}), attempting repair...")
                    repaired = self._repair_response(tool_name, args)
                    if repaired is not None:
                        is_valid_repaired, _ = validate_tool_response(tool_name, repaired)
                        if is_valid_repaired:
                            return repaired

                return None

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                logger.warning(f"Network error during tool call attempt {attempt + 1}: {e}")
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    continue
                return None
            except Exception as e:
                logger.error(f"Unexpected error during tool call: {e}", exc_info=True)
                return None

        return None

    def _fallback_prompt_parse(
        self,
        tool_name: str,
        prompt: str,
        system_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> Optional[Dict[str, Any]]:
        """Fallback: send prompt requesting JSON output and parse returned text."""
        json_instruction = (
            "\n\nIMPORTANT: Return ONLY a valid JSON object matching the requested schema. "
            "Do not include explanation, markdown fences, or preamble."
        )
        augmented_prompt = prompt + json_instruction

        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": augmented_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(self.api_url, json=body, headers=headers)

            if res.status_code != 200:
                logger.warning(f"Fallback prompt returned HTTP {res.status_code}: {res.text[:200]}")
                return None

            data = res.json()
            self._log_token_usage(tool_name, data.get("usage", {}))
            choices = data.get("choices", [])
            if not choices:
                return None

            content = choices[0].get("message", {}).get("content", "")
            if not content:
                return None

            return self._parse_content_as_tool_response(tool_name, content)

        except Exception as e:
            logger.error(f"Fallback prompt-and-parse error: {e}", exc_info=True)
            return None

    def _parse_content_as_tool_response(self, tool_name: str, content: str) -> Optional[Dict[str, Any]]:
        """Parse raw text content and validate/repair it as a tool response."""
        parsed = parse_json_from_text(content)
        if parsed is None:
            return None

        if isinstance(parsed, dict):
            is_valid, _ = validate_tool_response(tool_name, parsed)
            if is_valid:
                return parsed
            return self._repair_response(tool_name, parsed)

        if isinstance(parsed, list):
            return self._repair_response(tool_name, parsed)

        return None

    def _repair_response(self, tool_name: str, data: Any) -> Optional[Dict[str, Any]]:
        """Repair common data shape and type mismatches in LLM responses."""
        if tool_name == "extract_variables":
            items = []
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                for key in ["responses", "results", "answers", "extractions", "items", "data", "variables"]:
                    if key in data and isinstance(data[key], list):
                        items = data[key]
                        break
                if not items and "prompt" in data:
                    items = [data]

            repaired_responses = []
            for it in items:
                if isinstance(it, dict):
                    prompt_val = str(it.get("prompt") or it.get("name") or it.get("variable") or "").strip()
                    resp_val = str(it.get("response") or it.get("answer") or it.get("value") or "").strip()
                    src_val = str(it.get("source") or it.get("evidence") or it.get("quote") or "").strip()
                    page_val = str(it.get("page") or it.get("page_number") or "1").strip()
                    if prompt_val:
                        repaired_responses.append({
                            "prompt": prompt_val,
                            "response": resp_val or "Not found",
                            "source": src_val or "Not found",
                            "page": page_val,
                        })

            if repaired_responses:
                return {"responses": repaired_responses}

        elif tool_name == "batch_extract_variables":
            results = []
            if isinstance(data, dict):
                raw_res = data.get("results") or data.get("studies") or []
                if isinstance(raw_res, list):
                    for st in raw_res:
                        if isinstance(st, dict):
                            sid = str(st.get("study_id", "")).strip()
                            resps = st.get("responses", [])
                            if sid and isinstance(resps, list):
                                results.append({"study_id": sid, "responses": resps})
            if results:
                return {"results": results}

        elif tool_name == "screen_and_extract":
            if isinstance(data, dict):
                scr = data.get("screening", {})
                raw_decision = str(scr.get("decision") or data.get("decision") or "").lower()
                decision = "include" if "include" in raw_decision else ("exclude" if "exclude" in raw_decision else "uncertain")
                confidence = float(scr.get("confidence", 0.8))
                reason = str(scr.get("reason") or "Screening assessment").strip()
                extractions = data.get("extractions", [])
                return {
                    "screening": {
                        "decision": decision,
                        "confidence": min(max(confidence, 0.0), 1.0),
                        "reason": reason,
                        "reason_code": str(scr.get("reason_code", "")).strip(),
                        "evidence_quote": str(scr.get("evidence_quote", "")).strip(),
                    },
                    "extractions": extractions if decision == "include" else None,
                }

        elif tool_name == "screen_fulltext":
            if isinstance(data, dict):
                raw_decision = str(data.get("decision") or data.get("recommendation") or "").lower()
                decision = "include" if "include" in raw_decision else ("exclude" if "exclude" in raw_decision else "exclude")
                try:
                    conf = float(data.get("confidence", 0.8))
                except Exception:
                    conf = 0.8
                reason = str(data.get("reason") or data.get("reason_text") or data.get("rationale") or "Screened according to criteria").strip()
                code = str(data.get("reason_code") or "").strip()
                quote = str(data.get("evidence_quote") or (data.get("quotes", [""])[0] if isinstance(data.get("quotes"), list) and data.get("quotes") else "")).strip()
                return {
                    "decision": decision,
                    "confidence": min(max(conf, 0.0), 1.0),
                    "reason": reason,
                    "reason_code": code,
                    "evidence_quote": quote,
                }

        elif tool_name == "screen_title_abstract":
            if isinstance(data, dict):
                raw_status = str(data.get("status") or data.get("decision") or "").lower()
                if "include" in raw_status:
                    status = "included"
                elif "exclude" in raw_status:
                    status = "excluded"
                else:
                    status = "uncertain"
                try:
                    conf = float(data.get("confidence", 0.8))
                except Exception:
                    conf = 0.8
                reason = str(data.get("reason") or data.get("reason_text") or "Title/Abstract screening decision").strip()
                matches = data.get("picos_matches") if isinstance(data.get("picos_matches"), dict) else {}
                return {
                    "status": status,
                    "reason": reason,
                    "confidence": min(max(conf, 0.0), 1.0),
                    "picos_matches": matches,
                }

        elif tool_name == "prefill_rob_domain":
            if isinstance(data, dict):
                judgment = str(data.get("judgment") or data.get("domain_judgment") or "unclear").strip()
                support = str(data.get("support") or data.get("domain_support") or "Judgment rationale").strip()
                try:
                    conf = float(data.get("confidence", 0.8))
                except Exception:
                    conf = 0.8
                answers = data.get("answers", {})
                return {
                    "judgment": judgment,
                    "domain_judgment": judgment,
                    "support": support,
                    "domain_support": support,
                    "confidence": min(max(conf, 0.0), 1.0),
                    "answers": answers,
                }

        elif tool_name == "generate_variables":
            vars_list = []
            if isinstance(data, list):
                vars_list = data
            elif isinstance(data, dict):
                for key in ["variables", "fields", "items", "results"]:
                    if key in data and isinstance(data[key], list):
                        vars_list = data[key]
                        break
            if vars_list:
                cleaned = []
                for v in vars_list:
                    if isinstance(v, dict) and ("name" in v or "field" in v):
                        name_str = str(v.get("name") or v.get("field") or "").strip()
                        if name_str:
                            cleaned.append({
                                "section": str(v.get("section", "Cohort_Level")),
                                "name": name_str,
                                "field_type": str(v.get("field_type", "free_text")),
                                "description": str(v.get("description", "")),
                                "order_index": int(v.get("order_index", 1)),
                                "allowed_values": str(v.get("allowed_values", "") or ""),
                                "is_base": bool(v.get("is_base", False)),
                            })
                if cleaned:
                    return {"variables": cleaned}

        elif tool_name == "generate_schema_fields":
            fields = []
            if isinstance(data, list):
                fields = data
            elif isinstance(data, dict):
                for key in ["fields", "schema", "variables", "items"]:
                    if key in data and isinstance(data[key], list):
                        fields = data[key]
                        break
            if fields:
                cleaned = []
                for f in fields:
                    if isinstance(f, dict):
                        name_val = str(f.get("name") or f.get("field") or "").strip()
                        type_val = str(f.get("type") or f.get("field_type") or "string").strip()
                        if name_val:
                            cleaned.append({
                                "name": name_val,
                                "type": type_val,
                                "description": str(f.get("description", "")),
                                "required": bool(f.get("required", False)),
                                "options": list(f.get("options", [])),
                            })
                if cleaned:
                    return {"fields": cleaned}

        return None

    def as_model_fn(
        self,
        tool_name: str,
        system_prompt: str = "You are a helpful assistant.",
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> Callable[[str], Optional[Dict[str, Any]]]:
        """Return a callable (prompt: str) -> Optional[Dict[str, Any]]."""
        def model_fn(prompt: str) -> Optional[Dict[str, Any]]:
            return self.call_with_tool(
                tool_name=tool_name,
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        return model_fn
