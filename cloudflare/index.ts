import { DurableObject } from "cloudflare:workers";
import OthelloRoom from "../party/server";
import PracticeRankings from "../party/practice";
import { ROOM_CODE_PATTERN } from "../src/game/protocol";

export class GameRoom extends DurableObject<Env> {
  private game: OthelloRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.game = new OthelloRoom({ id: ctx.id.name ?? "", storage: ctx.storage });
    ctx.blockConcurrencyWhile(() => this.game.onStart());
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return this.game.onRequest();
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // The shared room keeps authenticated sessions in memory. Standard sockets
    // keep that state alive; hibernation would require restoring every session.
    server.accept();
    const connection = {
      id: crypto.randomUUID(),
      send: (data: string | ArrayBuffer | ArrayBufferView) => server.send(data),
      close: (code?: number, reason?: string) => server.close(code, reason),
    };
    const run = (task: Promise<unknown>) => this.ctx.waitUntil(task.catch((error) => {
      console.error("Room event failed", error);
      server.close(1011, "Room unavailable. Reconnect to retry.");
    }));
    server.addEventListener("message", (event) => run(this.game.onMessage(event.data, connection)));
    server.addEventListener("close", () => run(this.game.onClose(connection)));
    server.addEventListener("error", () => run(this.game.onError(connection)));
    await this.game.onConnect(connection);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() { await this.game.onAlarm(); }
}

export class PracticeBoard extends DurableObject<Env> {
  private board: PracticeRankings;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.board = new PracticeRankings({ id: "global", storage: ctx.storage, env: {} }, "cloudflare-sqlite");
  }
  async fetch(request: Request): Promise<Response> { return this.board.onRequest(request); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/")) return env.PRACTICE.getByName("global").fetch(request);
    const room = /^\/parties\/main\/([^/]+)$/.exec(path)?.[1];
    if (room && ROOM_CODE_PATTERN.test(room)) return env.ROOMS.getByName(room).fetch(request);
    if (path.startsWith("/parties/")) return new Response("Room not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
