import { lookup } from "node:dns/promises";
import https from "node:https";
import tls from "node:tls";

const host = "apis.data.go.kr";

function elapsed(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function withDeadline(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function diagnoseDns() {
  const startedAt = performance.now();
  try {
    const records = await withDeadline(() => lookup(host, { all: true }), 10_000);
    return { source: "COMMON_GATEWAY", host, stage: "dns", elapsedMs: elapsed(startedAt), classification: records.length ? "PASS" : "REQUEST_ERROR" };
  } catch {
    return { source: "COMMON_GATEWAY", host, stage: "dns", elapsedMs: elapsed(startedAt), classification: "REQUEST_ERROR" };
  }
}

async function diagnoseTls() {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 });
    let settled = false;
    const finish = (classification) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ source: "COMMON_GATEWAY", host, stage: "tls", elapsedMs: elapsed(startedAt), classification });
    };
    socket.once("secureConnect", () => finish("PASS"));
    socket.once("timeout", () => finish("REQUEST_ERROR"));
    socket.once("error", () => finish("REQUEST_ERROR"));
  });
}

async function diagnoseHttp() {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const request = https.request({
      hostname: host,
      port: 443,
      path: "/",
      method: "GET",
      headers: { accept: "application/json", "user-agent": "KORETAIL-bounded-diagnostic" },
      timeout: 30_000,
    });
    let settled = false;
    const finish = (classification, httpStatus = null) => {
      if (settled) return;
      settled = true;
      request.destroy();
      resolve({ source: "COMMON_GATEWAY", host, stage: "http_ttfb", elapsedMs: elapsed(startedAt), classification, httpStatus });
    };
    request.once("response", (response) => {
      response.resume();
      finish("PASS", response.statusCode ?? null);
    });
    request.once("timeout", () => finish("REQUEST_ERROR"));
    request.once("error", () => finish("REQUEST_ERROR"));
    request.end();
  });
}

for (const result of [await diagnoseDns(), await diagnoseTls(), await diagnoseHttp()]) {
  console.log(JSON.stringify(result));
}
