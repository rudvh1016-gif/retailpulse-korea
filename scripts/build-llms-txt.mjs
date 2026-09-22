/**
 * Writes `/llms.txt` into the built asset directory.
 *
 * The content — and the evidence about what the file is actually worth — lives
 * in `lib/llms-txt.ts`, which is a pure function so it can be unit-tested.
 * This script is only the part that cannot be: reading the deployment stage
 * and putting bytes on disk.
 *
 * Staging writes nothing, for the same reason `app/robots.ts` answers
 * `Disallow: /` there: a staging origin must not advertise itself. Note the
 * consequence — CI builds as staging, so CI never produces this artifact, and
 * `tests/llms-txt.test.mjs` rather than the build is what proves the content
 * is right.
 *
 * Run by scripts/build-verified.sh after the vinext build, because it writes
 * into dist/client, which that build creates.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const { isStagingDeployment } = await import(join(repositoryRoot, "app", "seo-config.ts"));
if (isStagingDeployment) {
  console.log("llms.txt: staging build, nothing written.");
  process.exit(0);
}

const { buildLlmsTxt } = await import(join(repositoryRoot, "lib", "llms-txt.ts"));
const body = buildLlmsTxt();
const outputDirectory = join(repositoryRoot, "dist", "client");
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(outputDirectory, "llms.txt"), body, "utf8");
console.log(`llms.txt: ${body.length} characters written to dist/client/llms.txt`);
