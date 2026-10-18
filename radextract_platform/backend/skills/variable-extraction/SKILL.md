---
name: variable-extraction
description: Extracts structured data from research article PDFs using LLM tool calling.
---

# Skill: Variable Extraction

## Description
Extracts structured numerical and categorical data from research article PDFs using OpenAI-compatible function calling and Docling table structures.

## Inputs
- `study_id`: Target study identifier
- `study_text`: Extracted PDF document text or section chunks
- `variables`: List of variable schemas with names, types, and descriptions

## Outputs
- List of `{prompt, response, source, page}` extraction tuples with exact supporting verbatim evidence quotes.

## Registered Tool
- `extract_variables` / `batch_extract_variables` (`services/tool_registry.py`)
