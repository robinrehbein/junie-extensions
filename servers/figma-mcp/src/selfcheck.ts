// Runnable self-check: validates Figma URL parsing (the part that breaks) offline, plus an
// optional live smoke test when FIGMA_TOKEN + FIGMA_SELFTEST_URL are set.
// Run: deno task selfcheck   (or: deno run -A src/selfcheck.ts)
import { Handlers, parseFigmaUrl } from "./figma.ts";

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failures++;
    console.error(`  ✗ FAIL: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}
function eq<T>(got: T, want: T, msg: string): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(
      `  ✗ FAIL: ${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`,
    );
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

console.log("\n[1] parse a /design/ URL with a dash node-id (the canonical paste)");
eq(
  parseFigmaUrl(
    "https://www.figma.com/design/oZbZewuJDrJLXBBKgXLKVb/Noah---Mobile-App-%F0%9F%93%B1?node-id=1123-747&m=dev",
  ),
  { fileKey: "oZbZewuJDrJLXBBKgXLKVb", nodeIds: ["1123:747"] },
  "extracts file key and normalizes the dash node-id to a colon",
);

console.log("\n[2] /file/ route with an already-colon node-id");
eq(
  parseFigmaUrl("https://figma.com/file/abcdefghij1/Title?node-id=1:2"),
  { fileKey: "abcdefghij1", nodeIds: ["1:2"] },
  "supports /file/ route and leaves a colon node-id unchanged",
);

console.log("\n[3] url-encoded colon (%3A) in node-id");
eq(
  parseFigmaUrl("https://www.figma.com/design/KEY12345678/T?node-id=10%3A20"),
  { fileKey: "KEY12345678", nodeIds: ["10:20"] },
  "decodes %3A and returns 10:20",
);

console.log("\n[4] multiple comma-separated nodes");
eq(
  parseFigmaUrl("https://www.figma.com/design/KEY12345678/T?node-id=1:2,3:4"),
  { fileKey: "KEY12345678", nodeIds: ["1:2", "3:4"] },
  "splits multiple node ids",
);

console.log("\n[5] /proto/ route");
eq(
  parseFigmaUrl("https://www.figma.com/proto/KEY12345678/T?node-id=5-6"),
  { fileKey: "KEY12345678", nodeIds: ["5:6"] },
  "supports /proto/ route",
);

console.log("\n[6] missing node-id yields an empty list (no crash)");
eq(
  parseFigmaUrl("https://www.figma.com/design/KEY12345678/Title?m=design"),
  { fileKey: "KEY12345678", nodeIds: [] },
  "no node-id → empty nodeIds",
);

console.log("\n[7] bare-domain (no scheme) is tolerated");
eq(
  parseFigmaUrl("www.figma.com/design/KEY12345678/T?node-id=7-8"),
  { fileKey: "KEY12345678", nodeIds: ["7:8"] },
  "prepends https:// for a scheme-less figma.com URL",
);

console.log("\n[8] malformed / non-Figma URLs throw");
let garbage = false;
try {
  parseFigmaUrl("not a url at all");
} catch {
  garbage = true;
}
assert(garbage, "garbage string throws");
let badHost = false;
try {
  parseFigmaUrl("https://example.com/design/KEY12345678/T?node-id=1:2");
} catch {
  badHost = true;
}
assert(badHost, "non-Figma host throws");

console.log("\n[9] get_figma_design rejects a URL without a node-id (no network call)");
let designErr = "";
try {
  await Handlers.get_figma_design({ url: "https://www.figma.com/design/KEY12345678/T" });
} catch (e) {
  designErr = (e as Error).message;
}
assert(
  /node-id/i.test(designErr),
  "missing node-id raises a helpful node-id error before any fetch",
);

// Optional live smoke test — only runs if an operator wired real credentials.
const token = Deno.env.get("FIGMA_TOKEN");
const liveUrl = Deno.env.get("FIGMA_SELFTEST_URL");
if (token && liveUrl) {
  console.log(
    "\n[live] get_figma_design against a real file (FIGMA_TOKEN + FIGMA_SELFTEST_URL set)",
  );
  try {
    const res = await Handlers.get_figma_design({ url: liveUrl, depth: 1 }) as Record<
      string,
      unknown
    >;
    assert(res && typeof res.nodes === "object", "live response has a `nodes` map");
  } catch (e) {
    failures++;
    console.error(`  ✗ FAIL: live fetch threw: ${(e as Error).message}`);
  }
} else {
  console.log(
    "\n[live] skipped (set FIGMA_TOKEN + FIGMA_SELFTEST_URL=<figma url> to enable a real end-to-end fetch)",
  );
}

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) FAILED`);
  Deno.exit(1);
}
console.log("✅ all figma-mcp self-checks passed");
