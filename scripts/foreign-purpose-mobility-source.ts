import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  parseLatestPurposeMobilityPublication,
  type ForeignPurposeMobilitySource,
  type PurposeMobilityPublication,
} from "../lib/foreign-purpose-mobility";

const execFileAsync = promisify(execFile);
const DATASET_PAGE = "https://data.seoul.go.kr/dataList/OA-22378/F/1/datasetView.do";
const DOWNLOAD_ENDPOINT = "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false";
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_CSV_BYTES = 32 * 1024 * 1024;

function execFileBuffer(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "buffer", maxBuffer: MAX_CSV_BYTES }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout as Buffer);
    });
  });
}

async function fetchBounded(url: string, init: RequestInit, maxBytes: number): Promise<Uint8Array> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`official_download_http_${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`official_download_too_large:${declared}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`official_download_too_large:${bytes.byteLength}`);
  return bytes;
}

function latestDailyEntry(entries: string[], publicationId: string): string {
  const matching = entries.filter((entry) => new RegExp(
    `(?:^|/)seoul_purpose_admdong1_forn_${publicationId}\\d{2}\\.csv$`, "i",
  ).test(entry));
  const latest = matching.sort((a, b) => b.localeCompare(a))[0];
  if (!latest) throw new Error("official_daily_csv_not_found");
  return latest;
}

export function createForeignPurposeMobilitySource(): ForeignPurposeMobilitySource {
  return {
    async discoverLatest(): Promise<PurposeMobilityPublication> {
      const bytes = await fetchBounded(DATASET_PAGE, { headers: { accept: "text/html" } }, 4 * 1024 * 1024);
      return parseLatestPurposeMobilityPublication(new TextDecoder("utf-8").decode(bytes));
    },

    async loadLatestCsv(publication: PurposeMobilityPublication): Promise<string> {
      const form = new URLSearchParams({
        infId: publication.datasetId,
        infSeq: publication.infSeq,
        seq: publication.sequence,
      });
      const archive = await fetchBounded(DOWNLOAD_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/zip" },
        body: form,
      }, MAX_ARCHIVE_BYTES);
      const workspace = await mkdtemp(join(tmpdir(), "koretail-oa22378-"));
      const archivePath = join(workspace, "official.zip");
      const csvPath = join(workspace, "latest.csv");
      try {
        await writeFile(archivePath, archive);
        const listed = await execFileAsync("unzip", ["-Z1", archivePath], { maxBuffer: 2 * 1024 * 1024 });
        const entry = latestDailyEntry(String(listed.stdout).split(/\r?\n/).filter(Boolean), publication.publicationId);
        await writeFile(csvPath, await execFileBuffer("unzip", ["-p", archivePath, entry]));
        const bytes = await readFile(csvPath);
        if (bytes.byteLength > MAX_CSV_BYTES) throw new Error(`official_csv_too_large:${bytes.byteLength}`);
        // The Korean nationality label is not part of aggregation identity or
        // display. windows-949 decoding preserves the provider's file shape;
        // malformed labels cannot merge or duplicate aggregate rows.
        return new TextDecoder("euc-kr", { fatal: false }).decode(bytes);
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  };
}
