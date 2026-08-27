export function redirectHttpToHttps(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.protocol !== "http:") return undefined;

  url.protocol = "https:";
  return Response.redirect(url, 308);
}
