// Embedding providers: local MiniLM (default, offline) or an OpenAI-compatible API.
// Local uses @huggingface/transformers v3 on the pure-WASM ONNX backend, which runs under Deno
// (the v2 @xenova/transformers package loads native sharp and fails to build under Deno).
import { pipeline, env } from "npm:@huggingface/transformers@3.7.6";

export interface Embedder {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

function home(): string {
  return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
}

// Lazy singleton: loading the model downloads ~25MB on first run, then caches it.
let _extractorPromise: Promise<unknown> | null = null;

async function localExtractor(model: string): Promise<any> {
  if (!_extractorPromise) {
    _extractorPromise = (async () => {
      env.allowLocalModels = false;
      env.cacheDir = `${home()}/.junie/knowledge/models`;
      // ponytail: force the single-thread WASM backend so nothing native loads under Deno
      // (no SharedArrayBuffer/cross-origin isolation needed).
      const e = env as unknown as {
        backends?: { onnx?: { wasm?: { numThreads?: number } } };
      };
      e.backends ??= {};
      e.backends!.onnx ??= {};
      e.backends!.onnx!.wasm ??= {};
      e.backends!.onnx!.wasm!.numThreads = 1;
      const ex = await pipeline("feature-extraction", model, { dtype: "fp32" });
      return ex as unknown as any;
    })();
  }
  return _extractorPromise;
}

export class LocalEmbedder implements Embedder {
  readonly name: string;
  readonly dim = 384;
  constructor(readonly model = "Xenova/all-MiniLM-L6-v2") {
    this.name = `local:${model}`;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const ex = await localExtractor(this.model);
    const out = await ex(texts, { pooling: "mean", normalize: true });
    return out.tolist() as number[][];
  }
}

interface ApiCfg {
  baseURL: string;
  model: string;
  dim: number;
  keyEnv: string;
}

// All three expose an OpenAI-compatible POST {model, input} -> {data[].embedding}.
const API_PROVIDERS: Record<string, ApiCfg> = {
  openai: { baseURL: "https://api.openai.com/v1", model: "text-embedding-3-small", dim: 1536, keyEnv: "OPENAI_API_KEY" },
  voyage: { baseURL: "https://api.voyageai.com/v1", model: "voyage-3-lite", dim: 512, keyEnv: "VOYAGE_API_KEY" },
  zai: { baseURL: "https://api.z.ai/api/paas/v4", model: "embedding-3", dim: 1024, keyEnv: "Z_AI_API_KEY" },
};

export class ApiEmbedder implements Embedder {
  readonly name: string;
  readonly dim: number;
  private model: string;
  constructor(private cfg: ApiCfg, private apiKey: string, modelOverride?: string) {
    this.model = modelOverride ?? cfg.model;
    this.name = `api:${this.model}`;
    this.dim = cfg.dim;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.cfg.baseURL}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`${this.cfg.baseURL}/embeddings ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index?: number }>;
    };
    return json.data
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding);
  }
}

export function selectEmbedder(): Embedder {
  const provider = (Deno.env.get("KNOWLEDGE_EMBED_PROVIDER") ?? "local").toLowerCase();
  const modelOverride = Deno.env.get("KNOWLEDGE_EMBED_MODEL");
  if (provider === "local") return new LocalEmbedder(modelOverride ?? "Xenova/all-MiniLM-L6-v2");
  const cfg = API_PROVIDERS[provider];
  if (!cfg) {
    throw new Error(
      `Unknown KNOWLEDGE_EMBED_PROVIDER '${provider}'. Use one of: local | openai | voyage | zai`,
    );
  }
  const apiKey = Deno.env.get(cfg.keyEnv);
  if (!apiKey) {
    throw new Error(`${cfg.keyEnv} is not set (required for provider '${provider}').`);
  }
  return new ApiEmbedder(cfg, apiKey, modelOverride);
}
