const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { z } = require("zod");
require('dotenv').config();

const API_BASE_URL = process.env.RADEXTRACT_API_URL || "http://localhost:8000/api";

const server = new McpServer({
    name: "radextract",
    version: "1.0.0",
});

// Helper for calling RadExtract API
async function callApi(endpoint, method = "GET", data = null, apiKey) {
    try {
        const response = await axios({
            method,
            url: `${API_BASE_URL}${endpoint}`,
            data,
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });
        return response.data;
    } catch (error) {
        throw new Error(`API Error: ${error.response?.data?.detail || error.message}`);
    }
}


// --- Tools ---

// 1. Get Project PICO
server.tool(
    "get_project_pico",
    {
        project_id: z.string().describe("The ID of the project"),
        api_key: z.string().describe("The user's RadExtract API key / subscription token")
    },
    async ({ project_id, api_key }) => {
        try {
            const project = await callApi(`/projects/${project_id}/pico`, "GET", null, api_key);
            return {
                content: [{ type: "text", text: JSON.stringify(project, null, 2) }]
            };
        } catch (e) {
            return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
    }
);

// 2. Perform RoB Assessment
server.tool(
    "perform_rob_assessment",
    {
        project_id: z.string().describe("The project ID"),
        study_id: z.string().describe("The study ID to assess"),
        tool_id: z.string().describe("The Risk of Bias tool to use (e.g. rob2, robins_i, quadas_2)"),
        api_key: z.string().describe("The user's RadExtract API key")
    },
    async ({ project_id, study_id, tool_id, api_key }) => {
        try {
            const res = await callApi(`/projects/${project_id}/studies/${study_id}/auto-assess?tool_id=${tool_id}`, "POST", null, api_key);
            return {
                content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
            };
        } catch (e) {
            return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
    }
);

// 3. Search Literature
server.tool(
    "search_literature",
    {
        query: z.string().describe("The search query string"),
        sources: z.array(z.string()).optional().describe("Sources to search, e.g. ['pubmed', 'openalex']"),
        max_per_source: z.number().optional().describe("Max results per source"),
        api_key: z.string().describe("The user's RadExtract API key")
    },
    async ({ query, sources = ["pubmed", "openalex"], max_per_source = 15, api_key }) => {
        try {
            const data = { query, sources, max_per_source };
            const res = await callApi(`/search/multi-database`, "POST", data, api_key);
            return {
                content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
            };
        } catch (e) {
            return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
    }
);


// 4. Generate Search String
server.tool(
    "generate_search_strings",
    {
        project_id: z.string().describe("Project ID to generate search strings for"),
        api_key: z.string().describe("The user's RadExtract API key")
    },
    async ({ project_id, api_key }) => {
        try {
            const res = await callApi(`/projects/${project_id}/search-strings/generate`, "POST", null, api_key);
            return {
                content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
            };
        } catch (e) {
            return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
    }
);


async function main() {
    const transportType = process.env.MCP_TRANSPORT || "stdio";

    if (transportType === "stdio") {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("RadExtract MCP Server running on stdio");
    } else if (transportType === "sse") {
        const app = express();
        app.use(cors());

        let transports = new Map();
        let nextSessionId = 0;

        app.get("/sse", async (req, res) => {
            const sessionId = nextSessionId++;
            const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
            transports.set(String(sessionId), transport);
            await server.connect(transport);

            res.on('close', () => {
                transports.delete(String(sessionId));
            });
        });

        app.post("/messages", async (req, res) => {
            const sessionId = req.query.sessionId;
            const transport = transports.get(sessionId);
            if (transport) {
                await transport.handlePostMessage(req, res);
            } else {
                res.status(500).send("SSE transport not initialized or session expired");
            }
        });

        const port = process.env.PORT || 3001;
        app.listen(port, () => {
            console.log(`RadExtract MCP Server running on SSE at http://localhost:${port}/sse`);
        });
    }
}

main().catch(console.error);
