"use strict";

const WORD_DATA = WORDS.map((raw) => {
  const syllables = raw.normalize("NFC").split("-");
  const text = syllables.join("");
  return { text, syllables, tokens: tokenize(text) };
});
const SENTENCE_DATA = SENTENCES.map((text) => ({ text: text.normalize("NFC"), tokens: tokenize(text) }));
const DEFAULT_LETTERS = ["M", "A", "Á", "E", "É", "L"];
const GOAL = 5;
const HOLD_MS = 1500;

const settings = Object.assign(
  { letterCase: "upper", rate: "slow", sounds: true, colorSyllables: true },
  Store.get("nastaveni", {})
);

const state = {
  screen: "menu",
  selected: new Set(loadLetters()),
  bags: {},
  last: {},
  pools: null,
  item: null,
  game: null,
  parentBack: "start",
  confirmClear: false
};

const app = document.getElementById("app");
const toast = document.getElementById("toast");
let toastTimer = 0;
let missingShownAt = 0;
let holdTimer = 0;
let holdFired = false;

function loadLetters() {
  const saved = Store.get("pismena", DEFAULT_LETTERS);
  const list = Array.isArray(saved) ? saved.filter((letter) => LETTER_INDEX.has(letter)) : [];
  return list.length ? list : DEFAULT_LETTERS;
}

function applySettings() {
  Speech.setRate(settings.rate === "slow" ? 0.75 : 0.95);
  Sound.setEnabled(settings.sounds);
  Store.set("nastaveni", settings);
}

function selectionChanged() {
  Store.set("pismena", [...state.selected]);
  state.pools = null;
  state.bags = {};
  state.last = {};
}

function show(text) {
  return settings.letterCase === "upper" ? text.toLocaleUpperCase("cs") : text;
}

function showLetter(letter) {
  return settings.letterCase === "upper" ? letter : lower(letter);
}

function canRead(tokens) {
  return tokens.length > 0 && tokens.every((token) => state.selected.has(token));
}

function pools() {
  if (state.pools) return state.pools;
  const letters = ALPHABET.filter((item) => state.selected.has(item.letter)).map((item) => item.letter);
  const words = WORD_DATA.filter((word) => canRead(word.tokens));
  const seen = new Map();
  for (const word of words) {
    for (const part of word.syllables) {
      const text = lower(part);
      if (!seen.has(text)) seen.set(text, { text, tokens: tokenize(text) });
    }
  }
  state.pools = {
    letters,
    words,
    syllables: [...seen.values()],
    sentences: SENTENCE_DATA.filter((sentence) => canRead(sentence.tokens)),
    buildable: words.filter((word) => word.syllables.length > 1)
  };
  return state.pools;
}

// Shuffled bag, so every item shows up once before anything repeats.
function draw(key, list) {
  let bag = state.bags[key];
  if (!bag || !bag.length) {
    bag = shuffle(list);
    if (bag.length > 1 && bag[bag.length - 1] === state.last[key]) bag.unshift(bag.pop());
    state.bags[key] = bag;
  }
  const item = bag.pop();
  state.last[key] = item;
  return item;
}

function starCount() {
  const saved = Store.get("hvezdy", {});
  return saved.day === todayKey() ? saved.count : 0;
}

