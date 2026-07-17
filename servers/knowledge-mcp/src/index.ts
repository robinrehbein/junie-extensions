// knowledge-mcp — MCP server (stdio) for cross-session distilled knowledge.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
  // Own-property check: a synthetic name like "constructor" must fall through to Unknown
  // tool instead of resolving to an Object.prototype member.
  const handler = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : undefined;
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

// Checkpoint/close the SQLite DB on shutdown so no -wal/-shm files linger.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  Deno.addSignalListener(sig, () => {
    try {
      store.close();
    } catch { /* already closed */ }
    Deno.exit(0);
  });
}
