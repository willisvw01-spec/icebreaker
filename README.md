# 🏒 ICEBREAKER

A live-lobby NHL roster draft. Create a room, share the 4-letter code, and a
group drafts under a spinning franchise roll — pick a player and he's gone for
everyone. When the clock hits zero, every team plays a single-elimination
bracket and someone takes the cup. This year's active players, this year's
regular-season numbers, playoffs excluded.

Think *NHL dynasty mode* — but in a browser, multiplayer, and way faster.

---

## How it works

- **Lobby** — one person creates a room, others join with the code.
- **Draft** — each turn you're rolled a random NHL franchise and must pick one
  of *their* available players to fill an open roster slot (LW, C, RW, LD, RD, G).
  The pool is shared: once a player is taken, he's gone for everyone.
- **Clock** — a shared, server-controlled timer. Unfilled slots auto-fill with
  best-available when it expires, so a draft never stalls.
- **Reveal** — rosters play a seeded single-elimination bracket. Real hockey
  scores, occasional upsets, one champion.


## Lobby & bots

A bracket is always **16 teams**. Real people join with the room code and hit
**Ready up**; once at least `MIN_HUMANS` (default 2) are ready, the host can
start. Any empty seats fill with **funny AI drafters** (e.g. "Tage Against the
Machine", "Drunk Dahlin") who pick instantly and automatically. Each human pick
has a **45-second clock**; if it runs out, the best available player is
auto-picked. The bracket sim includes Bigfoot play-by-play and chaotic events.

Config (env vars, all optional):
- `PORT` — set by host automatically
- `MIN_HUMANS` — real people who must ready up before start (default 2)
- `PICK_SECONDS` — per-pick clock (default 45)

## Data

The player pool is **baked in** as a static file (`pool.json`) — the full
2025-26 NHL regular season (skaters + goalies, playoffs excluded), 1,038
players across all 32 teams. The season is final, so the numbers never change;
there's no live API call and nothing to break on deploy. Traded players are
listed under the team they finished the season with.

If you ever want to rebuild it for a future season, re-pull the two NHL Stats
API summaries (skater + goalie, `gameTypeId=2`) and regenerate `pool.json`.

## Run locally

```bash
npm install
npm start            # http://localhost:3000
```

Run the test suite:

```bash
npm test             # data layer + bracket invariants + server/client contract
```

## Deploy

This is a Node app with websockets, so it needs a host that runs a process
(not a static host like Netlify). All of these have free tiers:

### Railway (easiest)
1. Push this folder to a GitHub repo.
2. railway.app → New Project → Deploy from GitHub repo → pick the repo.
3. Railway auto-detects Node, runs `npm start`. Done.
4. Under Settings → Networking, generate a public domain.

### Render
1. Push to GitHub.
2. render.com → New → Web Service → connect the repo.
3. Build command `npm install`, start command `npm start`.
4. Deploy.

### Fly.io
1. Install flyctl, `fly launch` in this folder (accept Node detection).
2. `fly deploy`.

The server reads `PORT` from the environment (hosts set this automatically) and
serves both HTTP and websockets on the same port, so nothing else needs config.

## First-deploy checklist
- [ ] Open the site, create a lobby, join from a second device/tab.
- [ ] Spin a few teams — names/stats are real 2025-26 (spot-check vs NHL.com if you like).
- [ ] Run a full draft with 3–4 people and watch the bracket reveal.
- [ ] Tune scoring in `nhl.js` → `rate()` if the winner feels arbitrary.

## Files
- `server.js` — lobby, shared pool, timer, franchise rolls, bracket sim
- `nhl.js` — live data fetch + scoring (the `rate()` function is the one knob to tune)
- `pool.json` — the baked-in 2025-26 player pool (real data)
- `botnames.js` — funny AI-drafter name generator
- `commentary.js` — Bigfoot game summaries + chaos events
- `events.js` — funny period-by-period play-by-play (names real drafted players)
- `public/index.html` — the front end
- `test-*.js`, `audit.js` — the test suite

---

Independent fan project. Not affiliated with the NHL or NHLPA.
