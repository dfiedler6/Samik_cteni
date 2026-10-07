"use strict";

// Speaks only with a Czech voice. Without one it stays silent, because the browser's
// fallback voice is usually English and would mispronounce everything.
const Speech = (() => {
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let voice = null;
  let checked = false;
  let rate = 0.8;
  let onMissing = () => {};
  let pending = null;

  function isCzech(item) {
    return (item.lang || "").replace("_", "-").toLowerCase().startsWith("cs");
  }

  function choose() {
    const czech = speechSynthesis.getVoices().filter(isCzech);
    if (!czech.length) return null;
    const local = czech.filter((item) => item.localService);
    const pool = local.length ? local : czech;
    return pool.find((item) => /zuzana/i.test(item.name)) || pool[0];
  }

  function refresh() {
    voice = choose();
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
    setTimeout(() => {
      checked = true;
      if (pending) {
        const text = pending;
        pending = null;
        say(text);
      }
    }, 2500);
  }

  function say(text) {
    if (!supported) {
      onMissing();
      return;
    }
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
    line.lang = voice.lang.replace("_", "-");
    line.rate = rate;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    speechSynthesis.speak(line);
  }

  return {
    say,
    status() {
      if (!supported) return "unsupported";
      if (voice) return "ok";
      return checked ? "missing" : "checking";
    },
    voiceName() {
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
