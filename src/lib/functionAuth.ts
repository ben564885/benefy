// Shared-secret check for the /api/functions/* routes. These endpoints are the
// HTTP surface a deployed DigitalOcean Function relays to (see
// GRADIENT_SETUP.md §1/§8) — the DO Function itself is the thing an agent's
// tool call actually reaches; this route is what it calls in turn to run the
// real deterministic engine/store. Not meant to be publicly callable.

export function checkFunctionAuth(request: Request): Response | null {
  const secret = process.env.FUNCTIONS_SHARED_SECRET;
  if (!secret) return null; // no secret configured — allow (local dev)
  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
