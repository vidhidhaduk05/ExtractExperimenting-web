# RadExtract MCP Server

This directory contains the Model Context Protocol (MCP) server for integrating RadExtract's systematic review and extraction rules with Claude, ChatGPT, and other MCP-compatible clients.

## Features

1. **Get Project PICO**: Retrieves the PICO criteria for a given project.
2. **Perform RoB Assessment**: Performs a Risk of Bias assessment on a study.
3. **Search Literature**: Searches literature databases (PubMed, OpenAlex) based on a query.
4. **Generate Search Strings**: Generates database-specific search strings from a project's PICO framework.

## Authentication (BYOK & Subscriptions)

Users must provide their RadExtract API key (which represents their subscription) when calling these tools. The MCP server uses this key to authenticate with the RadExtract backend API.

## Usage

### Standard MCP (stdio)

Run the server using stdio for clients like Claude Desktop or Cursor:

```bash
node index.js
```

### SSE Server

Run the server using Server-Sent Events (SSE) by setting `MCP_TRANSPORT=sse`:

```bash
MCP_TRANSPORT=sse PORT=3001 node index.js
```

The SSE server will be available at `http://localhost:3001/sse`.

## OpenAPI Schema for ChatGPT Custom GPTs

To integrate with ChatGPT Custom GPTs, use the provided `openapi.yaml` schema. This schema maps the MCP tool capabilities to standard REST endpoints.
