// NEON GENESIS — sound.
//
// Every sound is generated live with the Web Audio API: no audio files to
// download. Buses: music, ambience, sfx, voice → master. Positional sounds
// (Sato's stall, the Genesis Core…) use THREE.PositionalAudio so they sit in
// 3D space and pan correctly inside the headset.
//
// Browsers only allow audio after a click/tap, so init() is called from the
// PLAY / ENTER VR buttons.

import * as THREE from "three";

const SETTINGS_KEY = "neon-genesis-audio-v2";
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note → Hz

export function createAudio(camera) {
  let ctx = null, listener = null, master, buses = {};
  const settings = { master: 0.45, music: 0.3, sfx: 0.55, ambience: 0.35, voice: 0.4, muted: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
  const positional = [];       // { audio, object, start }
  let noiseBuffer = null;
  let started = false;

  // ── setup ───────────────────────────────────────────────────────────────
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    listener = new THREE.AudioListener();
    camera.add(listener);
    ctx = listener.context;
    master = listener.getInput();
    for (const name of ["music", "ambience", "sfx", "voice"]) {
      const g = ctx.createGain();
      g.connect(master);
      buses[name] = g;
    }
    // gentle master compressor keeps sudden stingers from clipping
    applyVolumes();
    noiseBuffer = makeNoise(2);
    if (ctx.state === "suspended") ctx.resume();
    for (const p of positional) p.start?.();
  }
  function applyVolumes() {
    if (!ctx) return;
    listener.setMasterVolume(settings.muted ? 0 : settings.master);
    for (const k of Object.keys(buses)) buses[k].gain.setTargetAtTime(settings[k], ctx.currentTime, 0.05);
  }
  function setVolume(key, v) {
    settings[key] = v;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    applyVolumes();
  }
  function makeNoise(seconds, brown = false) {
    const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  const now = () => ctx.currentTime;
  function noiseSource(loop = false, buffer = noiseBuffer) {
    const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = loop; return s;
  }
  function env(gainNode, t, a, peak, d, sustain = 0, r = 0.05) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
    if (r) g.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  }
  function tone({ freq = 440, type = "sine", t = now(), a = 0.005, d = 0.2, peak = 0.3, bus = "sfx", glide = null, filter = null, detune = 0, dest = null }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || "lowpass"; f.frequency.value = filter.freq; f.Q.value = filter.q || 0.7; o.connect(f); node = f; }
    node.connect(g); g.connect(dest || buses[bus]);
    env(g, t, a, peak, d);
    o.start(t); o.stop(t + a + d + 0.1);
    return o;
  }
  function noiseHit({ t = now(), a = 0.002, d = 0.08, peak = 0.3, type = "bandpass", freq = 1200, q = 1, bus = "sfx", glide = null }) {
    const s = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (glide) f.frequency.exponentialRampToValueAtTime(glide, t + a + d);
    s.connect(f); f.connect(g); g.connect(buses[bus]);
    env(g, t, a, peak, d);
    s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.1);
  }

  // ── ambience: rain + city drone + distant traffic ───────────────────────
  let rainGain, cityGain, trafficFilter;
  function startAmbience() {
    // rain = two bands of noise
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    const rainSoften = ctx.createBiquadFilter(); rainSoften.type = "lowpass"; rainSoften.frequency.value = 3200;
    rainGain.connect(rainSoften); rainSoften.connect(buses.ambience);
    for (const [freq, q, vol] of [[1700, 0.5, 0.022], [600, 0.8, 0.016]]) {
      const s = noiseSource(true), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(rainGain); s.start();
    }
    // low city rumble with slowly moving filter (traffic swells)
    cityGain = ctx.createGain(); cityGain.gain.value = 0; cityGain.connect(buses.ambience);
    const brown = noiseSource(true, makeNoise(4, true));
    trafficFilter = ctx.createBiquadFilter(); trafficFilter.type = "lowpass"; trafficFilter.frequency.value = 300;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 140; lfo.connect(lfoGain); lfoGain.connect(trafficFilter.frequency); lfo.start();
    brown.connect(trafficFilter); trafficFilter.connect(cityGain); brown.start();
    // electrical hum of the grid (50/100 Hz) — very quiet
    for (const [f, v] of [[50, 0.025], [100, 0.012]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(cityGain); o.start(); }
  }

  // ── positional loops attached to objects in the world ──────────────────
  function attachLoop(object, kind, { refDistance = 2, maxDistance = 30, volume = 1 } = {}) {
    const rec = { object, kind, audio: null };
    rec.start = () => {
      if (rec.audio || !ctx) return;
      const audio = new THREE.PositionalAudio(listener);
      audio.setRefDistance(refDistance); audio.setMaxDistance(maxDistance); audio.setDistanceModel("linear"); audio.setRolloffFactor(1);
      audio.panner.panningModel = "HRTF";
      const out = ctx.createGain(); out.gain.value = volume;
      audio.setNodeSource(buildLoop(kind, out));
      audio.gain.disconnect(); audio.gain.connect(buses[kind === "music_box" ? "music" : "ambience"]);
      object.add(audio);
      rec.audio = audio; rec.out = out;
    };
    positional.push(rec);
    if (ctx) rec.start();
    return rec;
  }
  function buildLoop(kind, out) {
    if (kind === "sizzle") {        // Sato's wok: crackly high noise + bubbling
      const s = noiseSource(true), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "highpass"; f.frequency.value = 3500; g.gain.value = 0.18;
      const am = ctx.createOscillator(), amg = ctx.createGain(); am.frequency.value = 11; amg.gain.value = 0.1; am.connect(amg); amg.connect(g.gain); am.start();
      s.connect(f); f.connect(g); g.connect(out); s.start();
      const b = noiseSource(true), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
      bf.type = "bandpass"; bf.frequency.value = 400; bf.Q.value = 4; bg.gain.value = 0.08;
      b.connect(bf); bf.connect(bg); bg.connect(out); b.start();
    } else if (kind === "core") {   // Genesis Core: harmonic hum with slow beating + shimmer
      for (const [n, v, det] of [[45, 0.16, 0], [57, 0.1, 4], [64, 0.05, -3], [76, 0.025, 6]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = n < 50 ? "sine" : "triangle";
        o.frequency.value = NOTE(n); o.detune.value = det; g.gain.value = v; o.connect(g); g.connect(out); o.start();
      }
      const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 0.4; tg.gain.value = 0.35;
      const vca = ctx.createGain(); vca.gain.value = 0.7; trem.connect(tg); tg.connect(vca.gain); trem.start();
      out.connect(vca);
      return vca;   // the tremolo stage is the final output
    } else if (kind === "neon") {   // buzzing neon tube
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = 120; f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 2; g.gain.value = 0.05;
      o.connect(f); f.connect(g); g.connect(out); o.start();
    } else if (kind === "vent") {   // steam vent hiss
      const s = noiseSource(true), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 5000; f.Q.value = 0.5; g.gain.value = 0.12;
      s.connect(f); f.connect(g); g.connect(out); s.start();
    } else if (kind === "crowd") {  // murmuring crowd: formant-filtered noise bursts
      const s = noiseSource(true), g = ctx.createGain(); g.gain.value = 0.0;
      for (const [fr, q] of [[500, 6], [1500, 8], [2500, 10]]) { const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = fr; f.Q.value = q; s.connect(f); f.connect(g); }
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = "triangle"; lfo.frequency.value = 2.3; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      const base = ctx.createConstantSource(); base.offset.value = 0.3; base.connect(g.gain); base.start();
      g.connect(out); s.start();
    } else if (kind === "hologram") {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "square"; o.frequency.value = 60; g.gain.value = 0.02; o.connect(g); g.connect(out); o.start();
      const s = noiseSource(true), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = "highpass"; f.frequency.value = 6000; ng.gain.value = 0.04; s.connect(f); f.connect(ng); ng.connect(out); s.start();
    }
    return out;
  }

  // ── music: a tiny synthwave sequencer, one mood per district ───────────
  const MOODS = {
    menu:   { bpm: 84, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], bass: true, arp: true, drums: 0, pad: 0.06 },
    sump:   { bpm: 76, chords: [[57, 60, 64], [53, 57, 60], [55, 58, 62], [52, 55, 59]], bass: true, arp: false, drums: 0, pad: 0.07, keys: true },
    ring:   { bpm: 92, chords: [[50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 59], [45, 48, 52, 55]], bass: true, arp: true, drums: 1, pad: 0.05 },
    mile:   { bpm: 104, chords: [[54, 57, 61, 64], [52, 56, 59, 62], [50, 54, 57, 61], [49, 52, 56, 59]], bass: true, arp: true, drums: 2, pad: 0.05 },
    plaza:  { bpm: 70, chords: [[45, 48, 52], [44, 48, 51], [43, 46, 50], [44, 47, 51]], bass: true, arp: false, drums: 0, pad: 0.08, tense: true },
    roof:   { bpm: 80, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 66]], bass: true, arp: true, drums: 0, pad: 0.06 },
    finale: { bpm: 66, chords: [[57, 61, 64, 68], [54, 57, 61, 64], [50, 54, 57, 61], [52, 56, 59, 64]], bass: true, arp: true, drums: 0, pad: 0.09 }
  };
  let mood = null, nextMood = null, musicGain = null, step = 0, nextTime = 0, timer = null;
  function setMood(name) {
    if (!ctx || name === mood || name === nextMood) return;
    nextMood = name;
    if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(buses.music); }
    // fade out, switch, fade in
    musicGain.gain.setTargetAtTime(0.0001, now(), 0.6);
    setTimeout(() => {
      mood = nextMood; nextMood = null; step = 0; nextTime = now() + 0.1;
      musicGain.gain.setTargetAtTime(1, now(), 1.2);
      if (!timer) timer = setInterval(schedule, 40);
    }, mood ? 1600 : 50);
  }
  function schedule() {
    if (!ctx || !mood) return;
    const m = MOODS[mood], sixteenth = 60 / m.bpm / 4;
    while (nextTime < now() + 0.15) {
      const bar = Math.floor(step / 16), s16 = step % 16, chord = m.chords[bar % m.chords.length], t = nextTime;
      if (s16 === 0) {       // pad chord: detuned saws through a soft lowpass
        for (const n of chord) for (const det of [-8, 8]) tone({ freq: NOTE(n), type: "sawtooth", t, a: 0.8, d: sixteenth * 16 - 0.6, peak: m.pad / chord.length, bus: "music", detune: det, filter: { freq: m.tense ? 700 : 1100, q: 0.5 }, dest: musicGain });
      }
      if (m.bass && (s16 === 0 || s16 === 6 || s16 === 10)) tone({ freq: NOTE(chord[0] - 12), type: "triangle", t, a: 0.01, d: sixteenth * 4, peak: 0.16, dest: musicGain, filter: { freq: 500 } });
      if (m.arp && s16 % 2 === 0) {
        const n = chord[(s16 / 2) % chord.length] + (s16 >= 8 ? 12 : 0);
        tone({ freq: NOTE(n), type: "square", t, a: 0.003, d: sixteenth * 1.6, peak: 0.028, dest: musicGain, filter: { freq: 2400, q: 2 } });
      }
      if (m.keys && (s16 === 4 || s16 === 12) && Math.random() < 0.6) {      // lonely electric piano
        const n = chord[Math.floor(Math.random() * chord.length)] + 12;
        tone({ freq: NOTE(n), type: "sine", t, a: 0.005, d: 1.4, peak: 0.05, dest: musicGain });
        tone({ freq: NOTE(n) * 2, type: "sine", t, a: 0.005, d: 0.5, peak: 0.015, dest: musicGain });
      }
      if (m.tense && s16 === 8 && bar % 2 === 1) tone({ freq: NOTE(chord[0] + 24), type: "sine", t, a: 0.6, d: 1.5, peak: 0.03, dest: musicGain, glide: NOTE(chord[0] + 23) });
      if (m.drums) {
        if (s16 % 4 === 0) { tone({ freq: 120, type: "sine", t, a: 0.002, d: 0.18, peak: 0.28, dest: musicGain, glide: 45 }); }
        if (m.drums > 1 && (s16 === 4 || s16 === 12)) noiseHit({ t, d: 0.12, peak: 0.08, freq: 1800, q: 0.8, bus: "music" });
        if (s16 % 2 === 1) noiseHit({ t, d: 0.03, peak: 0.025, type: "highpass", freq: 8000, bus: "music" });
      }
      step++; nextTime += sixteenth;
    }
  }

  // ── one-shot effects ───────────────────────────────────────────────────
  const SFX = {
    click:   () => { tone({ freq: 1800, type: "square", d: 0.03, peak: 0.06, filter: { freq: 4000 } }); },
    hover:   () => { tone({ freq: 2600, type: "sine", d: 0.02, peak: 0.025 }); },
    open:    () => { noiseHit({ d: 0.25, peak: 0.08, freq: 800, glide: 4000, q: 2 }); tone({ freq: 660, d: 0.2, peak: 0.05, glide: 990 }); },
    close:   () => { noiseHit({ d: 0.2, peak: 0.06, freq: 3000, glide: 600, q: 2 }); },
    pickup:  () => { const t = now(); [76, 81, 88].forEach((n, i) => tone({ freq: NOTE(n), type: "triangle", t: t + i * 0.06, d: 0.25, peak: 0.12 })); },
    shard:   () => { const t = now(); [72, 79, 84, 91].forEach((n, i) => tone({ freq: NOTE(n), type: "sine", t: t + i * 0.07, d: 0.6, peak: 0.1 })); noiseHit({ d: 0.6, peak: 0.04, type: "highpass", freq: 7000 }); },
    credits: () => { const t = now(); tone({ freq: NOTE(88), type: "square", t, d: 0.08, peak: 0.05, filter: { freq: 5000 } }); tone({ freq: NOTE(95), type: "square", t: t + 0.07, d: 0.25, peak: 0.05, filter: { freq: 5000 } }); },
    mission: () => { const t = now(); [60, 64, 67, 72].forEach((n, i) => tone({ freq: NOTE(n), type: "sawtooth", t: t + i * 0.09, d: 0.5, peak: 0.05, filter: { freq: 2500 } })); },
    objective: () => { const t = now(); tone({ freq: NOTE(79), t, d: 0.15, peak: 0.08 }); tone({ freq: NOTE(84), t: t + 0.1, d: 0.3, peak: 0.08 }); },
    complete: () => { const t = now(); [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((c, i) => c.forEach(n => tone({ freq: NOTE(n), type: "sawtooth", t: t + i * 0.16, d: i === 3 ? 1.6 : 0.2, peak: 0.035, filter: { freq: 3000 } }))); },
    chapter: () => { const t = now(); tone({ freq: 40, type: "sine", t, a: 0.01, d: 2.5, peak: 0.25, glide: 30 }); noiseHit({ t, d: 2, peak: 0.12, type: "lowpass", freq: 2000, glide: 200 }); [57, 64, 69, 73, 76].forEach((n, i) => tone({ freq: NOTE(n), type: "sawtooth", t: t + 0.4 + i * 0.12, a: 0.2, d: 3, peak: 0.03, filter: { freq: 1800 } })); },
    warn:    () => { const t = now(); tone({ freq: 220, type: "square", t, d: 0.12, peak: 0.06, filter: { freq: 1200 } }); tone({ freq: 196, type: "square", t: t + 0.14, d: 0.18, peak: 0.06, filter: { freq: 1200 } }); },
    district: () => { tone({ freq: NOTE(69), type: "sine", a: 0.3, d: 1.2, peak: 0.05 }); tone({ freq: NOTE(76), type: "sine", a: 0.4, d: 1.2, peak: 0.03 }); },
    lift:    () => { tone({ freq: 90, type: "sawtooth", a: 0.3, d: 1.2, peak: 0.08, glide: 160, filter: { freq: 600 } }); noiseHit({ a: 0.2, d: 1.2, peak: 0.05, type: "lowpass", freq: 600 }); },
    door:    () => { tone({ freq: 180, type: "sawtooth", a: 0.05, d: 0.5, peak: 0.05, glide: 120, filter: { freq: 900 } }); noiseHit({ d: 0.15, peak: 0.05, freq: 300 }); },
    jammer:  () => { const t = now(); for (let i = 0; i < 6; i++) tone({ freq: 400 + Math.random() * 1600, type: "square", t: t + i * 0.04, d: 0.03, peak: 0.04 }); tone({ freq: NOTE(84), t: t + 0.3, d: 0.3, peak: 0.07 }); },
    spark:   () => { noiseHit({ d: 0.06, peak: 0.12, type: "highpass", freq: 5000 }); noiseHit({ t: now() + 0.08, d: 0.04, peak: 0.08, type: "highpass", freq: 6000 }); },
    flare:   () => { const t = now(); noiseHit({ t, a: 0.6, d: 0.4, peak: 0.15, freq: 300, glide: 6000, q: 3 }); tone({ freq: 55, t: t + 0.9, d: 2.5, peak: 0.25, glide: 35 }); [69, 76, 81, 88].forEach((n, i) => tone({ freq: NOTE(n), type: "sine", t: t + 0.9 + i * 0.05, d: 2.5, peak: 0.06 })); },
    jump:    () => { noiseHit({ d: 0.08, peak: 0.05, freq: 600 }); },
    land:    () => { noiseHit({ d: 0.1, peak: 0.12, type: "lowpass", freq: 400 }); tone({ freq: 70, d: 0.12, peak: 0.12, glide: 40 }); }
  };
  function play(name) { if (ctx && SFX[name]) SFX[name](); }

  // Footsteps: wet street slaps, rooftop gravel, clinic tile — rate follows speed.
  let stepTimer = 0, stepSide = 0;
  function footsteps(dt, moving, sprinting, surface) {
    if (!ctx || moving < 0.1) { stepTimer = Math.min(stepTimer, 0.15); return; }
    stepTimer -= dt * moving * (sprinting ? 1.55 : 1);
    if (stepTimer > 0) return;
    stepTimer = 0.42;
    stepSide ^= 1;
    const t = now(), v = sprinting ? 0.16 : 0.11;
    if (surface === "roof") noiseHit({ t, d: 0.07, peak: v, freq: 1800 + stepSide * 300, q: 0.6 });
    else if (surface === "tile") { noiseHit({ t, d: 0.04, peak: v, freq: 3200, q: 1.5 }); tone({ freq: 900, t, d: 0.03, peak: 0.02 }); }
    else { noiseHit({ t, d: 0.06, peak: v, type: "lowpass", freq: 900 + stepSide * 150 }); noiseHit({ t: t + 0.02, d: 0.1, peak: v * 0.5, freq: 3000, q: 0.8 }); }
  }

  // ── character voices: Animal-Crossing-style babble, one voice per person ─
  const VOICES = {
    mika:    { base: 62, spread: 5, rate: 0.075, type: "triangle", formant: 1800 },
    sato:    { base: 48, spread: 3, rate: 0.11, type: "sawtooth", formant: 900 },
    rei:     { base: 66, spread: 7, rate: 0.06, type: "square", formant: 2400 },
    doc:     { base: 57, spread: 4, rate: 0.09, type: "triangle", formant: 1500 },
    pip:     { base: 74, spread: 8, rate: 0.055, type: "square", formant: 3000 },
    lulu:    { base: 64, spread: 6, rate: 0.07, type: "sawtooth", formant: 2000 },
    whisper: { base: 50, spread: 2, rate: 0.13, type: "sine", formant: 700, breathy: true },
    ishida:  { base: 45, spread: 2, rate: 0.1, type: "sawtooth", formant: 800, glitch: true },
    GENESIS: { base: 45, spread: 12, rate: 0.12, type: "sine", formant: 1200, robot: true },
    narrator:{ base: 55, spread: 2, rate: 0.14, type: "sine", formant: 1000, soft: true },
    citizen: { base: 58, spread: 5, rate: 0.08, type: "triangle", formant: 1400 }
  };
  let voiceStop = 0;
  function speak(speaker, text) {
    if (!ctx) return;
    const v = VOICES[speaker] || VOICES.citizen;
    const t0 = Math.max(now(), voiceStop);
    const syllables = Math.min(28, Math.max(4, Math.round(String(text).length / 7)));
    let t = now() + 0.05;
    const rand = mulberry(String(text).length * 31 + (speaker || "").length);
    for (let i = 0; i < syllables; i++) {
      const n = v.base + Math.round((rand() - 0.5) * 2 * v.spread) + (i === syllables - 1 ? -3 : 0);
      const dur = v.rate * (0.7 + rand() * 0.6);
      if (v.robot) {
        tone({ freq: NOTE(n), type: "sine", t, d: dur, peak: 0.07, bus: "voice" });
        tone({ freq: NOTE(n + 7), type: "square", t, d: dur, peak: 0.02, bus: "voice", filter: { freq: v.formant } });
      } else {
        tone({ freq: NOTE(n), type: v.type, t, a: 0.01, d: dur, peak: v.soft ? 0.03 : 0.07, bus: "voice", filter: { type: "bandpass", freq: v.formant * (0.8 + rand() * 0.4), q: 1.2 } });
        if (v.breathy) noiseHit({ t, d: dur, peak: 0.03, freq: 2500, q: 1, bus: "voice" });
        if (v.glitch && rand() < 0.3) noiseHit({ t: t + dur * 0.5, d: 0.03, peak: 0.05, type: "highpass", freq: 6000, bus: "voice" });
      }
      t += dur + 0.02 + (rand() < 0.15 ? 0.12 : 0);
    }
    voiceStop = t;
  }
  function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

  // ── per-frame: listener, ambience mix ──────────────────────────────────
  function update(dt, { inCity, district, indoors, height }) {
    if (!ctx) return;
    if (!started && inCity) { started = true; startAmbience(); }
    if (rainGain) {
      const rain = !inCity ? 0 : indoors ? 0.25 : 1;
      rainGain.gain.setTargetAtTime(rain, now(), 0.4);
      cityGain.gain.setTargetAtTime(!inCity ? 0 : indoors ? 0.35 : district === "NEON MILE" ? 1 : 0.8, now(), 0.6);
    }
  }

  return {
    init, play, speak, footsteps, setMood, update, attachLoop, setVolume, settings,
    get ready() { return !!ctx; },
    toggleMute() { settings.muted = !settings.muted; setVolume("master", settings.master); return settings.muted; }
  };
}
