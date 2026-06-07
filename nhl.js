// nhl.js — serves the player pool from a baked-in static file (pool.json).
// The 2025-26 regular season is final, so the data never changes — no live
// fetching, no API dependency, nothing to break on deploy. pool.json was built
// once from the NHL Stats API (skater + goalie season summaries, gameTypeId=2).

const fs = require("fs");
const path = require("path");

const TEAMS = [
  "ANA","BOS","BUF","CGY","CAR","CHI","COL","CBJ","DAL","DET","EDM","FLA",
  "LAK","MIN","MTL","NSH","NJD","NYI","NYR","OTT","PHI","PIT","SJS","SEA",
  "STL","TBL","TOR","UTA","VAN","VGK","WSH","WPG"
];

const TEAM_NAMES = {
  ANA:"Ducks",BOS:"Bruins",BUF:"Sabres",CGY:"Flames",CAR:"Hurricanes",CHI:"Blackhawks",
  COL:"Avalanche",CBJ:"Blue Jackets",DAL:"Stars",DET:"Red Wings",EDM:"Oilers",FLA:"Panthers",
  LAK:"Kings",MIN:"Wild",MTL:"Canadiens",NSH:"Predators",NJD:"Devils",NYI:"Islanders",
  NYR:"Rangers",OTT:"Senators",PHI:"Flyers",PIT:"Penguins",SJS:"Sharks",SEA:"Kraken",
  STL:"Blues",TBL:"Lightning",TOR:"Maple Leafs",UTA:"Mammoth",VAN:"Canucks",VGK:"Golden Knights",
  WSH:"Capitals",WPG:"Jets"
};

let _cache = null;
function loadStatic() {
  if (_cache) return _cache;
  const raw = fs.readFileSync(path.join(__dirname, "pool.json"), "utf8");
  _cache = JSON.parse(raw); // { TEAM: [players] }
  return _cache;
}

// Same signature the server already awaits. Returns { TEAM: [players] }.
async function buildPool() {
  return loadStatic();
}

// ---- SCORING: multi-factor win formula (walled off here) ----
// A team's strength is the sum of its players' ratings. Each rating blends many
// real stats so results make sense but can't be reverse-engineered from one
// number. Weights are deliberately spread across offense, two-way play, special
// teams, physicality, and durability. Output normalized to a ~5–99 band.
//
// The blend (skaters):
//   - points per game        (offensive engine)           heaviest
//   - total points           (volume / availability)
//   - power-play points      (special-teams value)
//   - plus/minus             (two-way impact)
//   - hits + blocks          (physical / "goals in the system" grit)
//   - takeaways − giveaways  (puck management)
//   - shooting %             (finishing touch)
//   - game-winning goals     (clutch)
// Goalies use save%, GAA, win rate, and shutouts.

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function rateSkater(p){
  const gp = Math.max(1, p.gp || 1);
  const ppgScore   = (p.ppg || 0) * 26;                 // 1.0 ppg -> 26
  const ptsScore   = (p.points || 0) * 0.15;            // 100 pts -> 15
  const ppScore    = (p.ppPoints || 0) * 0.28;          // 40 pp pts -> ~11
  const pmScore    = clamp((p.plusMinus || 0) * 0.4, -8, 12);
  const hitScore   = Math.sqrt(p.hits || 0) * 0.9;
  const blockScore = Math.sqrt(p.blocks || 0) * 0.7;
  const puckScore  = clamp(((p.takeaways||0) - (p.giveaways||0)) * 0.12, -5, 5);
  const shootScore = clamp((p.shootingPct || 0) * 35, 0, 7);
  const gwgScore   = (p.gwg || 0) * 1.0;

  let raw = 10 + ppgScore + ptsScore + ppScore + pmScore
            + hitScore + blockScore + puckScore + shootScore + gwgScore;

  // durability: scale down small samples so a hot 5-game stretch isn't elite
  if (gp < 25) raw *= (0.7 + 0.012 * gp);   // 1gp->0.71x, 25gp->1.0x

  // soft cap above 90 so the very top spreads out instead of bunching at 99
  if (raw > 90) raw = 90 + (raw - 90) * 0.35;

  return clamp(Math.round(raw), 5, 99);
}

function rateGoalie(p){
  const sv  = p.savePct || 0.88;
  const gaa = p.gaa || 3.2;
  const gp  = Math.max(1, p.gp || 1);
  const winRate = (p.wins || 0) / gp;
  const svScore  = (sv - 0.880) * 600;
  const gaaScore = clamp((3.2 - gaa) * 7, -8, 12);
  const winScore = clamp(winRate * 16, 0, 15);
  const soScore  = (p.shutouts || 0) * 2.0;
  let raw = 42 + svScore + gaaScore + winScore + soScore;

  // Heavy small-sample regression toward a backup-level baseline (~55). A goalie
  // with a handful of games can't rate like a proven starter no matter the rate
  // stats. Full credit only kicks in around a real starter's workload (~30 GP).
  const trust = clamp(gp / 30, 0, 1);
  raw = 55 + (raw - 55) * trust;

  if (raw > 88) raw = 88 + (raw - 88) * 0.4;   // soft cap top goalies too
  return clamp(Math.round(raw), 20, 95);
}

function rate(player){
  return player.isGoalie ? rateGoalie(player) : rateSkater(player);
}

module.exports = { TEAMS, TEAM_NAMES, buildPool, rate, rateSkater, rateGoalie };
