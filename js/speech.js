"use strict";

// Speaks only with a Czech voice. Without one it stays silent, because the browser's
// fallback voice is usually English and would mispronounce everything.
const Speech = (() => {
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const LANG = "cs-CZ";
  let voice = null;
  let checked = false;
  let rate = 0.8;
  let onMissing = () => {};
  let pending = null;

  function isCzech(item) {
    const lang = (item.lang || "").replace("_", "-").toLowerCase();
    if (lang.startsWith("cs") || lang.startsWith("cz")) return true;
    const name = (item.name || "").toLowerCase();
    return /zuzana|jakub|vlasta|cs[- ]?cz|čeština|czech/.test(name);
  }

  function choose() {
    const voices = speechSynthesis.getVoices();
    const czech = voices.filter(isCzech);
    if (!czech.length) return null;

    const pick = (re) => czech.find((item) => re.test(item.name));
    const zuzana = pick(/zuzana/i);
    if (zuzana) return zuzana;
    const jakub = pick(/jakub/i);
    if (jakub) return jakub;

    const local = czech.filter((item) => item.localService);
    const pool = local.length ? local : czech;
    return pool[0];
  }

  function syncVoice() {
    const picked = choose();
    if (!picked) {
      voice = null;
      return;
    }
    const voices = speechSynthesis.getVoices();
    voice = voices.find((item) => item.name === picked.name && item.voiceURI === picked.voiceURI) || picked;
    if (!isCzech(voice)) voice = null;
  }

  function refresh() {
    syncVoice();
    if (voice || speechSynthesis.getVoices().length) checked = true;
    if (checked && pending) {
      const text = pending;
      pending = null;
      say(text);
    }
  }

  if (supported) {
    refresh();
    speechSynthesis.addEventListener("voiceschanged", refresh);
    setTimeout(refresh, 400);
    setTimeout(refresh, 1200);
    setTimeout(() => {
      refresh();
      checked = true;
      if (pending) {
        const text = pending;
        pending = null;
        say(text);
      }
    }, 2800);
  }

  function say(text) {
    if (!supported) {
      onMissing();
      return;
    }
    speechSynthesis.getVoices();
    syncVoice();
    if (!checked) {
      pending = text;
      return;
    }
    if (!voice) {
      onMissing();
      return;
    }
    const line = new SpeechSynthesisUtterance(lower(text));
    line.voice = voice;
    line.lang = LANG;
    line.rate = rate;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    speechSynthesis.speak(line);
  }

  return {
    say,
    refresh,
    status() {
      if (!supported) return "unsupported";
      syncVoice();
      if (voice) return "ok";
      return checked ? "missing" : "checking";
    },
    voiceName() {
      syncVoice();
      return voice ? voice.name : "";
    },
    setRate(value) {
      rate = value;
    },
    setOnMissing(fn) {
      onMissing = fn;
    }
  };
})();

const Sound = (() => {
  let ctx = null;
  let enabled = true;
  return {
    setEnabled(value) {
      enabled = value;
    },
    blip(freq) {
      if (!enabled) return;
      try {
        ctx = ctx || new AudioContext();
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch (e) {}
    }
  };
})();
