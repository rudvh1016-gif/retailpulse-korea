export function redirectHttpToHttps(request: Request): Response | undefined {
  const url = new URL(request.url);
  const isLocalPreview = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]"
    || url.hostname === "terminal.local";
  if (url.protocol !== "http:" || isLocalPreview) return undefined;

  url.protocol = "https:";
  return Response.redirect(url, 308);
}
