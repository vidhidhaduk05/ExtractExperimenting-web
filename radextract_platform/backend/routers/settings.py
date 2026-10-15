"""System settings: which AI model / endpoint / key the backend uses."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import llm_config_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LLMConfigUpdate(BaseModel):
    provider: Optional[str] = Field(None, description="'antigravity' | 'local' | 'custom'")
    custom_api_key: Optional[str] = Field(None, description="API key for the local / custom endpoint")
    local_endpoint_url: Optional[str] = Field(None, description="OpenAI-compatible /v1 endpoint")
    local_model_name: Optional[str] = Field(None, description="Model id, e.g. llama3.3")
    antigravity_model: Optional[str] = Field(None, description="Model name for the default gateway")
    antigravity_api_key: Optional[str] = Field(None, description="Optional Gemini key (connection test only)")
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)


class ConnectionTestRequest(BaseModel):
    provider: Optional[str] = None
    endpoint_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None


@router.get("/llm-config")
def get_llm_config():
    """The active AI configuration. Keys are masked."""
    return {"status": "success", "config": llm_config_service.get_active_config(mask_keys=True)}


@router.post("/llm-config")
def update_llm_config(payload: LLMConfigUpdate):
    """Change the AI configuration at runtime (saved to disk, no restart needed)."""
    try:
        updated = llm_config_service.update_active_config(payload.model_dump(exclude_unset=True))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success", "message": "AI model configuration updated successfully.", "config": updated}


@router.post("/llm-config/reset")
def reset_llm_config():
    """Forget saved settings and go back to the gateway from config.py."""
    try:
        config = llm_config_service.reset_to_defaults()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success", "message": "Reset to the default AI gateway.", "config": config}


@router.post("/llm-config/test")
async def test_llm_connection(payload: Optional[ConnectionTestRequest] = None):
    """Ping the active or proposed endpoint. Always answers 200; ``success`` says whether it worked."""
    kwargs = payload.model_dump(exclude_unset=True) if payload else {}
    return await llm_config_service.test_connection(**kwargs)
