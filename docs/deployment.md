# Deployment

The website is a Vite static build. Cloudflare can host the complete game,
including friend rooms and practice rankings. PartyKit and Node.js are
alternative hosting options.
Use your own hosting accounts and service addresses when you deploy a fork.

## Link previews

`index.html` includes Open Graph and X large-image card tags. The shared image
is `public/og-image.jpg` (1200 × 630 JPEG). Update the canonical URL, `og:url`,
and both image URLs in `index.html` when you deploy to a different domain.
These tags must use absolute public HTTPS URLs. Hash-based game links share
the same card. Preview services can cache old cards after a deployment.

## Before deployment

Use Node.js 24.x and the committed lockfile:

```sh
npm ci
npm test
npm run build
```

Copy `.env.production.example` to `.env.production.local` for local production
builds, or set those values in the website host's dashboard. Do not commit
credentials, local environment files, SQLite data, or PartyKit local storage.
`VITE_` variables are public build settings. Change them before building and
rebuild after every change.

## Cloudflare: the complete game (live deployment)

The live game is at <https://flipbuddies.vladpalacio.com/>. One Worker serves
the static files, routes WebSockets to one Durable Object per room, and routes
`/api/*` to a practice ranking Durable Object. Both classes use SQLite storage.
No PartyKit service, Node.js server, or separate database is needed in production.

```sh
npx wrangler login
npm run types:cloudflare
npm run check:cloudflare
npm run dev:cloudflare
```

Open the local address printed by Wrangler (usually `http://localhost:8787`).
In another terminal, run `npx tsx scripts/smoke-cloudflare.ts` to test actual
WebSockets, moves, reconnects, and practice storage. This creates local test data.

For your own fork, change the Worker name and custom domain in `wrangler.jsonc`.
Your domain must be in your Cloudflare account. If you have several accounts,
set `CLOUDFLARE_ACCOUNT_ID` to the account that owns that domain. Then run:

```sh
npm run deploy:cloudflare
```

Wrangler creates the two Durable Object namespaces and attaches the custom
domain with HTTPS. Keep the migration history in `wrangler.jsonc`; new changes
need new migration tags. Do not rename existing classes or bindings without a
migration plan, as they identify saved data.

The Cloudflare build forces rooms and rankings to use the current website
origin. It overrides local `VITE_PARTYKIT_HOST` and `VITE_LEADERBOARD_URL` values,
so the same build works locally and on your custom domain. The standard
`npm run build` still uses the normal Vite settings for other hosts.

Workers and SQLite Durable Objects have free usage allowances. Static asset
requests are free. Room sockets use the standard WebSocket API to preserve the
existing session state, so open rooms consume Durable Object duration even
between moves. Free limits are shared across your account. Check usage before
you promote the game to a large audience; free hosting is not unlimited.
See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Cloudflare starts with its own ranking data. Existing PartyKit or local SQLite
records are not copied automatically. The live smoke test can check rooms and
read the API with `npx tsx scripts/smoke-cloudflare.ts https://YOUR-DOMAIN`.
It does not write practice rankings on a remote host unless you add
`--write-practice`. Room checks create a temporary private room that expires.

## Alternative 1: PartyKit hosts the complete game

1. Sign in with `npx partykit login`.
2. Choose a project name in `partykit.json`. Keep the `main` and `parties`
   entries: they register friend rooms and the practice API.
3. Run `npx partykit deploy` to deploy the services. Save the host printed by
   the CLI, such as `my-game.my-account.partykit.dev`.
4. Set these values in `.env.production.local`, using that host:

   ```dotenv
   VITE_PARTYKIT_HOST=my-game.my-account.partykit.dev
   VITE_LEADERBOARD_URL=
   ```

5. Run `npm run build`, then `npm run deploy:multiplayer`.

The last command uploads `dist/` with `--serve dist`. The website and `/api`
share one origin, so no additional allowed origin is needed. The local Node
server and a separate database service are not required.

## Alternative 2: Vercel website with PartyKit services

First deploy your PartyKit services as described in steps 1–3 above. Then import
your repository into Vercel and use these settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | Repository root |
| Node.js | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |

Set these public environment variables in Vercel for your production build.
Replace the example host with your own:

```dotenv
VITE_PARTYKIT_HOST=my-game.my-account.partykit.dev
VITE_LEADERBOARD_URL=https://my-game.my-account.partykit.dev/parties/practice/global
```

The ranking URL must include `/parties/practice/global`. Do not add `/api`:
the client adds it. Using only the PartyKit origin will fail because its main
`/api` route accepts only requests from its own website. The direct practice
route accepts the additional origin configured below.

Choose the final Vercel or custom website address. In the PartyKit project, run:

```sh
npx partykit env add ALLOWED_ORIGIN
```

At the prompt, enter the exact origin, such as `https://my-game.vercel.app`.
Include `https://`, with no path or trailing slash. Then apply the setting:

```sh
npx partykit deploy
```

Deploy the Vercel website after its build settings are in place. Vercel serves
the website; it does not run `npm start` or deploy the PartyKit code. No page
rewrite is needed because this app uses hash routes such as `/#play` and
`/#multiplayer/ABC234`.

### Preview deployments and custom domains

`ALLOWED_ORIGIN` currently permits one additional exact origin. A unique Vercel
preview address is different from the production address. Use a separate
PartyKit deployment for a preview, or add an explicit origin list in the service
before you support several website addresses. When you change your production
domain, update this setting and redeploy PartyKit.

No new database is needed for this arrangement. The existing practice service
uses PartyKit storage. Local SQLite records are not copied into it.

## Node.js hosting

For a host with a persistent filesystem, build the website and run `npm start`.
It serves the website and SQLite ranking API on port 3001 by default. Configure
`PORT`, `DATABASE_PATH`, and `ALLOWED_ORIGIN` in the server environment. Keep
friend rooms on PartyKit and set `VITE_PARTYKIT_HOST` before building.

See [server setup](../server/README.md) for persistence and backup details.
Do not use the local SQLite file as persistent storage on a static Vercel site.

## Check the deployed game

1. Open the home page and play a CPU move. Confirm that the CPU replies.
2. Reload and confirm that the match is restored.
3. Open rankings. A new installation can show an empty board without an error.
4. Complete a CPU match and confirm that it appears once in practice rankings.
5. Open two separate browser profiles. Create a friend room, join its invite,
   mark both players ready, and play a move from each side.
6. Reload one player within 60 seconds. Confirm the same seat and board return.
7. Check the game on a phone and check the music controls after user input.

| Symptom | Check |
| --- | --- |
| Friend rooms show a setup message | Set `VITE_PARTYKIT_HOST`, then rebuild |
| Rankings fail or report a CORS error | Use the direct practice URL and set the exact `ALLOWED_ORIGIN` on PartyKit |
| Rankings work in production but fail in a preview | The preview origin needs its own allowed-origin setup |
| A second tab reuses the first player's seat | Use a separate browser profile or device |
| Local rankings fail | Start the Node server and check port 3001 |
| A local invite fails on another device | Use the development computer's network address; ports 5173 and 1999 must be reachable |

## References

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [PartyKit deployment](https://docs.partykit.io/guides/deploying-your-partykit-server/)
- [PartyKit environment variables](https://docs.partykit.io/guides/managing-environment-variables/)
- [PartyKit request routing](https://docs.partykit.io/reference/partyserver-api/#static-onfetch)
