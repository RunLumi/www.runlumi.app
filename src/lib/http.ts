export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) {
    const fetchSite = request.headers.get("Sec-Fetch-Site");
    return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  }
  return origin === new URL(request.url).origin;
}

export function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export function badRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
