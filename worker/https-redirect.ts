export function redirectHttpToHttps(request: Request): Response | undefined {
  const url = new URL(request.url);
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || isLoopback) return undefined;

  url.protocol = "https:";
  return Response.redirect(url, 308);
}
