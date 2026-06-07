// Audit the bracket sim directly by reaching the simulate() via a tiny harness.
// We rebuild a minimal room shape and call the exported sim.
const path = require("path");

// Pull simulate out of server.js without starting the server: re-require the
// functions by loading the file in a sandbox is messy, so we replicate the
// two pure functions here by requiring a small extraction. Instead, we test
// through a thin copy import: server exports nothing, so we eval the funcs.
const fs = require("fs");
const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

// extract teamPower, playGame, simulate, ROSTER_SLOTS via Function sandbox
const ROSTER_SLOTS = ["LW","C","RW","LD","RD","G"];
const grab = (name) => {
  const re = new RegExp("function " + name + "[\\s\\S]*?\\n}\\n", "m");
  const m = src.match(re);
  if (!m) throw new Error("could not extract " + name);
  return m[0];
};
const code = `const ROSTER_SLOTS=${JSON.stringify(ROSTER_SLOTS)};
// stubs for deps the extracted functions reference
function entrants(room){ return [...room.players.values()]; }
function describeGame(w,l,ga,gb){ return { line:"", chaos:null }; }
function championLine(c,l){ return ""; }
function periodLines(a,b,ag,bg,ot){ return []; }
function buildBoxScore(a,b,ga,gb,w){ return null; }
${grab("teamPower")}
${grab("playGame")}
${grab("simulate")}
return { simulate };`;
const { simulate } = new Function(code)();

// build a fake room of N players with random-ish rosters
function fakeRoom(n) {
  const players = new Map();
  for (let i = 0; i < n; i++) {
    const roster = {};
    for (const s of ROSTER_SLOTS) roster[s] = { rating: 40 + Math.floor(Math.random() * 55) };
    players.set({}, { name: "P" + (i + 1), roster });
  }
  return { players };
}

let allOK = true;
for (const n of [1, 2, 3, 4, 5, 6, 8, 16]) {
  // run several times to catch random-dependent bugs
  let ok = true, sample = null;
  for (let t = 0; t < 200; t++) {
    const res = simulate(fakeRoom(n));
    sample = res;
    // invariants:
    if (!res.champion) ok = false;
    if (res.standings.length !== n) ok = false;
    if (res.standings[0].name !== res.champion) ok = false; // champ listed first
    // exactly one team with 0 losses among >1 (the champion) — single elim
    if (n > 1) {
      const undefeated = res.standings.filter(s => s.losses === 0);
      if (undefeated.length !== 1) ok = false;
      if (undefeated[0].name !== res.champion) ok = false;
      // total losses must equal n-1 (each game eliminates exactly one)
      const totalLosses = res.standings.reduce((s, t) => s + t.losses, 0);
      if (totalLosses !== n - 1) ok = false;
    }
    // every game has a valid winner among its two participants
    for (const rd of res.rounds) for (const g of rd.games) {
      if (g.winner !== g.a && g.winner !== g.b) ok = false;
      if (g.ga === g.gb) ok = false; // no ties allowed
    }
  }
  console.log(`n=${n}: ${ok ? "✓" : "✗"}  champion=${sample.champion}  rounds=${sample.rounds.map(r=>r.name+"("+r.games.length+")").join(", ")||"(none)"}`);
  if (!ok) allOK = false;
}
console.log("\n" + (allOK ? "✓ bracket invariants hold across all sizes" : "✗ bracket has a bug"));
process.exit(allOK ? 0 : 1);
