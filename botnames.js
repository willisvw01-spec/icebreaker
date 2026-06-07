// botnames.js — generates funny, person-style names for AI drafters.
// They should read like a guy in your group chat, not a fantasy team name,
// so they sit naturally next to real names like "Victor" and "Dave".
// Mix of: pun surnames, "first name + hockey pun", and a few legendary one-offs.

// Curated standalone names that already read like a person (best ones first).
const STANDALONE = [
  "Rutger McGroarty", "Drunk Dahlin", "Sid the Squid", "Connor McLovin",
  "Phil the Thrill", "Bert Macklin", "Gritty Gritson", "Chad Puckington",
  "Tage Against the Machine", "Auston Powers", "Patrik Lainebacker",
  "Cale Yeah Makar", "Jack Hughes Mann", "Brock O'Lee", "Quinn Hugheston",
  "Wayne Trainwreck", "Mario LeMieux Than You", "Pavel Datsyukmydude",
  "Tim Biscuit", "Marc-Andre Foureyes", "Dougie Freshamilton", "Sam Reinslarts",
  "Mitch Marnerd", "Leon Draisaitlante", "Nico Hischierleader", "Trevor Zegrabber",
  "Clayton Kellerific", "Jake Guentzelman", "Roope Hintzpiration", "Matt Boldyburger",
  "Kirill the Thrill", "Jordan Binnington Post", "Igor Shesterkinda", "Thatcher Demkominute",
];

// Generative pieces so we never run out and they feel fresh each lobby.
const FIRST = [
  "Big", "Lil", "Wild", "Smooth", "Sneaky", "Dirty", "Sweaty", "Captain",
  "Coach", "Uncle", "Beauty", "Chiclet", "Greasy", "Tilly", "Dangle", "Chel",
];
const SURNAME = [
  "McSlapshot", "Bardownski", "Five-Hole", "Top Cheddar", "Backcheck",
  "Gongshow", "Plumber", "Gretzkyish", "Ovechkinda", "Crosbyesque",
  "Puckhandler", "Benchwarmer", "Zamboni", "Hattrick", "Garbage Goal",
  "Empty Netter", "Offsides", "Icing", "Tripping", "Highstick", "Celly",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Returns `count` unique funny names.
function generateBotNames(count) {
  const used = new Set();
  const out = [];
  // shuffle standalones, use them first
  const pool = [...STANDALONE].sort(() => Math.random() - 0.5);
  for (const n of pool) {
    if (out.length >= count) break;
    used.add(n); out.push(n);
  }
  // fill remainder generatively, avoiding dupes
  let guard = 0;
  while (out.length < count && guard++ < 1000) {
    const n = `${pick(FIRST)} ${pick(SURNAME)}`;
    if (!used.has(n)) { used.add(n); out.push(n); }
  }
  // absolute fallback if somehow still short
  while (out.length < count) out.push(`Bench Guy ${out.length + 1}`);
  return out.slice(0, count);
}

module.exports = { generateBotNames };
