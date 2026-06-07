// commentary.js — Bigfoot's play-by-play + chaotic game events for the sim.
// Pure functions: given the two teams and the score, return a funny line and
// maybe a chaos event. No state.

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Chaotic events that "happened" during a game (~35% chance per game).
// {W} = winner name, {L} = loser name. Kept absurd but bloodless.
const CHAOS = [
  "the Zamboni broke down and {L} had to play the third period on bad ice. tragic.",
  "{W}'s goalie left to get a hot dog and they STILL won.",
  "a raccoon got on the ice. {L} was the only one scared of it.",
  "{W} scored on an empty net from their own zone. show-offs.",
  "{L} iced the puck 41 times. a league record nobody wanted.",
  "{W}'s fourth line started a conga line during a TV timeout and the refs allowed it.",
  "the goal horn got stuck on for {W}. {L} found it demoralizing.",
  "{L} took a too-many-men penalty TWICE. coaching.",
  "{W} won a fight, the faceoff, and the hearts of everyone watching.",
  "someone threw a hat after a single goal. premature, but {W} appreciated it.",
  "{L}'s power play went 0-for-7. statistically that's hard to do.",
  "{W} celebrated so hard they got a delay-of-game penalty and did not care.",
  "the puck went over the glass and hit the mascot. unrelated, {W} won.",
  "{L} pulled their goalie down 4. it went exactly how you'd think.",
];

// One-line summaries based on the margin. {W}/{L}/{S} = score string.
const BLOWOUT = [
  "{W} ran {L} out of the building, {S}. call your families.",
  "{S}. {L} should be embarrassed and probably is.",
  "{W} cooked {L} {S}. it wasn't close and everyone knew it.",
  "{S} — {L} got sent to the shadow realm.",
];
const CLOSE = [
  "{W} edged {L} {S} in a nail-biter. somebody's heart gave out.",
  "{S}, {W} survives. {L} will think about this one for a while.",
  "one goal, {S}. {W} wins ugly. a win's a win.",
];
const OT = [
  "{W} won it in OT, {S}. {L} is inconsolable.",
  "free hockey! {W} takes it {S} in overtime. brutal way for {L} to go.",
  "{S} in the extra frame. {W} walks it off. {L} stares into the void.",
];

function describeGame(winnerName, loserName, ga, gb) {
  const hi = Math.max(ga, gb), lo = Math.min(ga, gb);
  const margin = hi - lo;
  const S = `${hi}-${lo}`;
  let bank;
  if (margin === 1 && hi + lo >= 7) bank = OT;        // tight, high-scoring → OT vibe
  else if (margin >= 4) bank = BLOWOUT;
  else bank = CLOSE;                                   // 1-3 goal games
  const line = pick(bank)
    .replace(/{W}/g, winnerName).replace(/{L}/g, loserName).replace(/{S}/g, S);
  let chaos = null;
  if (Math.random() < 0.35) {
    chaos = pick(CHAOS).replace(/{W}/g, winnerName).replace(/{L}/g, loserName);
  }
  return { line, chaos };
}

// Final verdict line for the champion (used on the reveal screen).
const CHAMP_LINES = [
  "{C} built a monster and the whole bracket paid for it. cup's theirs.",
  "{C} is your champion. the rest of you can mail in your jerseys.",
  "{C} went through 15 teams and a raccoon to win this thing. legend.",
  "{C} takes the cup. {L} took the L. as is tradition.",
  "{C} wins it all. somewhere, a Bigfoot sheds a single proud tear.",
];
function championLine(championName, lastPlaceName) {
  return pick(CHAMP_LINES)
    .replace(/{C}/g, championName)
    .replace(/{L}/g, lastPlaceName || "the rest");
}

module.exports = { describeGame, championLine };
