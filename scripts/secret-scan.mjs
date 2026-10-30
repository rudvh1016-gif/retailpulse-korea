import { execFileSync, spawnSync } from "node:child_process";

const patterns = [
  "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
  "AIza[0-9A-Za-z_-]{30,}",
  "sk-[A-Za-z0-9_-]{20,}",
  "gh[pousr]_[A-Za-z0-9]{30,}",
  "(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|SERVICE_KEY|API_KEY)\\s*=\\s*[^$<{][^\\s]{12,}",
];

const revisions = execFileSync("git", ["rev-list", "--all"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const findings = [];
// git grep ORs repeated -e expressions. Keep the exact patterns, binary/path
// exclusions, untracked coverage and full revision list, but read every tree
// once instead of once per pattern (653 seconds in main CI on 2026-10-30).
const expressions = patterns.flatMap(pattern => ["-e", pattern]);
const paths = ["--", ".", ":!package-lock.json", ":!scripts/secret-scan.mjs"];
const current = spawnSync("git", ["grep", "--untracked", "-I", "-l", "-E", ...expressions, ...paths], { encoding: "utf8" });
if (![0, 1].includes(current.status ?? 2)) throw new Error(current.stderr || "secret scan failed");
if (current.status === 0) findings.push("working tree");

for (const revision of revisions) {
  const historical = spawnSync("git", ["grep", "-I", "-l", "-E", ...expressions, revision, ...paths], { encoding: "utf8" });
  if (![0, 1].includes(historical.status ?? 2)) throw new Error(historical.stderr || "history secret scan failed");
  if (historical.status === 0) {
    findings.push(`history commit ${revision.slice(0, 12)}`);
    break;
  }
}

if (findings.length) {
  console.error("Potential secret material found. Values are intentionally not printed:");
  for (const location of findings) console.error(`- ${location} matched a high-confidence credential pattern`);
  process.exit(1);
}

console.log("Secret scan passed: no high-confidence credential patterns found in the working tree or reachable Git history.");
