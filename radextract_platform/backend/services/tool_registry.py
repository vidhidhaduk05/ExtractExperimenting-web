"""Central Tool Registry for VDExtract.

Defines tool specifications in OpenAI function-calling schema format,
internal response validation schemas, and validation routines.
"""
from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional, Tuple

try:
    import jsonschema
except ImportError:
    jsonschema = None

logger = logging.getLogger("radextract.tool_registry")

# OpenAI Function Calling tool definitions
TOOL_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "extract_variables": {
        "type": "function",
        "function": {
            "name": "extract_variables",
            "description": (
                "Extract structured data from a research article. For each variable, "
                "provide the extracted value, a verbatim supporting quote, and the page number "
                "where the evidence was found."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "responses": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "prompt": {"type": "string", "description": "The exact variable name"},
                                "response": {"type": "string", "description": "Concise extracted value, or 'Not found'"},
                                "source": {"type": "string", "description": "Verbatim quote from the document supporting this value"},
                                "page": {"type": ["string", "integer"], "description": "Page number (1-indexed) where quote appears"}
                            },
                            "required": ["prompt", "response", "source", "page"]
                        }
                    }
                },
                "required": ["responses"]
            }
        }
    },
    "screen_title_only": {
        "type": "function",
        "function": {
            "name": "screen_title_only",
            "description": "Screen a study's title against PICO criteria for inclusion, exclusion, or uncertainty requiring abstract review.",
            "parameters": {
                "type": "object",
                "properties": {
                    "decision": {"type": "string", "enum": ["include", "exclude", "uncertain"]},
                    "confidence": {"type": "number", "description": "Confidence score 0-1"},
                    "reason": {"type": "string", "description": "Justification for the decision"},
                    "reason_code": {"type": "string", "description": "Short snake_case code or empty string"},
                    "matched_keywords": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["decision", "confidence", "reason"]
            }
        }
    },
    "screen_fulltext": {
        "type": "function",
        "function": {
            "name": "screen_fulltext",
            "description": "Screen a research article against PICO eligibility criteria. Determine if the study should be included or excluded.",
            "parameters": {
                "type": "object",
                "properties": {
                    "decision": {"type": "string", "enum": ["include", "exclude"]},
                    "confidence": {"type": "number", "description": "Confidence score 0-1"},
                    "reason": {"type": "string", "description": "Clear justification matching PICO criteria"},
                    "reason_code": {"type": "string", "description": "Short snake_case code for exclusion reason, or empty string"},
                    "evidence_quote": {"type": "string", "description": "Verbatim sentence quote supporting the decision"}
                },
                "required": ["decision", "confidence", "reason"]
            }
        }
    },
    "screen_title_abstract": {
        "type": "function",
        "function": {
            "name": "screen_title_abstract",
            "description": "Screen a study's title and abstract against PICO criteria for inclusion/exclusion in a systematic review.",
            "parameters": {
                "type": "object",
                "properties": {
                    "decision": {"type": "string", "enum": ["include", "exclude", "uncertain"]},
                    "status": {"type": "string", "enum": ["included", "excluded", "uncertain"]},
                    "confidence": {"type": "number", "description": "Confidence score 0-1"},
                    "reason": {"type": "string", "description": "Justification for the screening decision"},
                    "reason_code": {"type": "string", "description": "Short snake_case code for exclusion reason, or empty string"},
                    "evidence_quote": {"type": "string", "description": "Verbatim sentence quote supporting the decision"},
                    "include_keywords": {"type": "array", "items": {"type": "string"}},
                    "exclude_keywords": {"type": "array", "items": {"type": "string"}},
                    "needs_clarification": {"type": "boolean"},
                    "clarification_type": {"type": ["string", "null"]},
                    "clarification_question": {"type": ["string", "null"]},
                    "clarification_options": {"type": "array", "items": {"type": "object"}}
                },
                "required": ["confidence", "reason"]
            }
        }
    },
    "resolve_clarification": {
        "type": "function",
        "function": {
            "name": "resolve_clarification",
            "description": "Provide final screening decision for a study after human reviewer clarification.",
            "parameters": {
                "type": "object",
                "properties": {
                    "decision": {"type": "string", "enum": ["include", "exclude", "uncertain"]},
                    "status": {"type": "string", "enum": ["included", "excluded", "uncertain"]},
                    "confidence": {"type": "number", "description": "Confidence score 0-1"},
                    "reason": {"type": "string", "description": "Clinical rationale explaining how the clarification resolved the decision"},
                    "reason_code": {"type": "string", "description": "Exclusion reason code if excluded, or empty string"}
                },
                "required": ["confidence", "reason"]
            }
        }
    },
    "prefill_rob_domain": {
        "type": "function",
        "function": {
            "name": "prefill_rob_domain",
            "description": "Assess a single domain of a Risk of Bias tool for a research study. Provide a judgment, supporting text, confidence, and answers to signaling questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "judgment": {"type": "string", "description": "Risk of bias judgment (e.g., 'low', 'high', 'unclear', 'some concerns')"},
                    "domain_judgment": {"type": "string", "description": "Alias for judgment"},
                    "support": {"type": "string", "description": "Supporting text explaining the judgment"},
                    "domain_support": {"type": "string", "description": "Alias for support"},
                    "confidence": {"type": "number", "description": "Confidence score 0-1"},
                    "answers": {
                        "description": "Answers to signaling questions, keyed by question key or provided as a list of question objects",
                        "type": ["object", "array"]
                    }
                },
                "required": ["confidence"]
            }
        }
    },
    "generate_variables": {
        "type": "function",
        "function": {
            "name": "generate_variables",
            "description": "Generate a set of data extraction variables from PICO criteria for a systematic review project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "variables": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "field_type": {"type": "string", "description": "text, number, select, multiselect, date, boolean, enum, float, int, percent, free_text"},
                                "allowed_values": {"type": ["string", "array"], "description": "Comma/semicolon-separated options for select/enum fields"},
                                "category": {"type": "string", "description": "PICO category: population, intervention, comparator, outcome, study_design"},
                                "section": {"type": "string", "description": "Cohort_Level, Protocol_Level, Outcome_Level"},
                                "range_min": {"type": ["number", "null"]},
                                "range_max": {"type": ["number", "null"]}
                            },
                            "required": ["name", "field_type"]
                        }
                    }
                },
                "required": ["variables"]
            }
        }
    },
    "generate_schema_fields": {
        "type": "function",
        "function": {
            "name": "generate_schema_fields",
            "description": "Generate extraction form fields from PICO criteria for a systematic review.",
            "parameters": {
                "type": "object",
                "properties": {
                    "fields": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string"},
                                "description": {"type": "string"},
                                "required": {"type": "boolean"},
                                "options": {"type": "array", "items": {"type": "string"}}
                            },
                            "required": ["name", "type"]
                        }
                    }
                },
                "required": ["fields"]
            }
        }
    },
    "batch_extract_variables": {
        "type": "function",
        "function": {
            "name": "batch_extract_variables",
            "description": "Extract structured data from multiple research articles in a single call.",
            "parameters": {
                "type": "object",
                "properties": {
                    "results": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "study_id": {"type": "string"},
                                "responses": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "prompt": {"type": "string"},
                                            "response": {"type": "string"},
                                            "source": {"type": "string"},
                                            "page": {"type": ["string", "integer"]}
                                        },
                                        "required": ["prompt", "response", "source", "page"]
                                    }
                                }
                            },
                            "required": ["study_id", "responses"]
                        }
                    }
                },
                "required": ["results"]
            }
        }
    },
    "screen_and_extract": {
        "type": "function",
        "function": {
            "name": "screen_and_extract",
            "description": "Screen a research article against PICO criteria and extract variables in a single call if included.",
            "parameters": {
                "type": "object",
                "properties": {
                    "screening": {
                        "type": "object",
                        "properties": {
                            "decision": {"type": "string", "enum": ["include", "exclude", "uncertain"]},
                            "confidence": {"type": "number"},
                            "reason": {"type": "string"},
                            "reason_code": {"type": "string"},
                            "evidence_quote": {"type": "string"}
                        },
                        "required": ["decision", "confidence", "reason"]
                    },
                    "extractions": {
                        "type": ["array", "null"],
                        "description": "Populated if decision is 'include'",
                        "items": {
                            "type": "object",
                            "properties": {
                                "prompt": {"type": "string"},
                                "response": {"type": "string"},
                                "source": {"type": "string"},
                                "page": {"type": ["string", "integer"]}
                            },
                            "required": ["prompt", "response", "source", "page"]
                        }
                    }
                },
                "required": ["screening"]
            }
        }
    }
}

