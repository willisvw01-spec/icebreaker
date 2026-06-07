const fs = require("fs");
const s = fs.readFileSync(__dirname + "/server.js", "utf8");
const h = fs.readFileSync(__dirname + "/public/index.html", "utf8");
const sFlat = s.replace(/\s+/g, " ");

const checks = [
  ["server: endDraft sets room.result", s.includes("room.result = simulate(room)")],
  ["server: snapshot includes snap.result", s.includes("snap.result = room.result")],
  ["server: simulate returns standings/rounds/champion(+quip)", s.includes("return { standings, rounds, champion, championQuip")],
  ["server: game carries winner", s.includes("winner: winner.name")],
  ["server: game carries ga,gb", sFlat.includes("ga, gb,") || (s.includes("ga,") && s.includes("gb,"))],
  ["server: sets eliminatedIn", s.includes("eliminatedIn")],
  ["client: reads state.result", h.includes("state.result")],
  ["client: no stale state.results", !h.includes("state.results")],
  ["client: reads r.standings/r.rounds/r.champion", h.includes("r.standings") && h.includes("r.rounds") && h.includes("r.champion")],
  ["client: reads g.a/g.b/g.ga/g.gb/g.winner", ["g.a","g.b","g.ga","g.gb","g.winner"].every(x => h.includes(x))],
  ["client: #bracket element exists", h.includes('id="bracket"')],
  ["client: bracket grid styles (.bg-col/.bg-game)", h.includes(".bg-col") && h.includes(".bg-game")],
  ["client: reads eliminatedIn", h.includes("eliminatedIn")],
];

let ok = true;
for (const [label, pass] of checks) { console.log((pass ? "✓ " : "✗ ") + label); if (!pass) ok = false; }
console.log("\n" + (ok ? "✓ server/client bracket contract aligned" : "✗ contract mismatch"));
process.exit(ok ? 0 : 1);
