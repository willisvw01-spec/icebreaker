// e2e.js — server + two clients in ONE process so the tool never reaps a
// detached server. Proves franchise-roll draft end to end on fixture data.
process.env.NHL_FIXTURE = "1";
process.env.DRAFT_SECONDS = "8";
process.on("unhandledRejection", e => { console.log("REJ:", e && e.message); process.exit(4); });

require("./server.js"); // listens on :3000, loads fixture pool

const WebSocket = require("ws");
const URL = "ws://127.0.0.1:3000";
const SLOTS = ["LW","C","RW","LD","RD","G"];
let roomCode = null, done = false;
let collisions = 0, picksMade = 0;

// wait a beat for the pool to load before connecting
setTimeout(start, 1200);

function start() {
  const a = new WebSocket(URL), b = new WebSocket(URL);
  let bOpen = false, bJoined = false;
  const joinB = () => { if (bOpen && roomCode && !bJoined) { bJoined = true; b.send(JSON.stringify({ type:"join", name:"Bob", code:roomCode })); } };

  function pickFor(ws, st, me) {
    if (st.state !== "drafting" || st.currentPicker !== me) return;
    const mine = st.players.find(p => p.name === me);
    const open = SLOTS.filter(s => !mine.roster[s]);
    const cand = st.pool.find(p => !p.takenBy && p.team === st.rolledTeam && p.slots.some(s => open.includes(s)));
    if (!cand) { console.log("  ! no candidate for rolled team", st.rolledTeam, "open:", open.join(",")); return; }
    const slot = cand.slots.find(s => open.includes(s));
    ws.send(JSON.stringify({ type:"pick", playerId:cand.id, slot }));
  }

  a.on("open", () => a.send(JSON.stringify({ type:"create", name:"Alice" })));
  b.on("open", () => { bOpen = true; joinB(); });

  a.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.type === "joined") { roomCode = m.code; console.log("✓ room", roomCode); joinB(); }
    if (m.type === "error") console.log("  A error:", m.msg);
    if (m.type === "state") {
      if (m.state === "lobby" && m.players.length === 2) { console.log("✓ lobby has 2 — starting"); a.send(JSON.stringify({ type:"start" })); }
      if (m.state === "drafting" && m.currentPicker === "Alice") console.log(`  Alice rolled ${m.rolledTeamName} (${m.rolledTeam})`);
      pickFor(a, m, "Alice");
      if (m.state === "reveal" && !done) finish(m);
    }
  });
  b.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.type === "error") console.log("  B error:", m.msg);
    if (m.type === "state") {
      if (m.state === "drafting" && m.currentPicker === "Bob") console.log(`  Bob rolled ${m.rolledTeamName} (${m.rolledTeam})`);
      pickFor(b, m, "Bob");
    }
  });

  function finish(m) {
    done = true;
    console.log("✓ REVEAL");
    const takenIds = m.pool.filter(p => p.takenBy).map(p => p.id);
    const uniq = new Set(takenIds);
    console.log(`  unique taken: ${uniq.size} (collisions: ${takenIds.length - uniq.size})`);
    const r = m.result || {};
    console.log("  champion:", r.champion);
    console.log("  rounds:", (r.rounds||[]).map(rd => `${rd.name}(${rd.games.length})`).join(", ") || "(none)");
    for (const rd of (r.rounds||[])) for (const g of rd.games) console.log(`    ${g.round}: ${g.a} ${g.ga}-${g.gb} ${g.b} -> ${g.winner}`);
    const standOK = r.standings && r.standings.length === m.players.length && r.standings[0].name === r.champion;
    console.log(standOK ? "✓ standings well-formed, champion first" : "✗ standings malformed");
    const full = m.players.every(p => p.picks === 6);
    console.log(full ? "✓ both rosters 6/6" : "✗ incomplete rosters");
    let posOK = true;
    for (const pl of m.players) for (const slot of SLOTS) {
      const pick = pl.roster[slot];
      if (pick && !pick.slots.includes(slot)) posOK = false;
    }
    console.log(posOK ? "✓ all picks position-legal" : "✗ a pick broke position rules");
    process.exit(full && posOK && standOK && uniq.size === takenIds.length ? 0 : 1);
  }
}

setTimeout(() => { console.log("✗ TIMEOUT"); process.exit(1); }, 18000);