# Validation schemas used internally
RESPONSE_SCHEMAS: Dict[str, Dict[str, Any]] = {
    name: definition["function"]["parameters"]
    for name, definition in TOOL_DEFINITIONS.items()
}


def get_tool(name: str) -> Optional[Dict[str, Any]]:
    """Get the OpenAI function-calling definition for a tool."""
    return TOOL_DEFINITIONS.get(name)


def get_response_schema(name: str) -> Optional[Dict[str, Any]]:
    """Get the JSON schema for validating a tool's output."""
    return RESPONSE_SCHEMAS.get(name)


def get_tools_for_request(names: List[str]) -> List[Dict[str, Any]]:
    """Get a list of tool definitions formatted for the OpenAI tools parameter."""
    return [TOOL_DEFINITIONS[n] for n in names if n in TOOL_DEFINITIONS]


def validate_tool_response(tool_name: str, arguments: Any) -> Tuple[bool, str]:
    """Validate a tool call's arguments against the response schema.

    Returns:
        (is_valid, error_message)
    """
    if not isinstance(arguments, dict):
        return False, f"Expected dict arguments for tool '{tool_name}', got {type(arguments).__name__}"

    schema = get_response_schema(tool_name)
    if not schema:
        return False, f"No schema registered for tool '{tool_name}'"

    # Special allowance for prefill_rob_domain: judgment or domain_judgment is required
    if tool_name == "prefill_rob_domain":
        has_judgment = "judgment" in arguments or "domain_judgment" in arguments
        has_support = "support" in arguments or "domain_support" in arguments
        if not (has_judgment and has_support):
            return False, "prefill_rob_domain requires 'judgment' (or 'domain_judgment') and 'support' (or 'domain_support')"

    if jsonschema is not None:
        try:
            jsonschema.validate(instance=arguments, schema=schema)
            return True, ""
        except jsonschema.ValidationError as e:
            return False, f"Schema validation error: {e.message}"
        except Exception as e:
            return False, f"Validation error: {e}"

    # Fallback manual validation if jsonschema is unavailable
    required_keys = schema.get("required", [])
    for k in required_keys:
        if k not in arguments:
            return False, f"Missing required property: '{k}'"

    return True, ""
