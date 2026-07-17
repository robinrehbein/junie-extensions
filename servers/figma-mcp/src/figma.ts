// Figma REST API helpers + MCP tool handlers/defs. No server boot here — index.ts boots it.
// ponytail: 2 tiny tools share one URL parser + one authed fetcher; no SDK bloat, no models.
const FIGMA_API = "https://api.figma.com";

const FILE_ROUTE_PREFIXES = new Set([
  "design",
  "file",
  "proto",
  "board",
  "slides",
  "slideshare",
]);

const IMAGE_FORMATS = new Set(["png", "jpg", "svg", "pdf"]);

export interface ParsedFigma {
  fileKey: string;
  /** API-form node ids (colon-separated), e.g. ["1123:747"]. Empty if the URL has no node-id. */
  nodeIds: string[];
}

/** Figma share URLs use a dash (`1123-747`); the REST API wants a colon (`1123:747`). */
function normalizeNodeId(raw: string): string {
  return raw.trim().replace(/-/g, ":");
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Parse any Figma share URL into a file key + node ids. Throws on non-Figma / malformed input. */
export function parseFigmaUrl(input: string): ParsedFigma {
  const trimmed = input.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // Tolerate a bare `www.figma.com/...` (no scheme) before giving up.
    try {
      u = new URL("https://" + trimmed);
    } catch {
      throw new Error(`Not a valid URL: ${input}`);
    }
  }
  if (!u.hostname.endsWith("figma.com")) {
    throw new Error(`Not a Figma URL (host was "${u.hostname}"): ${input}`);
  }

  const segs = u.pathname.split("/").filter(Boolean);
  let fileKey = "";
  for (let i = 0; i < segs.length; i++) {
    if (FILE_ROUTE_PREFIXES.has(segs[i]) && segs[i + 1]) {
      fileKey = decodeURIComponent(segs[i + 1]);
      break;
    }
  }
  if (!fileKey && segs.length) fileKey = decodeURIComponent(segs[0]);
  if (!/^[A-Za-z0-9]{8,}$/.test(fileKey)) {
    throw new Error(`Could not find a Figma file key in: ${input}`);
  }

  const nodeIds = (u.searchParams.get("node-id") ?? "")
    .split(",")
    .map(normalizeNodeId)
    .filter((id) => /^\d+(:\d+)+$/.test(id));

  return { fileKey, nodeIds };
}

function getToken(): string {
  const t = Deno.env.get("FIGMA_TOKEN") ?? Deno.env.get("FIGMA_ACCESS_TOKEN");
  if (!t) {
    throw new Error(
      "FIGMA_TOKEN is not set. Create a Personal Access Token at " +
        "Figma → Settings → Account → Personal access tokens, then pass it as the FIGMA_TOKEN env " +
        "var in your MCP server config (mcp.json → mcpServers.figma.env).",
    );
  }
  return t;
}

async function figmaGet<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${FIGMA_API}${pathAndQuery}`, {
    headers: { "X-Figma-Token": getToken() },
  });
  if (res.status === 401) {
    throw new Error("Figma rejected the token (401) — FIGMA_TOKEN is missing or invalid.");
  }
  if (res.status === 403) {
    throw new Error("Figma returned 403 — the token's account can't access this file.");
  }
  if (res.status === 404) {
    throw new Error("Figma returned 404 — wrong file key / node-id, or the file was deleted.");
  }
  if (res.status === 429) {
    throw new Error("Figma rate limit (429) — retry shortly.");
  }
  if (!res.ok) {
    throw new Error(`Figma API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return await res.json();
}

export const Handlers: Record<
  string,
  (args: Record<string, unknown>) => unknown | Promise<unknown>
> = {
  /** Pull the design spec (full node tree) for a Figma frame from its share URL. */
  async get_figma_design(args) {
    const url = str(args.url);
    if (!url) throw new Error("url is required (a Figma design link)");
    const { fileKey, nodeIds } = parseFigmaUrl(url);
    if (!nodeIds.length) {
      throw new Error(
        "No node-id in the URL. In Figma, right-click the frame → 'Copy/paste as' → " +
          "'Copy link to selection' so the URL includes ?node-id=…, then paste that.",
      );
    }
    const q = new URLSearchParams({ ids: nodeIds.join(",") });
    const depth = num(args.depth);
    if (depth) q.set("depth", String(depth));
    return await figmaGet<Record<string, unknown>>(
      `/v1/files/${encodeURIComponent(fileKey)}/nodes?${q}`,
    );
  },

  /** Render a Figma frame to a PNG/SVG/JPG/PDF image URL from its share URL. */
  async get_figma_image(args) {
    const url = str(args.url);
    if (!url) throw new Error("url is required (a Figma design link)");
    const { fileKey, nodeIds } = parseFigmaUrl(url);
    if (!nodeIds.length) {
      throw new Error("No node-id in the URL — copy a link to a specific frame (needs ?node-id=…).");
    }
    // Trust boundary: format + scale are LLM-controlled — validate against the enum and clamp
    // to Figma's supported range before forwarding to the API.
    const format = str(args.format) ?? "png";
    if (!IMAGE_FORMATS.has(format)) {
      throw new Error(`format must be one of: ${[...IMAGE_FORMATS].join(", ")}`);
    }
    const rawScale = num(args.scale) ?? 2;
    const scale = Math.min(4, Math.max(0.01, Number.isFinite(rawScale) ? rawScale : 2));
    const q = new URLSearchParams({
      ids: nodeIds.join(","),
      format,
      scale: String(scale),
    });
    // /v1/images returns { err, images: { [nodeId]: signedUrl | null } } — only `images` is used.
    const data = await figmaGet<{ images: Record<string, string | null> }>(
      `/v1/images/${encodeURIComponent(fileKey)}?${q}`,
    );
    return {
      images: data.images,
      note: "render URLs are signed and expire after ~30 days",
    };
  },
};

export const TOOL_DEFS = [
  {
    name: "get_figma_design",
    description:
      "Fetch the design spec (full node tree: layout, styles, text, fills, components) for a Figma " +
      "frame from its share URL. Use when the user pastes a figma.com link and wants to implement " +
      "or inspect the design. Returns Figma's node JSON — large frames can be big; pass `depth` " +
      "(e.g. 2-4) to cap recursion and keep the payload small.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description:
            "A Figma URL, e.g. https://www.figma.com/design/<key>/<title>?node-id=123-456",
        },
        depth: {
          type: "number",
          description: "Optional max tree depth to keep the response small (try 2-4 for big frames).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_figma_image",
    description:
      "Render a Figma frame (from its share URL) to a PNG/SVG/JPG/PDF image URL. Use to get a " +
      "visual of the design alongside the spec. Returned URLs are signed and expire (~30 days).",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "A Figma URL with ?node-id=…" },
        format: {
          type: "string",
          enum: ["png", "jpg", "svg", "pdf"],
          description: "Output format. Default png.",
        },
        scale: { type: "number", description: "0.01-4, default 2." },
      },
      required: ["url"],
    },
  },
];
