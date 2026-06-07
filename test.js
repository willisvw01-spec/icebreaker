const WebSocket = require("ws");
const URL = "ws://localhost:3000";
const log = (...a) => console.log(...a);
let roomCode = null, done = false;
const a = new WebSocket(URL), b = new WebSocket(URL);
const SLOTS = ["LW","C","RW","LD","RD","G"];

function pickFor(ws, state, myName) {
  if (state.state !== "drafting" || state.currentPicker !== myName) return;
  const me = state.players.find(p => p.name === myName);
  const openSlots = SLOTS.filter(s => !me.roster[s]);
  // must pick from the rolled franchise, a player fitting an open slot
  const cand = state.pool.find(p =>
    !p.takenBy && p.team === state.rolledTeam && p.slots.some(s => openSlots.includes(s))
  );
  if (!cand) return; // dead roll shouldn't happen (server avoids it), but be safe
  const slot = cand.slots.find(s => openSlots.includes(s));
  ws.send(JSON.stringify({ type: "pick", playerId: cand.id, slot }));
}

a.on("open", () => a.send(JSON.stringify({ type: "create", name: "Alice" })));
let bOpen = false, bJoined = false;
b.on("open", () => { bOpen = true; maybeJoinB(); });
function maybeJoinB() { if (bOpen && roomCode && !bJoined) { bJoined = true; b.send(JSON.stringify({ type: "join", name: "Bob", code: roomCode })); } }

a.on("message", m => {
  m = JSON.parse(m);
  if (m.type === "joined") { roomCode = m.code; log("✓ room created:", roomCode); maybeJoinB(); }
  if (m.type === "state") {
    if (m.state === "lobby" && m.players.length === 2) { log("✓ both players in lobby — starting draft"); a.send(JSON.stringify({ type: "start" })); }
    pickFor(a, m, "Alice");
    if (m.state === "reveal" && !done) {
      done = true;
      log("✓ REVEAL reached");
      log("  results:", JSON.stringify(m.results));
      log("  pool taken:", m.pool.filter(p => p.takenBy).length, "of", m.pool.length);
      const everyoneFull = m.players.every(p => p.picks === 6);
      log(everyoneFull ? "✓ all rosters full (6/6)" : "✗ some rosters incomplete");
      process.exit(everyoneFull ? 0 : 1);
    }
  }
});
b.on("message", m => { m = JSON.parse(m); if (m.type === "state") pickFor(b, m, "Bob"); });

setTimeout(() => { log("✗ TIMEOUT"); process.exit(1); }, 12000);
