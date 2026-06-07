// Tests pool-building + scoring against an NHL-API-shaped fixture (no network).
const { rate } = require("./nhl.js");

// Mirror of what /v1/club-stats/{TEAM}/now returns (trimmed).
const fixture = {
  skaters: [
    { firstName:{default:"Tage"}, lastName:{default:"Thompson"}, positionCode:"C", gamesPlayed:78, goals:44, assists:38, points:82 },
    { firstName:{default:"Rasmus"}, lastName:{default:"Dahlin"}, positionCode:"D", gamesPlayed:80, goals:18, assists:50, points:68 },
    { firstName:{default:"Alex"}, lastName:{default:"Tuch"}, positionCode:"R", gamesPlayed:75, goals:30, assists:35, points:65 },
    { firstName:{default:"Jeff"}, lastName:{default:"Skinner"}, positionCode:"L", gamesPlayed:40, goals:10, assists:9, points:19 },
  ],
  goalies: [
    { firstName:{default:"Ukko-Pekka"}, lastName:{default:"Luukkonen"}, gamesPlayed:55, savePercentage:0.905, goalsAgainstAverage:2.78, wins:28 },
    { firstName:{default:"Devon"}, lastName:{default:"Levi"}, gamesPlayed:20, savePercentage:0.888, goalsAgainstAverage:3.10, wins:8 },
  ],
};

function bucket(p){ if(p==="L")return["LW"]; if(p==="C")return["C"]; if(p==="R")return["RW"]; if(p==="D")return["LD","RD"]; if(p==="G")return["G"]; return []; }

const players = [];
for (const s of fixture.skaters) {
  const slots = bucket(s.positionCode); if(!slots.length) continue;
  const gp=s.gamesPlayed, pts=s.points;
  players.push({ name:`${s.firstName.default} ${s.lastName.default}`, team:"BUF", pos:s.positionCode, slots, gp, points:pts, ppg: gp?+(pts/gp).toFixed(3):0, isGoalie:false });
}
for (const g of fixture.goalies) {
  players.push({ name:`${g.firstName.default} ${g.lastName.default}`, team:"BUF", pos:"G", slots:["G"], gp:g.gamesPlayed, savePct:g.savePercentage, gaa:g.goalsAgainstAverage, isGoalie:true });
}

console.log("Built", players.length, "players for BUF\n");
let ok = true;
for (const p of players) {
  const r = rate(p);
  const detail = p.isGoalie ? `sv% ${p.savePct}` : `${p.points}pts / ${p.gp}gp = ${p.ppg} ppg`;
  console.log(`  ${p.name.padEnd(20)} ${p.slots.join("/").padEnd(6)} ${detail.padEnd(28)} rating ${r}`);
  if (typeof r !== "number" || isNaN(r)) ok = false;
}

// sanity: Thompson (1.05 ppg) should out-rate Skinner (0.475 ppg)
const thompson = players.find(p=>p.name.includes("Thompson"));
const skinner = players.find(p=>p.name.includes("Skinner"));
console.log("\nThompson > Skinner by rate?", rate(thompson) > rate(skinner) ? "✓" : "✗");
// goalie comparable to skaters (not zero, not absurd)
const lulu = players.find(p=>p.name.includes("Luukkonen"));
console.log("Goalie rating in sane range (40-110)?", rate(lulu)>=40 && rate(lulu)<=110 ? "✓ ("+rate(lulu)+")" : "✗ ("+rate(lulu)+")");
console.log("\n", ok ? "✓ all ratings numeric" : "✗ bad rating");
process.exit(ok ? 0 : 1);
