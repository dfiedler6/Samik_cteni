"use strict";

const LETTER_INDEX = new Map(ALPHABET.map((item, index) => [item.letter, index]));
const COLOR_COUNT = 6;

// "CH" is one Czech letter, so "chata" is CH-A-T-A.
function tokenize(text) {
  const up = text.normalize("NFC").toLocaleUpperCase("cs");
  const out = [];
  for (let i = 0; i < up.length; i++) {
    if (up[i] === "C" && up[i + 1] === "H") {
      out.push("CH");
      i++;
    } else if (LETTER_INDEX.has(up[i])) {
      out.push(up[i]);
    }
  }
  return out;
}

function letterInfo(letter) {
  return ALPHABET[LETTER_INDEX.get(letter)] || { letter, say: letter.toLocaleLowerCase("cs") };
}

function colorClass(letter) {
  const index = LETTER_INDEX.has(letter) ? LETTER_INDEX.get(letter) : 0;
  return "c" + (index % COLOR_COUNT);
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function lower(text) {
  return text.toLocaleLowerCase("cs");
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("cteni-" + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem("cteni-" + key, JSON.stringify(value)); }
    catch (e) {}
  },
  clear() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("cteni-"))
        .forEach((key) => localStorage.removeItem(key));
    } catch (e) {}
  }
};
