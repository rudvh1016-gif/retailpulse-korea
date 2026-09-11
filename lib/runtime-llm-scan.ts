/**
 * Proof that nothing in this product calls a language model at runtime.
 *
 * The claim `RUNTIME_LLM_CALLS = 0` is the kind of statement that is easy to
 * write and hard to keep true — one helpful dependency or one "just summarise
 * this" call breaks it silently, and a zero-cost project that starts paying per
 * token is no longer the product that was designed. So the claim is mechanised.
 *
 * Development-time use of a model (this session, writing this file) is NOT in
 * scope and is explicitly allowed. What is forbidden is a model call in code
 * that runs in production: a collector, a Worker handler, an API route.
 *
 * Pure by design — the caller supplies the files, so the rules are testable
 * against fixtures and the same function checks the real tree.
 */

/** Dependency names that would make a runtime model call possible. */
export const FORBIDDEN_RUNTIME_LLM_DEPENDENCIES = [
  "openai",
  "@anthropic-ai/sdk",
  "@anthropic-ai/bedrock-sdk",
  "@anthropic-ai/vertex-sdk",
  "@google/generative-ai",
  "@google-cloud/aiplatform",
  "cohere-ai",
  "@huggingface/inference",
  "replicate",
  "langchain",
  "@langchain/core",
  "llamaindex",
  "ai",
] as const;

/**
 * Patterns that indicate a model call in code rather than in prose.
 *
 * Each is anchored on something that can only be an endpoint or a binding
 * invocation. A bare word like "claude" is deliberately NOT here: this
 * repository's comments, docs and commit trail mention Claude constantly, and a
 * scanner that flags the word would be turned off within a day.
 */
export const RUNTIME_LLM_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "openai_api_endpoint", pattern: /api\.openai\.com/i },
  { name: "anthropic_api_endpoint", pattern: /api\.anthropic\.com/i },
  { name: "google_generative_endpoint", pattern: /generativelanguage\.googleapis\.com/i },
  { name: "cohere_api_endpoint", pattern: /api\.cohere\.(ai|com)/i },
  { name: "huggingface_inference_endpoint", pattern: /api-inference\.huggingface\.co/i },
  { name: "bedrock_endpoint", pattern: /bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com/i },
  // Workers AI is invoked as `env.AI.run(...)` against an `@cf/...` model id.
  { name: "workers_ai_binding", pattern: /\benv\s*\.\s*AI\s*\.\s*run\s*\(/ },
  { name: "workers_ai_model_id", pattern: /["'`]@cf\/[a-z0-9]/i },
  { name: "ai_gateway_endpoint", pattern: /gateway\.ai\.cloudflare\.com/i },
];

export interface ScannedFile {
  path: string;
  content: string;
}

export interface RuntimeLlmFinding {
  path: string;
  rule: string;
  /** The matched text, trimmed — never the surrounding code, never a secret. */
  match: string;
}

export interface RuntimeLlmScanResult {
  offendingDependencies: string[];
  offendingFiles: string[];
  findings: RuntimeLlmFinding[];
  scannedFileCount: number;
  /** Declared exemptions, reported so the exemption is visible, not hidden. */
  exemptedPaths: string[];
}

/**
 * The one file the scanner may not scan: its own pattern table.
 *
 * `RUNTIME_LLM_PATTERNS` necessarily CONTAINS every string it forbids, so
 * scanning this module reports itself — which it did on the first live run. The
 * exemption is therefore unavoidable, and the rule for keeping it safe is that
 * it covers exactly one file, that file holds only regular-expression literals
 * and path predicates, and the list is asserted in
 * tests/operational-harness.test.mjs so a second entry cannot be added quietly.
 *
 * Every scan result reports this list, so a reader always sees what was skipped
 * rather than inferring that nothing was.
 */
export const SELF_EXEMPT_PATHS = ["lib/runtime-llm-scan.ts"] as const;

/**
 * Paths that are build output or test assertions rather than production code.
 *
 * `tests/` is excluded because several suites assert the ABSENCE of these very
 * strings — `assert.doesNotMatch(surface, /api\.openai\.com/)` contains the
 * pattern it forbids, and flagging it would make the two checks mutually
 * exclusive. `dist/` is excluded because it is generated from the sources that
 * are scanned, so scanning it double-counts.
 */
export function isScannableProductionPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (/(^|\/)(node_modules|dist|\.next|\.wrangler|\.playwright-browsers|coverage)\//.test(normalized)) return false;
  if (/(^|\/)tests\//.test(normalized)) return false;
  if (/(^|\/)e2e\//.test(normalized)) return false;
  if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(normalized)) return false;
  return /\.(ts|tsx|mjs|cjs|js|jsx)$/.test(normalized);
}

/**
 * Scans dependencies and production source for runtime model use.
 *
 * `scannedFileCount` is reported so that an empty finding list can be told apart
 * from a scan that never ran. lib/operational-health.ts refuses to print
 * VERIFIED when that count is zero, which is the difference between proof and
 * an absence of evidence.
 */
export function scanForRuntimeLlm(
  files: readonly ScannedFile[],
  dependencyNames: readonly string[],
): RuntimeLlmScanResult {
  const forbidden = new Set<string>(FORBIDDEN_RUNTIME_LLM_DEPENDENCIES);
  const offendingDependencies = [...new Set(dependencyNames.filter((name) => forbidden.has(name)))].sort();

  const findings: RuntimeLlmFinding[] = [];
  const exemptedPaths: string[] = [];
  let scannedFileCount = 0;
  for (const file of files) {
    if (!isScannableProductionPath(file.path)) continue;
    if ((SELF_EXEMPT_PATHS as readonly string[]).includes(file.path)) {
      exemptedPaths.push(file.path);
      continue;
    }
    scannedFileCount += 1;
    for (const rule of RUNTIME_LLM_PATTERNS) {
      const match = rule.pattern.exec(file.content);
      if (match) findings.push({ path: file.path, rule: rule.name, match: match[0].slice(0, 80) });
    }
  }

  return {
    offendingDependencies,
    offendingFiles: [...new Set(findings.map((finding) => finding.path))].sort(),
    findings,
    scannedFileCount,
    exemptedPaths,
  };
}
