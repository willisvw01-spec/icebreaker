// ICEBREAKER — live-lobby NHL draft. Pass 1 plumbing + minimal game logic.
// Authoritative server: it owns room state, the timer, and the pool.
// Clients never decide anything important — they ask, the server rules.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PICK_SECONDS = Number(process.env.PICK_SECONDS || 45); // per-pick clock
const ROSTER_SLOTS = ["LW", "C", "RW", "LD", "RD", "G"];

// ---- tiny static file server for the client ----
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let f = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const fp = path.join(__dirname, "public", f);
  if (!fp.startsWith(path.join(__dirname, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "text/plain" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const { TEAMS, TEAM_NAMES, buildPool, rate } = require("./nhl.js");

// ---- live player pool, loaded from the NHL API at startup ----
// Flat list; each player tagged with team + slots + rating. Stable ids.
let POOL = [];

async function loadPool() {
  try {
    const byTeam = await buildPool(); // { TEAM: [players] }
    const flat = [];
    let pid = 0;
    for (const team of TEAMS) {
      for (const p of byTeam[team] || []) {
        if (!p.name) continue;
        flat.push({
          id: pid++, name: p.name, team: p.team,
          pos: p.pos, slots: p.slots, rating: rate(p),
          gp: p.gp, ppg: p.ppg, points: p.points,
          savePct: p.savePct, gaa: p.gaa, isGoalie: p.isGoalie,
        });
      }
    }
    if (flat.length) { POOL = flat; console.log(`Loaded ${POOL.length} active players across ${TEAMS.length} teams`); }
    else console.warn("Pool came back empty — API may be unreachable from this host.");
  } catch (e) {
    console.error("Pool load failed:", e.message);
  }
}
loadPool();
setInterval(loadPool, 1000 * 60 * 60 * 6); // refresh stats every 6h

const rooms = new Map(); // code -> room

function code() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

const { generateBotNames } = require("./botnames.js");
const { describeGame, championLine } = require("./commentary.js");
const { periodLines } = require("./events.js");
const { buildBoxScore } = require("./boxscore.js");
const BRACKET_SIZE = 16;
const MIN_HUMANS = Number(process.env.MIN_HUMANS || 2);

function makeRoom() {
  let cd; do { cd = code(); } while (rooms.has(cd));
  const room = {
    code: cd,
    state: "lobby", // lobby -> drafting -> reveal
    players: new Map(), // ws -> {name, roster:{}, ready, connected}
    bots: [],           // [{name, roster:{}, isBot:true}]
    pool: POOL.map(p => ({ ...p, takenBy: null })),
    turnOrder: [],
    turnIdx: 0,
    pickDeadline: null,
    timer: null,
    hb: null,           // lobby heartbeat interval
  };
  rooms.set(cd, room);
  // Heartbeat: every few seconds, re-push the authoritative roster so a single
  // dropped message can't leave anyone's lobby list stale, and prune dead sockets.
  room.hb = setInterval(() => {
    for (const ws of [...room.players.keys()]) {
      if (ws.readyState !== ws.OPEN) {
        // socket is dead but never fired close — clean it up
        const p = room.players.get(ws);
        if (room.state === "lobby") room.players.delete(ws);
        else if (p) p.connected = false;
      }
    }
    if (room.players.size === 0 && room.state === "lobby") { clearInterval(room.hb); rooms.delete(room.code); return; }
    broadcast(room);
  }, 4000);
  return room;
}

// All draft participants (humans + bots) as a uniform list.
function entrants(room) {
  return [...[...room.players.values()], ...room.bots];
}
function findEntrant(room, name) {
  return entrants(room).find(p => p.name === name);
}
// Find the [ws, player] pair for a persistent player id (survives reconnects).
function findByPid(room, pid) {
  if (!pid) return null;
  for (const [ws, p] of room.players) if (p.pid === pid) return [ws, p];
  return null;
}

// Snake draft: round 0 goes 0..N-1, round 1 goes N-1..0, round 2 forward, etc.
// Given a linear pick counter (turnIdx), return the name whose turn it is.
function pickerAt(room, idx) {
  const n = room.turnOrder.length;
  if (n === 0) return null;
  const round = Math.floor(idx / n);
  const pos = idx % n;
  const realPos = (round % 2 === 0) ? pos : (n - 1 - pos); // reverse on odd rounds
  return room.turnOrder[realPos];
}
function isBotName(room, name) {
  return room.bots.some(b => b.name === name);
}

function roomSnapshot(room) {
  const humans = [...room.players.values()];
  // during lobby show humans (with ready state); during draft/reveal show everyone
  const showList = room.state === "lobby"
    ? humans.map(p => ({ name: p.name, connected: p.connected, ready: !!p.ready, isBot: false, picks: 0 }))
    : entrants(room).map(p => ({
        name: p.name, connected: p.connected !== false, ready: true,
        isBot: !!p.isBot, roster: p.roster, picks: Object.keys(p.roster).length,
      }));
  return {
    type: "state",
    code: room.code,
    state: room.state,
    players: showList,
    humanCount: humans.length,
    readyCount: humans.filter(p => p.ready).length,
    minHumans: MIN_HUMANS,
    bracketSize: BRACKET_SIZE,
    pool: room.pool.map(p => ({
      id: p.id, name: p.name, team: p.team, pos: p.pos, slots: p.slots,
      rating: p.rating, gp: p.gp, ppg: p.ppg, points: p.points,
      savePct: p.savePct, gaa: p.gaa, isGoalie: p.isGoalie, takenBy: p.takenBy,
    })),
    currentPicker: room.state === "drafting" ? pickerAt(room, room.turnIdx) : null,
    currentIsBot: room.state === "drafting" ? isBotName(room, pickerAt(room, room.turnIdx)) : false,
    secondsLeft: room.pickDeadline ? Math.max(0, Math.round((room.pickDeadline - Date.now()) / 1000)) : null,
    result: room.result || null,   // include once simulated so no later broadcast wipes it
    turnOrder: room.turnOrder || [], // draft order, for the banner
  };
}

function broadcast(room) {
  const msg = JSON.stringify(roomSnapshot(room));
  for (const ws of room.players.keys()) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function startDraft(room) {
  // fill remaining slots up to 16 with funny bots
  const need = BRACKET_SIZE - room.players.size;
  if (need > 0) {
    const names = generateBotNames(need);
    room.bots = names.map(n => ({ name: n, roster: {}, isBot: true, connected: true }));
  }
  room.state = "drafting";
  // randomize draft order (Fisher–Yates) so it's not just join order
  const names = entrants(room).map(p => p.name);
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  room.turnOrder = names;
  room.turnIdx = 0;
  room.timer = setInterval(() => {
    if (room.state !== "drafting") return;
    if (Date.now() >= room.pickDeadline) autoPick(room);
    else broadcast(room);
  }, 1000);
  beginTurn(room);
  broadcast(room);
}

// start a fresh clock for whoever is up; skip full rosters; bots pick instantly
function beginTurn(room) {
  const all = entrants(room);
  if (all.every(p => Object.keys(p.roster).length === ROSTER_SLOTS.length)) {
    return endDraft(room);
  }
  let guard = 0;
  while (guard++ < room.turnOrder.length + 1) {
    const name = pickerAt(room, room.turnIdx);
    const pl = findEntrant(room, name);
    if (pl && Object.keys(pl.roster).length < ROSTER_SLOTS.length) break;
    room.turnIdx++;
  }
  room.pickDeadline = Date.now() + PICK_SECONDS * 1000;
  // bots — and humans who chose auto-draft — pick immediately
  const upName = pickerAt(room, room.turnIdx);
  const up = findEntrant(room, upName);
  if (isBotName(room, upName) || (up && up.auto)) {
    setTimeout(() => { if (room.state === "drafting") botPick(room, upName); }, up && up.auto ? 250 : 600);
  }
}

// best available player for this picker's most valuable open slot
function bestFor(room, player) {
  const open = ROSTER_SLOTS.filter(s => !player.roster[s]);
  let best = null, bestSlot = null;
  for (const slot of open) {
    const cand = room.pool
      .filter(p => !p.takenBy && p.slots.includes(slot))
      .sort((a, b) => b.rating - a.rating)[0];
    if (cand && (!best || cand.rating > best.rating)) { best = cand; bestSlot = slot; }
  }
  return best ? { player: best, slot: bestSlot } : null;
}

function commitPick(room, picker, name) {
  const choice = bestFor(room, picker);
  if (choice) { choice.player.takenBy = name; picker.roster[choice.slot] = choice.player; }
  room.turnIdx++;
  beginTurn(room);
}

// a bot takes its turn automatically
function botPick(room, name) {
  if (pickerAt(room, room.turnIdx) !== name) return; // turn moved on
  const bot = findEntrant(room, name);
  if (!bot) return;
  commitPick(room, bot, name);
  broadcast(room);
}

// human ran out the clock -> auto-pick for them
function autoPick(room) {
  const name = pickerAt(room, room.turnIdx);
  const picker = findEntrant(room, name);
  if (picker) commitPick(room, picker, name);
  else { room.turnIdx++; beginTurn(room); }
  broadcast(room);
}

function autofill(room) {
  // anyone with empty slots gets best-available filled (safety net)
  for (const p of entrants(room)) {
    for (const slot of ROSTER_SLOTS) {
      if (p.roster[slot]) continue;
      const best = room.pool
        .filter(x => !x.takenBy && x.slots.includes(slot))
        .sort((a, b) => b.rating - a.rating)[0];
      if (best) { best.takenBy = p.name; p.roster[slot] = best; }
    }
  }
}

function teamPower(player) {
  return ROSTER_SLOTS.reduce((s, slot) => s + (player.roster[slot]?.rating || 0), 0);
}

// Play one game. Higher power favored; ratings -> goals with variance so upsets
// happen. Produces a period-by-period breakdown with funny, player-named lines.
function playGame(a, b) {
  const gap = (a.power - b.power) / 40;
  const base = 3;
  let ga = Math.max(0, Math.round(base + gap / 2 + (Math.random() * 2 - 1)));
  let gb = Math.max(0, Math.round(base - gap / 2 + (Math.random() * 2 - 1)));
  let ot = false;
  if (ga === gb) {                       // no ties — settle in OT (one goal)
    ot = true;
    if (a.power + Math.random() * 25 >= b.power + Math.random() * 25) ga++; else gb++;
  }

  // distribute regulation goals across 3 periods. In OT, the winner's last goal
  // is the OT winner; the rest split over regulation tied.
  const periods = [];
  let aRem = ga, bRem = gb;
  let otWinnerIsA = null;
  if (ot) { otWinnerIsA = ga > gb; if (otWinnerIsA) aRem--; else bRem--; }

  // spread aRem/bRem across 3 regulation periods
  const split = (total) => {
    const p = [0,0,0];
    for (let i=0;i<total;i++) p[Math.floor(Math.random()*3)]++;
    return p;
  };
  const aP = split(aRem), bP = split(bRem);
  let aRun = 0, bRun = 0;
  for (let i=0;i<3;i++){
    aRun += aP[i]; bRun += bP[i];
    periods.push({
      label: `Period ${i+1}`,
      aGoals: aP[i], bGoals: bP[i], aScore: aRun, bScore: bRun,
      lines: periodLines(a, b, aP[i], bP[i], false).map(l=>l.text),
    });
  }
  if (ot) {
    aRun += otWinnerIsA?1:0; bRun += otWinnerIsA?0:1;
    periods.push({
      label: "Overtime",
      aGoals: otWinnerIsA?1:0, bGoals: otWinnerIsA?0:1, aScore: aRun, bScore: bRun,
      lines: periodLines(a, b, otWinnerIsA?1:0, otWinnerIsA?0:1, true).map(l=>l.text),
    });
  }

  const winner = ga > gb ? a : b;
  const loser  = ga > gb ? b : a;
  const desc = describeGame(winner.name, loser.name, ga, gb);
  const box = buildBoxScore(a, b, ga, gb, winner.name);
  return { a: a.name, b: b.name, ga, gb, ot, winner: winner.name, quip: desc.line, chaos: desc.chaos, periods, box };
}

// Seeded single elimination. Byes go to top seeds when not a power of two.
function simulate(room) {
  let teams = entrants(room).map(p => ({
    name: p.name, isBot: !!p.isBot, roster: p.roster, power: teamPower(p), wins: 0, losses: 0, eliminatedIn: null,
  }));
  teams.sort((a, b) => b.power - a.power); // seed by roster strength
  teams.forEach((t, i) => (t.seed = i + 1));

  if (teams.length === 1) {
    return { standings: teams.map(t => ({ ...t, wins: 0, losses: 0 })), rounds: [], champion: teams[0].name };
  }

  const roundNames = (n) => {
    if (n === 2) return "Final";
    if (n <= 4) return "Semifinal";
    if (n <= 8) return "Quarterfinal";
    return "Round of " + n;
  };

  const rounds = [];
  let roundIdx = 0;

  // Round 1: pair teams positionally from the (already randomized) seed order.
  // Pad to a power of two with byes for the top seeds, then pair adjacent slots.
  // Winners advance IN PLACE — game i and game i+1 feed the next round's game
  // floor(i/2). No reseeding, so the bracket connects like a standard tournament.
  let pow = 1; while (pow < teams.length) pow *= 2;
  const byeCount = pow - teams.length;
  const byeTeams = teams.slice(0, byeCount);      // top seeds get the byes
  const playTeams = teams.slice(byeCount);

  // First round pairings: bye teams (auto-advance) first, then adjacent pairs.
  const firstRoundPairs = [];
  byeTeams.forEach(t => firstRoundPairs.push([t, null]));   // null opponent = bye
  for (let i = 0; i < playTeams.length; i += 2) {
    firstRoundPairs.push([playTeams[i], playTeams[i + 1]]);
  }

  // Helper to run a list of pairs into a round; null opponent = bye (no game).
  function runRound(pairs, label) {
    const games = [];
    const winners = [];
    pairs.forEach((pair) => {
      const [A, B] = pair;
      if (B == null) {                 // bye: A advances, no game recorded
        winners.push({ team: A, fromGi: null });
        return;
      }
      const r = playGame(A, B);
      const winner = r.winner === A.name ? A : B;
      const loser  = r.winner === A.name ? B : A;
      winner.wins++; loser.losses++; loser.eliminatedIn = label;
      const gi = games.length;
      games.push({ round: label, ...r, seedA: A.seed, seedB: B.seed, gi });
      winners.push({ team: winner, fromGi: gi });
    });
    return { games, winners };
  }

  // Run round 1. Label reflects how many teams are alive entering it.
  let label = roundNames(teams.length);
  let res1 = runRound(firstRoundPairs, label);
  rounds.push({ name: label, games: res1.games });
  let advancing = res1.winners.map(w => w.team);

  // Subsequent rounds: pair adjacent winners (in place)
  while (advancing.length > 1) {
    roundIdx++;
    const pairs = [];
    for (let i = 0; i < advancing.length; i += 2) {
      pairs.push([advancing[i], advancing[i + 1]]);
    }
    const lbl = roundNames(advancing.length);
    const resN = runRound(pairs, lbl);
    rounds.push({ name: lbl, games: resN.games });
    advancing = resN.winners.map(w => w.team);
  }

  // Build the feed map: for each game, where does its winner land next round?
  // Also mark which next-round slots are "byes" (a team that didn't play a game
  // to get there) so the client can show those names immediately.
  for (let ri = 0; ri < rounds.length - 1; ri++) {
    const cur = rounds[ri], nxt = rounds[ri + 1];
    // default: every next-round slot is a bye until a game claims it
    nxt.games.forEach(ng => { ng.aFromGame = false; ng.bFromGame = false; });
    cur.games.forEach((g) => {
      for (let ngi = 0; ngi < nxt.games.length; ngi++) {
        const ng = nxt.games[ngi];
        if (ng.a === g.winner && !ng.aFromGame) { g.feedRound = ri + 1; g.feedGi = ngi; g.feedSlot = "a"; ng.aFromGame = true; return; }
        if (ng.b === g.winner && !ng.bFromGame) { g.feedRound = ri + 1; g.feedGi = ngi; g.feedSlot = "b"; ng.bFromGame = true; return; }
      }
      g.feedRound = null;
    });
  }

  const champion = advancing[0].name;
  const last = teams[teams.length - 1];
  const standings = teams.slice().sort((a, b) =>
    (b.name === champion) - (a.name === champion) || b.wins - a.wins || a.seed - b.seed
  ).map(t => ({ name: t.name, isBot: t.isBot, seed: t.seed, wins: t.wins, losses: t.losses, eliminatedIn: t.eliminatedIn }));

  // rosters for the Rosters tab: each team -> its 6 drafted players (name + pos)
  const rosters = teams.slice()
    .sort((a, b) => a.seed - b.seed)
    .map(t => ({
      name: t.name, isBot: t.isBot, seed: t.seed,
      players: ROSTER_SLOTS.map(slot => {
        const p = t.roster[slot];
        return p ? { slot, name: p.name, team: p.team, pos: p.pos } : { slot, name: "—", team: "", pos: "" };
      }),
    }));

  return { standings, rounds, champion, championQuip: championLine(champion, last && last.name), rosters };
}

function endDraft(room) {
  clearInterval(room.timer); room.timer = null;
  autofill(room);
  room.state = "reveal";
  room.pickDeadline = null;
  room.result = simulate(room); // { standings, rounds, champion }
  const snap = roomSnapshot(room);
  snap.result = room.result;
  const msg = JSON.stringify(snap);
  for (const ws of room.players.keys()) if (ws.readyState === ws.OPEN) ws.send(msg);
}

function tryPick(room, player, playerId, slot) {
  if (room.state !== "drafting") return "not drafting";
  if (pickerAt(room, room.turnIdx) !== player.name) return "not your turn";
  if (!ROSTER_SLOTS.includes(slot)) return "bad slot";
  if (player.roster[slot]) return "slot filled";
  const target = room.pool.find(p => p.id === playerId);
  if (!target) return "no such player";
  if (target.takenBy) return "already taken";
  if (!target.slots.includes(slot)) return "wrong position";
  target.takenBy = player.name;
  player.roster[slot] = target;
  room.turnIdx++;
  const allFull = entrants(room).every(p => Object.keys(p.roster).length === ROSTER_SLOTS.length);
  if (allFull) return endDraft(room), null;
  beginTurn(room); // fresh clock for the next picker (auto-picks if it's a bot)
  return null;
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.type === "create") {
      const room = makeRoom();
      const pid = m.pid || (Math.random().toString(36).slice(2) + Date.now().toString(36));
      room.players.set(ws, { pid, name: m.name || "Player", roster: {}, ready: false, connected: true });
      ws.room = room; ws.pid = pid;
      ws.send(JSON.stringify({ type: "joined", code: room.code, pid }));
      broadcast(room);
    }

    if (m.type === "join") {
      const room = rooms.get((m.code || "").toUpperCase());
      if (!room) return ws.send(JSON.stringify({ type: "error", msg: "Room not found" }));
      const pid = m.pid || (Math.random().toString(36).slice(2) + Date.now().toString(36));

      // Reconnect path: same person (by pid) is already in this room.
      // Reattach their NEW socket to the EXISTING entry — no duplicate.
      const existing = findByPid(room, pid);
      if (existing) {
        const [oldWs, p] = existing;
        if (oldWs !== ws) {
          room.players.delete(oldWs);
          try { if (oldWs.readyState === oldWs.OPEN) oldWs.close(); } catch {}
        }
        p.connected = true;
        if (m.name) p.name = m.name;
        room.players.set(ws, p);
        ws.room = room; ws.pid = pid;
        ws.send(JSON.stringify({ type: "joined", code: room.code, pid }));
        return broadcast(room);
      }

      // New player joining a room mid-lobby.
      if (room.state !== "lobby") return ws.send(JSON.stringify({ type: "error", msg: "Draft already started" }));
      if (room.players.size >= BRACKET_SIZE) return ws.send(JSON.stringify({ type: "error", msg: "Lobby is full (16 max)" }));
      room.players.set(ws, { pid, name: m.name || "Player", roster: {}, ready: false, connected: true });
      ws.room = room; ws.pid = pid;
      ws.send(JSON.stringify({ type: "joined", code: room.code, pid }));
      broadcast(room);
    }

    if (m.type === "ready" && ws.room && ws.room.state === "lobby") {
      const p = ws.room.players.get(ws);
      if (p) p.ready = !p.ready;
      broadcast(ws.room);
    }

    if (m.type === "autodraft" && ws.room) {
      const p = ws.room.players.get(ws);
      if (p) { p.auto = true; p.ready = true; }
      // if draft already running and it's their turn, fire immediately
      if (ws.room.state === "drafting") {
        const upName = pickerAt(ws.room, ws.room.turnIdx);
        if (p && upName === p.name) botPick(ws.room, p.name);
      }
      broadcast(ws.room);
    }

    if (m.type === "start" && ws.room && ws.room.state === "lobby") {
      const room = ws.room;
      const readyCount = [...room.players.values()].filter(p => p.ready).length;
      if (readyCount >= MIN_HUMANS) startDraft(room);
      else ws.send(JSON.stringify({ type: "error", msg: `Need ${MIN_HUMANS} players readied up` }));
    }

    if (m.type === "pick" && ws.room) {
      const player = ws.room.players.get(ws);
      const err = tryPick(ws.room, player, m.playerId, m.slot);
      if (err) ws.send(JSON.stringify({ type: "error", msg: err }));
      else broadcast(ws.room);
    }
  });

  ws.on("close", () => {
    const room = ws.room;
    if (!room) return;
    const player = room.players.get(ws);
    if (!player) return; // socket was already replaced by a reconnect — nothing to do

    if (room.state === "lobby") {
      // In the lobby, a disconnect means they're gone — remove them so they
      // don't linger as a ghost. (A reconnect comes in as a fresh join by pid.)
      room.players.delete(ws);
      // empty room? clean it up so codes don't pile up in memory
      if (room.players.size === 0) { try { clearInterval(room.hb); } catch {}; rooms.delete(room.code); return; }
      broadcast(room);
      return;
    }

    // During draft/reveal, keep their picks so the bracket stays intact;
    // just mark them disconnected and advance if it was their turn.
    player.connected = false;
    if (room.state === "drafting" && pickerAt(room, room.turnIdx) === player?.name) {
      room.turnIdx++;
      beginTurn(room);
    }
    broadcast(room);
  });
});

server.listen(PORT, () => console.log(`ICEBREAKER server on :${PORT}`));
