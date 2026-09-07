import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { RankingStore } from "./store";
import type { Period } from "./store";
import {
  HttpError,
  identifier,
  object,
  playerDetails,
  verifyMatch,
} from "./validation";

const MAX_BODY_BYTES = 8192;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
};

/** null means ignore the range; false means it cannot select any bytes. */
function byteRange(value: string, size: number): { start: number; end: number } | null | false {
  // Multiple ranges are optional in HTTP. Return the full file for these,
  // unknown units, or malformed headers instead of building multipart bodies.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const length = BigInt(size);
  if (length === 0n) return false;
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return false;
    return { start: Number(suffix >= length ? 0n : length - suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return false;
  return { start: Number(start), end: Number(end >= length ? length - 1n : end) };
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  if (
    !(req.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith("application/json")
  ) {
    throw new HttpError(415, "Use application/json.");
  }
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    req.resume();
    throw new HttpError(413, "The request is too large.");
  }
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let failed = false;
    req.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        if (!failed) reject(new HttpError(413, "The request is too large."));
        failed = true;
        chunks.length = 0;
      } else if (!failed) chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "The JSON is not valid."));
      }
    });
    req.on("error", reject);
    req.on("aborted", () =>
      reject(new HttpError(400, "The request ended early.")),
    );
  });
}

function isInside(root: string, path: string) {
  const difference = relative(root, path);
  return (
    difference === "" ||
    (difference !== ".." &&
      !difference.startsWith(`..${sep}`) &&
      !isAbsolute(difference))
  );
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  distPath: string,
): Promise<boolean> {
  let root: string;
  try {
    root = await realpath(distPath);
  } catch {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  if (
    decoded.includes("\0") ||
    decoded.split(/[\\/]/).some((part) => part.startsWith("."))
  )
    throw new HttpError(404, "Page not found.");
  let candidate = resolve(root, `.${decoded}`);
  if (!isInside(root, candidate)) throw new HttpError(404, "Page not found.");
  let file: string;
  try {
    if (!(await stat(candidate)).isFile())
      candidate = resolve(candidate, "index.html");
    file = await realpath(candidate);
  } catch {
    if (extname(decoded)) return false;
    try {
      file = await realpath(resolve(root, "index.html"));
    } catch {
      return false;
    }
  }
  if (!isInside(root, file)) return false;
  const fileInfo = await stat(file);
  if (!fileInfo.isFile()) return false;
  if (res.destroyed) return true;
  const size = fileInfo.size;
  // Range applies only to GET. We emit no validators, so an If-Range
  // condition cannot match and must receive the complete file.
  const range = req.method === "GET" && req.headers.range && !req.headers["if-range"]
    ? byteRange(req.headers.range, size)
    : null;
  const headers = {
    "Content-Type":
      MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control":
      decoded.startsWith("/assets/") && extname(file) !== ".html"
        ? "public, max-age=31536000, immutable"
        : "no-cache",
  };
  if (range === false) {
    res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}`, "Content-Length": 0 });
    res.end();
    return true;
  }
  res.writeHead(range ? 206 : 200, {
    ...headers,
    "Content-Length": range ? range.end - range.start + 1 : size,
    ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {}),
  });
  if (req.method === "HEAD") res.end();
  else {
    const stream = createReadStream(file, range ?? undefined);
    const cancel = () => stream.destroy();
    res.once("close", cancel);
    stream.once("close", () => res.off("close", cancel));
    stream.once("error", () => res.destroy());
    stream.pipe(res);
  }
  return true;
}

export interface AppOptions {
  databasePath?: string;
  distPath?: string;
  allowedOrigin?: string;
  now?: () => number;
}

/** Local CPU games produce practice points. This API is not a competitive match authority. */
export function createApp(options: AppOptions = {}) {
  const store = new RankingStore(
    options.databasePath ?? resolve("data/leaderboard.sqlite"),
  );
  const now = options.now ?? Date.now;
  const distPath = options.distPath ?? resolve("dist");
  const configuredOrigin = options.allowedOrigin?.replace(/\/$/, "");
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin !== configuredOrigin
      )
        throw new Error();
    } catch {
      store.close();
      throw new Error(
        "ALLOWED_ORIGIN must be one explicit HTTP or HTTPS origin.",
      );
    }
  }

  const server = createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        const origin = req.headers.origin;
        // Compare with Host to support same-origin requests through a proxy. An
        // explicit ALLOWED_ORIGIN is needed for a separate client deployment.
        const protocol =
          "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
        const sameOrigin = origin === `${protocol}://${req.headers.host}`;
        if (origin && !sameOrigin && origin !== configuredOrigin)
          throw new HttpError(403, "This origin is not allowed.");
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Vary", "Origin");
        }
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "600",
          });
          res.end();
          return;
        }
        if (url.pathname === "/api/leaderboard" && req.method === "GET") {
          const period = url.searchParams.get("period") ?? "global";
          if (!["global", "weekly", "monthly"].includes(period))
            throw new HttpError(400, "Choose a valid ranking period.");
          json(res, 200, { players: store.rankings(period as Period, now()) });
          return;
        }
        if (url.pathname === "/api/players" && req.method === "POST") {
          const body = object(await readJson(req));
          const { name, styleId } = playerDetails(body);
          json(res, 201, store.createPlayer(name, styleId, now()));
          return;
        }
        if (url.pathname === "/api/matches" && req.method === "POST") {
          const body = object(await readJson(req));
          const playerId = identifier(body.playerId);
          const { name, styleId } = playerDetails(body);
          const authorization = req.headers.authorization;
          if (
            !authorization ||
            !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)
          )
            throw new HttpError(401, "A player token is required.");
          store.authenticate(playerId, authorization.slice(7));
          const match = verifyMatch(body.match);
          const result = store.saveMatch(playerId, name, styleId, match, now());
          json(res, 200, { ok: true, matchId: match.id, ...result });
          return;
        }
        throw new HttpError(404, "API route not found.");
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new HttpError(405, "This method is not allowed.");
      if (await serveStatic(req, res, url.pathname, distPath)) return;
      throw new HttpError(404, "Page not found.");
    })().catch((error: unknown) => {
      if (res.headersSent || res.destroyed) return;
      if (error instanceof HttpError)
        json(res, error.status, { error: error.message });
      else {
        console.error("Ranking request failed:", error);
        json(res, 500, {
          error: "Rankings are not available. Please try again.",
        });
      }
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return {
    server,
    async close() {
      if (server.listening) {
        await new Promise<void>((resolveClose, reject) =>
          server.close((error) => (error ? reject(error) : resolveClose())),
        );
      }
      store.close();
    },
  };
}
