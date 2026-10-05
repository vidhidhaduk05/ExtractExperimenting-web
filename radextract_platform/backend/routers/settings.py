"""
FastAPI Router for System, AI Model, and API Key Settings.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from services import llm_config_service
from config import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LLMConfigUpdate(BaseModel):
    provider: Optional[str] = Field(None, description="'antigravity' | 'local' | 'custom'")
    custom_api_key: Optional[str] = Field(None, description="Custom local model API key")
    local_endpoint_url: Optional[str] = Field(None, description="OpenAI-compatible /v1 endpoint for local model")
    local_model_name: Optional[str] = Field(None, description="Model identifier e.g. llama3.3, qwen2.5")
    antigravity_model: Optional[str] = Field(None, description="Gemini model name")
    antigravity_api_key: Optional[str] = Field(None, description="Alternative Gemini key")
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)


class ConnectionTestRequest(BaseModel):
    provider: Optional[str] = None
    endpoint_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None


@router.get("/llm-config")
def get_llm_config():
    """Retrieve the currently active AI model and API key configuration (masked for security)."""
    return {
        "status": "success",
        "config": llm_config_service.get_active_config(mask_keys=True)
    }


@router.post("/llm-config")
def update_llm_config(payload: LLMConfigUpdate):
    """Update runtime AI model and API key configuration and persist to disk."""
    try:
        updated = llm_config_service.update_active_config(payload.model_dump(exclude_unset=True))
        return {
            "status": "success",
            "message": "AI model configuration updated successfully.",
            "config": updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/llm-config/reset")
def reset_llm_config():
    """Reset configuration back to default Antigravity Gemini cloud credentials."""
    try:
        res = llm_config_service.reset_to_antigravity_defaults()
        return {
            "status": "success",
            "message": "Reset to Antigravity defaults successfully.",
            "config": res
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/llm-config/test")
async def test_llm_connection(payload: Optional[ConnectionTestRequest] = None):
    """Test ping and capability verification for the active or proposed LLM configuration."""
    kwargs = payload.model_dump(exclude_unset=True) if payload else {}
    result = await llm_config_service.test_connection(**kwargs)
    return result
