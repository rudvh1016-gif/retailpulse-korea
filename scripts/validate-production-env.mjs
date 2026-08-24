const rawOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim();

if (!rawOrigin) {
  console.error("NEXT_PUBLIC_SITE_ORIGIN is required for a production build.");
  process.exit(1);
}

let origin;
try {
  origin = new URL(rawOrigin);
} catch {
  console.error("NEXT_PUBLIC_SITE_ORIGIN must be an absolute URL.");
  process.exit(1);
}

if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
  console.error("NEXT_PUBLIC_SITE_ORIGIN must be an HTTPS origin without a path, query, or hash.");
  process.exit(1);
}

if (origin.hostname.endsWith("chatgpt.site") || origin.hostname === "localhost") {
  console.error("Production origin must be the user-owned public domain, not chatgpt.site or localhost.");
  process.exit(1);
}

console.log(`Production origin validated: ${origin.origin}`);
