/**
 * The worker's route table. Kept as a plain `Request -> Response` function
 * (rather than wired into the server) so routing is unit-testable without
 * binding a port.
 *
 * Three surfaces, and they have different callers:
 *  - `GET  /health`        — Cloud Run's startup/liveness probe.
 *  - `POST /ingest/clerk`  — Clerk's webhook sender. Verify the svix signature,
 *                            record the raw event, enqueue a Cloud Task.
 *  - `POST /tasks/:type`   — Cloud Tasks delivering a job back to us. Runs the
 *                            registered handler for that job type.
 *
 * The webhook source is named in the path rather than sniffed from headers.
 * Signature verification is inherently per-source (Clerk signs with svix; a
 * future Stripe or Twilio would each bring their own scheme and secret), so the
 * source has to be known *before* anything is authenticated. Encoding it in the
 * route keeps that unambiguous. Clerk is the only source today; a second one
 * adds a sibling path plus its own verifier, and does not disturb this one.
 *
 * Nothing here reads the body yet. When /ingest/clerk lands it must use the
 * *raw* bytes exactly as received (`await request.text()`, never a re-serialized
 * JSON.parse round-trip) — svix signs the byte sequence, so any reformatting
 * breaks verification.
 */

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const notImplemented = (surface: string): Response =>
  json({ error: `${surface} is not implemented yet` }, 501);

export async function handleRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const { method } = request;

  if (method === "GET" && pathname === "/health") {
    return json({ status: "ok" }, 200);
  }

  if (method === "POST" && pathname === "/ingest/clerk") {
    return notImplemented("Clerk webhook ingestion");
  }

  if (method === "POST" && pathname.startsWith("/tasks/")) {
    return notImplemented("job execution");
  }

  return json({ error: "Not found" }, 404);
}
