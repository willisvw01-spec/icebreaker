// boxscore.js — generates a believable per-player box score for one game.
// Stats are INVENTED for the fake matchup but weighted by each player's real
// season tendencies, so snipers score, playmakers assist, grinders hit.
// Produces Goals / Assists / +/- / Hits per player; goals sum to team score.

function weightedPick(players, weights) {
  let total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return players[Math.floor(Math.random() * players.length)];
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) { r -= weights[i]; if (r <= 0) return players[i]; }
  return players[players.length - 1];
}

// distribute `n` events across players by weight; returns map name->count
function distribute(players, weights, n) {
  const counts = {};
  players.forEach(p => counts[p.name] = 0);
  for (let i = 0; i < n; i++) { const p = weightedPick(players, weights); counts[p.name]++; }
  return counts;
}

// roster = {slot: playerObj}. teamGoals = goals this team scored in the game.
// won = did this team win (for +/- skew). Returns array of player stat lines.
function teamBox(roster, teamGoals, won) {
  const slots = ["LW","C","RW","LD","RD"];
  const skaters = slots.map(s => roster[s]).filter(Boolean);
  if (!skaters.length) return [];

  // GOAL weights: season goals + shooting volume (snipers score more)
  const goalW = skaters.map(p => (p.goals||0) * 1.0 + (p.shots||0) * 0.05 + 0.4);
  const goalCounts = distribute(skaters, goalW, teamGoals);

  // ASSIST weights: season assists (playmakers). ~1.6 assists per goal league-ish
  const assistTotal = Math.round(teamGoals * (1.3 + Math.random() * 0.6));
  const assistW = skaters.map(p => (p.assists||0) * 1.0 + 0.5);
  const assistCounts = distribute(skaters, assistW, assistTotal);

  // HITS: weighted by real hit rate, scaled to a single game (~season/82)
  // each skater gets a Poisson-ish draw around their per-game rate
  function gameHits(p) {
    const perGame = (p.hits||0) / Math.max(1, p.gp||1);
    // random around the per-game rate, min 0
    let h = 0; const lam = perGame;
    // simple: round(perGame + noise)
    h = Math.max(0, Math.round(lam + (Math.random()*2 - 1) * Math.max(1, lam*0.8)));
    return h;
  }

  return skaters.map(p => {
    const g = goalCounts[p.name] || 0;
    const a = assistCounts[p.name] || 0;
    // +/-: winners skew +, losers skew -, stars skew further by season +/-
    const base = won ? 1 : -1;
    const seasonPM = (p.plusMinus||0) / Math.max(1, p.gp||1); // per-game tendency
    let pm = base * (Math.random() < 0.55 ? 1 : 0) + Math.round(seasonPM * 2 + (Math.random()*2-1));
    pm = Math.max(-4, Math.min(4, pm));
    return {
      name: p.name, pos: p.pos, slot: slotOf(roster, p),
      g, a, pts: g + a, pm, hits: gameHits(p),
    };
  });
}

function slotOf(roster, player) {
  for (const s of Object.keys(roster)) if (roster[s] && roster[s].name === player.name) return s;
  return player.pos;
}

// Goalie line for the box (saves/GA), given goals allowed.
function goalieLine(roster, goalsAllowed) {
  const g = roster["G"];
  if (!g) return null;
  // realistic single-game shot volume: ~26-38, never below goals+a few
  const shots = Math.max(goalsAllowed + 6, 26 + Math.floor(Math.random() * 13));
  return { name: g.name, pos: "G", ga: goalsAllowed, saves: Math.max(0, shots - goalsAllowed), shots };
}

// Build full box score for a game between two teams.
// teamA/teamB = {name, roster}. ga/gb = goals each scored. winnerName.
function buildBoxScore(teamA, teamB, ga, gb, winnerName) {
  return {
    a: {
      name: teamA.name,
      skaters: teamBox(teamA.roster, ga, winnerName === teamA.name),
      goalie: goalieLine(teamA.roster, gb),
    },
    b: {
      name: teamB.name,
      skaters: teamBox(teamB.roster, gb, winnerName === teamB.name),
      goalie: goalieLine(teamB.roster, ga),
    },
  };
}

module.exports = { buildBoxScore };
