// figma-mcp — MCP server (stdio): Figma design access via the REST API + a Personal Access Token.
// Use this instead of the remote Figma MCP (https://mcp.figma.com/mcp), which 403s any client
// not on Figma's catalog (Cursor/VS Code/Claude Code/Codex/Xcode) — Junie is not listed.
import { Server } from "npm:@modelcontextprotocol/sdk@1.29.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.29.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "npm:@modelcontextprotocol/sdk@1.29.0/types.js";

import { Handlers, TOOL_DEFS } from "./figma.ts";

const server = new Server(
  { name: "figma-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOL_DEFS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req: CallToolRequest) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  const handler = Handlers[name];
  if (!handler) {
    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  try {
    const result = await handler(args);
    return {
      content: [
        {
          type: "text" as const,
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    };
  }
});

await server.connect(new StdioServerTransport());
