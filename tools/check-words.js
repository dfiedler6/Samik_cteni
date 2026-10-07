// Checks js/words.js for typos and broken Czech spelling rules.
// Usage: node tools/check-words.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = { window: {}, localStorage: null };
vm.createContext(context);
for (const file of ["js/alphabet.js", "js/words.js", "js/util.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const { ALPHABET, WORDS, SENTENCES, tokenize } = vm.runInContext("({ ALPHABET, WORDS, SENTENCES, tokenize })", context);

const VOWELS = new Set(ALPHABET.filter((item) => item.vowel).map((item) => item.letter));
const SOFT = new Set(["Ž", "Š", "Č", "Ř", "C", "J", "Ď", "Ť", "Ň"]);
const BEFORE_E_CARON = new Set(["B", "P", "V", "M", "D", "T", "N", "F"]);
const problems = [];
const seen = new Set();

function checkSpelling(label, tokens) {
  tokens.forEach((token, i) => {
    const prev = tokens[i - 1];
    if ((token === "Y" || token === "Ý") && SOFT.has(prev)) problems.push(`${label}: ${prev}${token} se píše s měkkým i`);
    if (["Ď", "Ť", "Ň"].includes(prev) && ["E", "É", "Ě", "I", "Í"].includes(token)) problems.push(`${label}: ${prev}${token} se píše bez háčku (dě, ti, ni)`);
    if (token === "Ě" && !BEFORE_E_CARON.has(prev)) problems.push(`${label}: Ě nesmí být po ${prev || "začátku"}`);
  });
}

for (const raw of WORDS) {
  const syllables = raw.split("-");
  const text = syllables.join("");
  const key = text.toLocaleLowerCase("cs");
  if (seen.has(key)) problems.push(`${raw}: slovo je v seznamu dvakrát`);
  seen.add(key);
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (tokenize(text).join("").length !== letters.toLocaleUpperCase("cs").length) problems.push(`${raw}: obsahuje neznámé písmeno`);
  if (/[^\p{L}-]/u.test(raw)) problems.push(`${raw}: obsahuje mezeru nebo jiný znak`);
  for (const part of syllables) {
    const tokens = tokenize(part);
    if (!tokens.length) problems.push(`${raw}: prázdná slabika`);
    else if (!tokens.some((t) => VOWELS.has(t) || t === "L" || t === "R")) problems.push(`${raw}: slabika "${part}" nemá samohlásku`);
  }
  const tokens = tokenize(text);
  if (tokens[0] === "Ů") problems.push(`${raw}: Ů nebývá na začátku slova`);
  checkSpelling(raw, tokens);
}

for (const sentence of SENTENCES) {
  if (!/^\p{Lu}/u.test(sentence)) problems.push(`"${sentence}": věta má začínat velkým písmenem`);
  if (!/[.!?]$/.test(sentence)) problems.push(`"${sentence}": věta má končit tečkou`);
  for (const word of sentence.split(/\s+/)) checkSpelling(`"${sentence}"`, tokenize(word));
}

console.log(`Slov: ${WORDS.length}, vět: ${SENTENCES.length}`);

// Optional: node tools/check-words.js M A E L  -> shows what can be read with those letters.
const asked = process.argv.slice(2).map((letter) => letter.toLocaleUpperCase("cs"));
if (asked.length) {
  const set = new Set(asked);
  const words = WORDS.filter((raw) => tokenize(raw).every((t) => set.has(t))).map((raw) => raw.replace(/-/g, ""));
  const sentences = SENTENCES.filter((s) => tokenize(s).every((t) => set.has(t)));
  console.log(`\nS písmeny ${asked.join(" ")}: ${words.length} slov, ${sentences.length} vět`);
  if (words.length) console.log(words.join(", "));
  sentences.forEach((s) => console.log("  " + s));
}

if (problems.length) {
  console.log("\nProblémy:");
  problems.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("\nVše v pořádku.");