function addStar() {
  const count = starCount() + 1;
  Store.set("hvezdy", { day: todayKey(), count });
  const el = document.getElementById("stars");
  if (el) el.textContent = "\u2605 " + count;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function voiceReady() {
  const status = Speech.status();
  return status === "ok" || status === "checking";
}

function say(text) {
  Speech.say(text);
}

Speech.setOnMissing(() => {
  if (Date.now() - missingShownAt < 20000) return;
  missingShownAt = Date.now();
  showToast("Tady chybí český hlas, proto je ticho. Návod je v nastavení Pro rodiče.");
});

/* ---------- layout pieces ---------- */

function topBar(back, title, backLabel) {
  const left = back
    ? `<button type="button" class="btn soft" data-action="go" data-screen="${back}">\u2190 ${esc(backLabel || "Zpět")}</button>`
    : "<span></span>";
  return `<header class="top">
    ${left}
    <strong class="top-title">${esc(title)}</strong>
    <span class="stars" id="stars" title="Dnešní hvězdičky">\u2605 ${starCount()}</span>
  </header>`;
}

function parentButton() {
  return `<button type="button" class="btn soft gear" data-hold="parent" data-action="hold-hint" aria-label="Pro rodiče, podrž">\u2699<span class="sr"> Pro rodiče</span></button>`;
}

function dots(score) {
  let out = "";
  for (let i = 0; i < GOAL; i++) out += `<i class="${i < score ? "on" : ""}"></i>`;
  return `<span class="dots" id="dots" aria-label="${score} z ${GOAL}">${out}</span>`;
}

function sizeClass(text) {
  const n = text.length;
  if (n <= 2) return "xl";
  if (n <= 4) return "l";
  if (n <= 7) return "m";
  return "s";
}

function wordHtml(word) {
  if (!settings.colorSyllables || word.syllables.length < 2) return esc(show(word.text));
  return word.syllables.map((part, i) => `<span class="s${i % 2}">${esc(show(part))}</span>`).join("");
}

function winPanel() {
  return `<div class="win">
    <p class="win-star" aria-hidden="true">\u2605</p>
    <h2>Výborně!</h2>
    <p>Máš ${GOAL} z ${GOAL}.</p>
    <div class="actions">
      <button type="button" class="btn soft" data-action="go" data-screen="menu">Jiná hra</button>
      <button type="button" class="btn go" data-action="again">Hrát znovu</button>
    </div>
  </div>`;
}

/* ---------- start: letter picker ---------- */

function renderStart() {
  const pick = (item) => {
    const on = state.selected.has(item.letter) ? " on" : "";
    return `<button type="button" class="pick ${colorClass(item.letter)}${on}" data-action="toggle" data-letter="${item.letter}" aria-pressed="${on ? "true" : "false"}">${esc(showLetter(item.letter))}</button>`;
  };
  const main = ALPHABET.filter((item) => !item.foreign).map(pick).join("");
  const foreign = ALPHABET.filter((item) => item.foreign).map(pick).join("");
  const p = pools();
  return `<section class="start">
    <header class="hero-head">
      <div>
        <h1>Písmena</h1>
        <p class="lead">Vyber písmena, která už umíme ze školy.</p>
      </div>
      ${parentButton()}
    </header>
    <div class="picker">${main}</div>
    <h2 class="label small">Cizí písmena</h2>
    <div class="picker foreign">${foreign}</div>
    <div class="row-end"><button type="button" class="btn soft small" data-action="clear">Zrušit výběr</button></div>
    <div class="start-bar">
      <p class="hint">${state.selected.size} písmen \u00B7 ${p.words.length} slov \u00B7 ${p.sentences.length} vět</p>
      <button type="button" class="btn go big" data-action="go" data-screen="menu" ${state.selected.size ? "" : "disabled"}>Hotovo</button>
    </div>
  </section>`;
}

/* ---------- menu ---------- */

function tile(action, badge, title, sub, disabledReason, tone) {
  const disabled = disabledReason ? " disabled" : "";
  return `<button type="button" class="tile ${tone}" data-action="${action}"${disabled}>
    <span class="badge">${badge}</span>
    <b>${esc(title)}</b>
    <span class="sub">${esc(disabledReason || sub)}</span>
  </button>`;
}

function renderMenu() {
  const p = pools();
  const needWords = "s těmito písmeny zatím žádná slova";
  const needVoice = voiceReady() ? "" : "potřebuje český hlas";
  const twoLetters = p.letters.length < 2 ? "vyber aspoň 2 písmena" : "";
  const twoSyll = p.syllables.length < 2 ? needWords : "";
  const sample = (list, fn) => (list.length ? fn(pickOne(list)) : "");
  const chosen = p.letters.map(showLetter).join(" ");
  return `<section>
    <header class="hero-head">
      <div>
        <h1>Čtení</h1>
        <p class="lead">Co budeme dělat?</p>
      </div>
      <div class="head-side">
        <span class="stars" id="stars" title="Dnešní hvězdičky">\u2605 ${starCount()}</span>
        <button type="button" class="btn soft" data-action="go" data-screen="start">\u2699 Písmena</button>
      </div>
    </header>
    <p class="chosen"><span class="chosen-label">Vybraná písmena</span> ${esc(chosen)}</p>
    <h2 class="label">Čtení</h2>
    <div class="grid">
      ${tile("read-letters", esc(showLetter("A")), "Písmena", p.letters.length + " písmen", "", "blue")}
      ${tile("read-syllables", esc(sample(p.syllables, (s) => show(s.text)) || "ma"), "Slabiky", p.syllables.length + " slabik", p.syllables.length ? "" : needWords, "yellow")}
      ${tile("read-words", "\u{1F4D6}", "Slova", p.words.length + " slov", p.words.length ? "" : needWords, "green")}
      ${tile("read-sentences", "\u270F\uFE0F", "Věty", p.sentences.length + " vět", p.sentences.length ? "" : "věty přijdou s dalšími písmeny", "pink")}
    </div>
    <h2 class="label">Hry</h2>
    <div class="grid">
      ${tile("catch-letter", "\u2605", "Chyť písmeno", "bubliny v oblacích", twoLetters, "blue")}
      ${tile("balloon-letter", "\u{1F388}", "Balónky s písmeny", "stoupají vzhůru", twoLetters, "pink")}
      ${tile("catch-syll", "\u2601\uFE0F", "Chyť slabiku", "bubliny v oblacích", twoSyll, "yellow")}
      ${tile("balloon-syll", "\u{1F388}", "Balónky se slabikami", "stoupají vzhůru", twoSyll, "green")}
      ${tile("listen", "\u{1F442}", "Co slyšíš?", "najdi slovo, které slyšíš", needVoice || (p.words.length < 2 ? needWords : ""), "blue")}
      ${tile("first", "\u{1F524}", "Na co začíná?", "první písmeno slova", needVoice || (p.words.length && p.letters.length > 1 ? "" : needWords), "pink")}
      ${tile("build", "\u{1F9E9}", "Slož slovo", "slabiky ve správném pořadí", p.buildable.length ? "" : needWords, "yellow")}
    </div>
  </section>`;
}

/* ---------- reading ---------- */

const READ = {
  "read-letters": {
    title: "Přečti písmeno",
    list: () => pools().letters,
    text: (letter) => showLetter(letter),
    html: (letter) => esc(showLetter(letter)),
    speak: (letter) => letterInfo(letter).say
  },
  "read-syllables": {
    title: "Přečti slabiku",
    list: () => pools().syllables,
    text: (s) => show(s.text),
    html: (s) => esc(show(s.text)),
    speak: (s) => s.text
  },
  "read-words": {
    title: "Přečti slovo",
    list: () => pools().words,
    text: (w) => w.text,
    html: (w) => wordHtml(w),
    speak: (w) => w.text,
    bySyllable: true
  },
  "read-sentences": {
    title: "Přečti větu",
    list: () => pools().sentences,
    text: (s) => s.text,
    html: (s) => esc(show(s.text)),
    speak: (s) => s.text,
    sentence: true
  }
};

function startReading(mode) {
  const list = READ[mode].list();
  if (!list.length) return;
  state.game = { name: mode };
  state.item = draw(mode, list);
  state.screen = "read";
  render();
}

function renderRead() {
  const mode = READ[state.game.name];
  const item = state.item;
  const size = mode.sentence ? "sentence" : sizeClass(mode.text(item));
  const slow = mode.bySyllable && item.syllables.length > 1
    ? `<button type="button" class="btn soft" data-action="say-syllables">Po slabikách</button>`
    : "";
  return `<section>
    ${topBar("menu", mode.title)}
    <div class="stage"><div class="board"><p class="read ${size}">${mode.html(item)}</p></div></div>
    <div class="actions">
      <button type="button" class="btn soft" data-action="say-item">\u{1F50A} Poslechnout</button>
      ${slow}
      <button type="button" class="btn go" data-action="next">Další \u2192</button>
    </div>
  </section>`;
}

/* ---------- sky games (bubbles and balloons) ---------- */

function startSky(name) {
  const p = pools();
  const unit = name.endsWith("letter") ? "letter" : "syllable";
  const pool = unit === "letter" ? p.letters : shuffle(p.syllables).slice(0, 8).map((s) => s.text);
  if (pool.length < 2) return;
  state.game = {
    name,
    unit,
    kind: name.startsWith("balloon") ? "balloons" : "bubbles",
    pool,
    target: pickOne(pool),
    reveal: false,
    score: 0,
    won: false
  };
  state.screen = "sky";
  render();
  speakTarget();
}

function skyShow(value) {
  return state.game.unit === "letter" ? showLetter(value) : show(value);
}

function skyColor(value) {
  return colorClass(state.game.unit === "letter" ? value : tokenize(value)[0]);
}

function speakTarget() {
  const game = state.game;
  say(game.unit === "letter"
    ? "Chyť písmeno " + letterInfo(game.target).say
    : "Chyť slabiku " + game.target);
}

// Without a Czech voice the child could not know the target, so it is always shown.
function targetVisible() {
  return state.game.reveal || !voiceReady();
}

function paintTarget() {
  const game = state.game;
  const target = document.getElementById("target");
  const reveal = document.getElementById("reveal");
  const visible = targetVisible();
  target.textContent = visible ? skyShow(game.target) : "?";
  target.className = visible ? skyColor(game.target) : "secret";
  if (reveal) reveal.textContent = game.reveal ? "Skrýt" : "Ukaž";
}

function renderSky() {
  const game = state.game;
  const title = game.unit === "letter" ? "Chyť písmeno" : "Chyť slabiku";
  const visible = targetVisible();
  const revealButton = voiceReady()
    ? `<button type="button" class="btn soft reveal" id="reveal" data-action="reveal">${game.reveal ? "Skrýt" : "Ukaž"}</button>`
    : "";
  return `<section>
    ${topBar("menu", game.kind === "balloons" ? "Balónky" : title)}
    <div class="prompt">
      <p>Chyť <strong id="target" class="${visible ? skyColor(game.target) : "secret"}">${esc(visible ? skyShow(game.target) : "?")}</strong></p>
      ${dots(game.score)}
      <button type="button" class="btn soft" data-action="say-target" aria-label="Poslechnout">\u{1F50A}</button>
      ${revealButton}
    </div>
    <div id="sky" class="sky">${game.won ? winPanel() : ""}</div>
    <p class="status" id="status" aria-live="polite"></p>
  </section>`;
}

function mountSky() {
  const game = state.game;
  if (game.won) return;
  Sky.start({
    el: document.getElementById("sky"),
    kind: game.kind,
    pool: game.pool,
    target: () => state.game.target,
    show: skyShow,
    colorOf: skyColor,
    onTap: tapSky
  });
}

function tapSky(item) {
  const game = state.game;
  if (game.won) return;
  const status = document.getElementById("status");
  if (item.value !== game.target) {
    Sky.shake(item);
    Sound.blip(180);
    status.textContent = "To je " + skyShow(item.value);
    return;
  }
  Sound.blip(620);
  addStar();
  game.score += 1;
  Sky.hit(item);
  if (game.score >= GOAL) {
    game.won = true;
    Sky.stop();
    render();
    say("Výborně!");
    return;
  }
  const others = game.pool.filter((value) => value !== game.target);
  game.target = pickOne(others);
  game.reveal = false;
  paintTarget();
  document.getElementById("dots").outerHTML = dots(game.score);
  Sky.showTarget();
  status.textContent = "Výborně!";
  speakTarget();
}

/* ---------- choice games: Co slyšíš? and Na co začíná? ---------- */

function startChoice(name) {
  const p = pools();
  if (name === "listen" && p.words.length < 2) return;
  if (name === "first" && (!p.words.length || p.letters.length < 2)) return;
  state.game = { name, score: 0, won: false, locked: false };
  nextChoiceRound();
  state.screen = "choice";
  render();
  say(state.game.word.text);
}

function nextChoiceRound() {
  const game = state.game;
  const p = pools();
  game.word = draw(game.name, p.words);
  game.locked = false;
  if (game.name === "listen") {
    const others = shuffle(p.words.filter((word) => word.text !== game.word.text)).slice(0, 2);
    game.answer = game.word.text;
    game.choices = shuffle([game.word.text, ...others.map((word) => word.text)]);
  } else {
    const first = game.word.tokens[0];
    const others = shuffle(p.letters.filter((letter) => letter !== first)).slice(0, 2);
    game.answer = first;
    game.choices = shuffle([first, ...others]);
  }
}

function renderChoice() {
  const game = state.game;
  const isListen = game.name === "listen";
  const label = isListen ? "Které slovo slyšíš?" : "Na jaké písmeno začíná slovo?";
  const body = game.won ? winPanel() : `<div class="choices ${isListen ? "words" : "letters"}">
      ${game.choices.map((value, index) => `<button type="button" class="choice${isListen ? "" : " " + colorClass(value)}" data-action="answer" data-index="${index}">${esc(isListen ? show(value) : showLetter(value))}</button>`).join("")}
    </div>`;
  return `<section>
    ${topBar("menu", isListen ? "Co slyšíš?" : "Na co začíná?")}
    <div class="prompt">
      <p>${label}</p>
      ${dots(game.score)}
    </div>
    ${game.won ? "" : `<button type="button" class="btn soft wide" data-action="say-word">\u{1F50A} Poslechnout znovu</button>`}
    ${body}
  </section>`;
}

function answerChoice(node) {
  const game = state.game;
  if (game.locked || game.won) return;
  const value = game.choices[Number(node.dataset.index)];
  if (value !== game.answer) {
    shake(node);
    Sound.blip(180);
    return;
  }
  game.locked = true;
  node.classList.add("right");
  Sound.blip(620);
  addStar();
  game.score += 1;
  document.getElementById("dots").outerHTML = dots(game.score);
  setTimeout(() => {
    if (state.game !== game) return;
    if (game.score >= GOAL) {
      game.won = true;
      render();
      say("Výborně!");
      return;
    }
    nextChoiceRound();
    render();
    say(game.word.text);
  }, 900);
}

/* ---------- Slož slovo ---------- */

function startBuild() {
  if (!pools().buildable.length) return;
  state.game = { name: "build", score: 0, won: false };
  nextBuildRound();
  state.screen = "build";
  render();
  say(state.game.word.text);
}

function nextBuildRound() {
  const game = state.game;
  game.word = draw("build", pools().buildable);
  const parts = game.word.syllables.map((text, id) => ({ id, text, used: false }));
  let tiles = shuffle(parts);
  for (let i = 0; i < 5 && tiles.every((tile, index) => tile.text === game.word.syllables[index]); i++) tiles = shuffle(parts);
  game.tiles = tiles;
  game.placed = 0;
  game.hint = false;
  game.locked = false;
}

function renderBuild() {
  const game = state.game;
  if (game.won) {
    return `<section>${topBar("menu", "Slož slovo")}<div class="prompt"><p>Slož slovo</p>${dots(game.score)}</div>${winPanel()}</section>`;
  }
  const slots = game.word.syllables.map((part, index) => index < game.placed
    ? `<span class="slot full s${index % 2}">${esc(show(part))}</span>`
    : `<span class="slot"></span>`).join("");
  const tiles = game.tiles.map((tile, index) => `<button type="button" class="choice syll" data-action="place" data-index="${index}" ${tile.used ? "disabled" : ""}>${esc(show(tile.text))}</button>`).join("");
  return `<section>
    ${topBar("menu", "Slož slovo")}
    <div class="prompt">
      <p>Slož slovo ze slabik</p>
      ${dots(game.score)}
    </div>
    <div class="actions">
      <button type="button" class="btn soft" data-action="say-word">\u{1F50A} Poslechnout</button>
      <button type="button" class="btn soft" data-action="hint">${game.hint ? "Skrýt slovo" : "Ukaž slovo"}</button>
    </div>
    <p class="hint-word">${game.hint ? wordHtml(game.word) : " "}</p>
    <div class="slots">${slots}</div>
    <div class="choices syllables">${tiles}</div>
  </section>`;
}

function placeTile(node) {
  const game = state.game;
  if (game.locked) return;
  const tile = game.tiles[Number(node.dataset.index)];
  if (tile.used) return;
  if (lower(tile.text) !== lower(game.word.syllables[game.placed])) {
    shake(node);
    Sound.blip(180);
    return;
  }
  tile.used = true;
  game.placed += 1;
  Sound.blip(520);
  if (game.placed < game.word.syllables.length) {
    render();
    return;
  }
  game.locked = true;
  game.score += 1;
  addStar();
  render();
  say(game.word.text);
  setTimeout(() => {
    if (state.game !== game) return;
    if (game.score >= GOAL) {
      game.won = true;
      render();
      say("Výborně!");
      return;
    }
    nextBuildRound();
    render();
    say(game.word.text);
  }, 1300);
}

/* ---------- parent corner ---------- */

function segmented(key, options) {
  return `<div class="seg" role="group">${options.map(([value, label]) => {
    const on = String(settings[key]) === String(value) ? " on" : "";
    return `<button type="button" class="${on}" data-action="set" data-key="${key}" data-value="${value}" aria-pressed="${on ? "true" : "false"}">${esc(label)}</button>`;
  }).join("")}</div>`;
}

function voiceStatusText() {
  const status = Speech.status();
  if (status === "ok") return `Český hlas je připravený: <b>${esc(Speech.voiceName())}</b>.`;
  if (status === "checking") return "Hledám český hlas\u2026";
  if (status === "unsupported") return "Tento prohlížeč neumí číst nahlas. Zkuste Safari (iPhone, iPad) nebo Chrome (Android).";
  return "<b>Na tomto zařízení chybí český hlas.</b> Aplikace proto mlčí, aby nečetla anglicky. Hlas nainstalujete podle návodu níže.";
}

function renderParent() {
  return `<section class="parent">
    ${topBar(state.parentBack, "Pro rodiče")}
    <div class="panel">
      <h2>Písmo</h2>
      ${segmented("letterCase", [["upper", "VELKÁ PÍSMENA"], ["lower", "malá písmena"]])}
      <h2>Slabiky ve slovech</h2>
      ${segmented("colorSyllables", [[true, "Barevně"], [false, "Jednou barvou"]])}
      <h2>Rychlost hlasu</h2>
      ${segmented("rate", [["slow", "Pomalu"], ["normal", "Normálně"]])}
      <h2>Zvuky v hrách</h2>
      ${segmented("sounds", [[true, "Zapnuté"], [false, "Vypnuté"]])}
    </div>
    <div class="panel">
      <h2>Hlas</h2>
      <p>${voiceStatusText()}</p>
      <button type="button" class="btn soft wide" data-action="test-voice">\u{1F50A} Vyzkoušet hlas</button>
      <details>
        <summary>iPhone a iPad</summary>
        <ol>
          <li>Nastavení \u2192 Zpřístupnění \u2192 Mluvený obsah \u2192 Hlasy \u2192 Čeština. Stáhněte hlas (např. Zuzana).</li>
          <li>Na iPhonu vypněte tichý režim a zvyšte hlasitost.</li>
          <li>Stránku otevřete v Safari, ne v Messengeru ani ve WhatsAppu.</li>
          <li>Safari úplně zavřete a stránku otevřete znovu.</li>
        </ol>
      </details>
      <details>
        <summary>Android</summary>
        <ol>
          <li>Nastavení \u2192 Systém \u2192 Jazyky \u2192 Převod textu na řeč.</li>
          <li>U Google vyberte Nainstalovat hlasová data \u2192 Čeština.</li>
          <li>Stránku otevřete v Chromu a načtěte ji znovu.</li>
        </ol>
      </details>
      <details>
        <summary>Počítač</summary>
        <ol>
          <li>Mac: Nastavení systému \u2192 Zpřístupnění \u2192 Mluvený obsah \u2192 Systémový hlas \u2192 Spravovat hlasy \u2192 Čeština.</li>
          <li>Windows: Nastavení \u2192 Čas a jazyk \u2192 Řeč \u2192 Přidat hlasy \u2192 Čeština.</li>
          <li>Pak prohlížeč zavřete a otevřete znovu.</li>
        </ol>
      </details>
    </div>
    <div class="panel">
      <h2>Pokrok</h2>
      <p>Dnes \u2605 ${starCount()}. Hvězdička přibude za každé přečtené písmeno, slabiku, slovo nebo větu a za každou správnou odpověď ve hře.</p>
      <p class="muted">Vše se ukládá jen v tomto prohlížeči. Aplikace nic neodesílá a nepoužívá internet ani reklamy.</p>
      <button type="button" class="btn danger wide" data-action="clear-all">${state.confirmClear ? "Opravdu smazat? Klepněte znovu." : "Smazat pokrok a nastavení"}</button>
    </div>
  </section>`;
}

function openParent() {
  if (state.screen === "parent") return;
  state.parentBack = state.screen === "start" ? "start" : "menu";
  state.confirmClear = false;
  state.screen = "parent";
  render();
}

/* ---------- rendering and events ---------- */

const SCREENS = {
  start: renderStart,
  menu: renderMenu,
  read: renderRead,
  sky: renderSky,
  choice: renderChoice,
  build: renderBuild,
  parent: renderParent
};

function render() {
  Sky.stop();
  app.innerHTML = SCREENS[state.screen]();
  if (state.screen === "sky") mountSky();
}

function shake(node) {
  node.classList.remove("shake");
  void node.offsetWidth;
  node.classList.add("shake");
}

function startGame(name) {
  if (READ[name]) startReading(name);
  else if (name === "listen" || name === "first") startChoice(name);
  else if (name === "build") startBuild();
  else startSky(name);
}

const ACTIONS = {
  go(node) {
    if (node.dataset.screen === "menu" && !state.selected.size) return;
    state.screen = node.dataset.screen;
    state.game = null;
    render();
    window.scrollTo(0, 0);
  },
  toggle(node) {
    const letter = node.dataset.letter;
    if (state.selected.has(letter)) state.selected.delete(letter);
    else state.selected.add(letter);
    selectionChanged();
    render();
  },
  clear() {
    state.selected = new Set();
    selectionChanged();
    render();
  },
  next() {
    addStar();
    state.item = draw(state.game.name, READ[state.game.name].list());
    render();
  },
  "say-item"() {
    say(READ[state.game.name].speak(state.item));
  },
  "say-syllables"() {
    say(state.item.syllables.join(", "));
  },
  "say-target"() {
    speakTarget();
  },
  reveal() {
    state.game.reveal = !state.game.reveal;
    paintTarget();
  },
  "say-word"() {
    say(state.game.word.text);
  },
  answer: answerChoice,
  place: placeTile,
  hint() {
    state.game.hint = !state.game.hint;
    render();
  },
  again() {
    startGame(state.game.name);
  },
  set(node) {
    const raw = node.dataset.value;
    settings[node.dataset.key] = raw === "true" ? true : raw === "false" ? false : raw;
    applySettings();
    state.pools = null;
    render();
  },
  "test-voice"() {
    if (Speech.status() === "ok") say("Ahoj, budeme spolu číst.");
    else showToast("Český hlas zatím není k dispozici.");
  },
  "clear-all"() {
    if (!state.confirmClear) {
      state.confirmClear = true;
      render();
      return;
    }
    Store.clear();
    Object.assign(settings, { letterCase: "upper", rate: "slow", sounds: true, colorSyllables: true });
    applySettings();
    state.selected = new Set(DEFAULT_LETTERS);
    selectionChanged();
    state.confirmClear = false;
    state.screen = "menu";
    render();
    showToast("Smazáno.");
  },
  "hold-hint"() {
    if (holdFired) {
      holdFired = false;
      return;
    }
    showToast("Pro rodiče: podržte tlačítko \u2699 asi 2 sekundy.");
  }
};

app.addEventListener("click", (event) => {
  const node = event.target.closest("[data-action]");
  if (!node || node.disabled) return;
  const action = node.dataset.action;
  if (ACTIONS[action]) ACTIONS[action](node);
  else startGame(action);
});

// The parent corner opens only with a long press, so a child does not open it by accident.
app.addEventListener("pointerdown", (event) => {
  const node = event.target.closest("[data-hold]");
  if (!node) return;
  holdFired = false;
  node.classList.add("holding");
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdFired = true;
    node.classList.remove("holding");
    openParent();
  }, HOLD_MS);
});

function cancelHold() {
  clearTimeout(holdTimer);
  app.querySelectorAll(".holding").forEach((node) => node.classList.remove("holding"));
}
document.addEventListener("pointerup", cancelHold);
document.addEventListener("pointercancel", cancelHold);
app.addEventListener("contextmenu", (event) => {
  if (event.target.closest("[data-hold]")) event.preventDefault();
});

applySettings();
render();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
