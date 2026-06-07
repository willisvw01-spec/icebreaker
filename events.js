// events.js — funny period-by-period play-by-play.
// Lines name REAL drafted players plugged into absurd templates.
// {S} = scorer, {A} = assist/teammate, {V} = victim/opponent, {G} = goalie.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// GOAL events (these move the score). {S} scores.
const GOALS = [
  "{S} snipes top shelf where mama hides the cookies. lamp lit.",
  "{S} roofs one so hard the goal judge flinched. it's in.",
  "{S} walks out of the corner and undresses {G}. filthy.",
  "{S} buries a rebound while {G} is still writing his memoir.",
  "{S} one-times a {A} feed past {G} — absolute laser.",
  "{S} dangles three guys and tucks it five-hole. {G} wants a trade.",
  "{S} scores on a shot {G} should frankly be embarrassed about.",
  "{S} tips home a {A} point shot. greasy, effective, beautiful.",
  "{S} goes bar-down and points at the crowd. disrespectful. love it.",
  "{S} banks it in off {G}'s skate. they don't ask how, they ask how many.",
  "{S} scores shorthanded and the bench loses its collective mind.",
  "{S} wires it from the slot. {G} saw it. {G} could not have it.",
];

// NON-GOAL chaos (flavor, no score change).
const FLAVOR = [
  "{V} delivers a crushing hit on {S}. {S} is questioning his life choices.",
  "{S} levels {V} at center ice — {V} is out for the remainder of the period.",
  "{S} and {V} drop the gloves. {S} wins, then waves to {V}'s family.",
  "{G} robs {S} with a glove save that belongs in a museum.",
  "{G} stones {S} on a breakaway and stares directly into his soul.",
  "{S} hits the post so hard the building rang like a bell.",
  "{V} takes a tripping penalty he will deny for the rest of his life.",
  "{S} fans on a wide-open net. somewhere a coach aged ten years.",
  "{V} gets caught admiring his own pass. rookie mistake.",
  "{S} blocks a shot with his shin and pretends it didn't hurt. it hurt.",
  "{G} freezes the puck and the whole arena exhales.",
  "{V} loses an edge and slides into the boards. unprompted. nobody touched him.",
  "the linesman gets clipped and goes down harder than anyone all night.",
  "{S} crosschecks {V} in the back and acts shocked at the call.",
];

// OT golden-goal lines.
const OT_GOALS = [
  "{S} ends it in overtime. {S} is mobbed. {G} is alone.",
  "{S} walks in and snaps the OT winner. ballgame. go home.",
  "{S} buries it in OT and the gloves go flying. pandemonium.",
  "{S} wins it in the extra frame on a shot {G} will see in his nightmares.",
];

function rosterNames(roster) {
  // roster is {slot: playerObj}; return {skaters:[names], goalie:name}
  const skaters = [], slots = ["LW","C","RW","LD","RD"];
  for (const s of slots) if (roster[s]) skaters.push(roster[s].name);
  const goalie = roster["G"] ? roster["G"].name : "the goalie";
  return { skaters, goalie };
}

// Build commentary lines for one period given which team scored how many.
// teamA/teamB are { name, roster }. aGoals/bGoals = goals scored this period.
// Returns array of {text, scorer?} lines (2-3).
function periodLines(teamA, teamB, aGoals, bGoals, isOT) {
  const A = rosterNames(teamA.roster), B = rosterNames(teamB.roster);
  const lines = [];
  const goalBank = isOT ? OT_GOALS : GOALS;

  // one goal line per goal scored (cap so it stays tight)
  const goalEvents = [];
  for (let i = 0; i < aGoals; i++) goalEvents.push({ team: A, opp: B });
  for (let i = 0; i < bGoals; i++) goalEvents.push({ team: B, opp: A });
  // shuffle so A/B goals interleave
  goalEvents.sort(() => Math.random() - 0.5);

  for (const e of goalEvents) {
    const S = pick(e.team.skaters) || "somebody";
    const Aa = pick(e.team.skaters) || S;
    const G = e.opp.goalie;
    lines.push({ text: pick(goalBank).replace(/{S}/g,S).replace(/{A}/g,Aa).replace(/{G}/g,G) });
  }

  // add 1 flavor line if we have room (keep total 2-3)
  if (lines.length < 3) {
    const offense = Math.random() < 0.5 ? A : B;
    const defense = offense === A ? B : A;
    const S = pick(offense.skaters) || "somebody";
    const V = pick(defense.skaters) || "some guy";
    const G = defense.goalie;
    lines.push({ text: pick(FLAVOR).replace(/{S}/g,S).replace(/{V}/g,V).replace(/{G}/g,G) });
  }
  // ensure at least 2 lines
  if (lines.length < 2) {
    const S = pick(A.skaters) || "somebody", V = pick(B.skaters) || "some guy", G = B.goalie;
    lines.push({ text: pick(FLAVOR).replace(/{S}/g,S).replace(/{V}/g,V).replace(/{G}/g,G) });
  }
  return lines.slice(0, 3);
}

module.exports = { periodLines };
