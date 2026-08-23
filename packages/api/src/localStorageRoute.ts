import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

const PREFIX = "/local-storage/";

/**
 * Serves and accepts the objects LocalObjectStorage writes, standing in for the
 * signed GCS URLs a deployed environment mints. Mounted ONLY when the
 * environment is local — see index.ts.
 *
 * Returns true when it handled the request, so the caller knows to stop.
 */
export async function handleLocalStorage(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(PREFIX)) {
    return false;
  }

  const key = decodeURIComponent(url.pathname.slice(PREFIX.length));
  // Refuse traversal outside the root even locally — the same key string reaches
  // GCS in production, and a key that escapes here would escape there too.
  const path = normalize(join(root, key));
  if (!path.startsWith(normalize(root))) {
    res.writeHead(400).end("bad key");
    return true;
  }

  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bytes = Buffer.concat(chunks);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    await Bun.write(
      `${path}.meta.json`,
      JSON.stringify({
        contentType: req.headers["content-type"] ?? "application/octet-stream",
        byteSize: bytes.byteLength,
      }),
    );
    res.writeHead(200).end();
    return true;
  }

  try {
    await stat(path);
  } catch {
    res.writeHead(404).end("not found");
    return true;
  }

  const meta = await Bun.file(`${path}.meta.json`).json();
  const filename = url.searchParams.get("filename");
  res.writeHead(200, {
    "content-type": meta.contentType,
    "content-length": String(meta.byteSize),
    ...(filename
      ? { "content-disposition": `attachment; filename="${filename}"` }
      : {}),
  });
  res.end(Buffer.from(await Bun.file(path).bytes()));
  return true;
}
