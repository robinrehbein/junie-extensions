// knowledge-mcp — MCP server (stdio) for cross-session distilled knowledge.
import { Server } from "npm:@modelcontextprotocol/sdk@1.29.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.29.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "npm:@modelcontextprotocol/sdk@1.29.0/types.js";

import { KnowledgeStore } from "./db.ts";
import { selectEmbedder } from "./embeddings.ts";
import { createHandlers, TOOL_DEFS } from "./tools.ts";

const store = new KnowledgeStore();
const embedder = selectEmbedder();
const handlers = createHandlers(store, embedder);

const server = new Server(
  { name: "knowledge-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOL_DEFS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req: CallToolRequest) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  const handler = handlers[name];
  if (!handler) {
    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  try {
    const result = await handler(args);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    };
  }
});

await server.connect(new StdioServerTransport());
