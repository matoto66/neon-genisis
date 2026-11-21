// NEON GENESIS — REDLINE (Tenkai's wanted level, 3 tiers).
//
// REDLINE 1 ▲△△  first citizen hit → Tenkai drops 2 scav drones on you.
// REDLINE 2 ▲▲△  another hit, any kill, or wiping the REDLINE 1 drones →
//                a squad (2 enforcers + gunner) drops in.
// REDLINE 3 ▲▲▲  keep going, or wipe the REDLINE 2 squad → Tenkai releases
//                RAZORBACK, a cyberpsycho on a leash. Final level: never cools
//                off. Kill it (bounty + record wiped) or die.
// Levels 1–2 cool off one step if you lay low (no new offenses, no responders
// alive). Dying clears everything. Responders 1–2 drop in fast (no cutscene);
// RAZORBACK keeps the full cinematic intro.
import * as THREE from "three";

export function createHeat({ game, combat, npcSys, encounters, audio, haptic, player }) {
  let level = 0, calmT = 0, dispatchT = 0;
  const sfx = n => audio?.play(n);
  const CALM = { 1: 45, 2: 60 };                      // seconds of laying low to drop a level
  const IDS = { 1: "redline_1", 2: "redline_2", 3: "psycho_hunt" };
  const COLORS = { 1: "#ffb02e", 2: "#ff6a2a", 3: "#ff2a3a" };
  const ESCAPE = 50;                                   // metres from every responder = "laying low"
  const pips = n => "▲".repeat(n) + "△".repeat(3 - n);

  const SQUADS = {
    1: { title: "REDLINE 1", wave: [["scav", -8, -12], ["scav", 8, -12]] },
    2: { title: "REDLINE 2", wave: [["enforcer", -6, -13], ["enforcer", 6, -13], ["gunner", 0, -16]] }
  };

  function raise(to, why) {
    to = Math.min(3, to);
    if (to <= level) return;
    level = to; calmT = 0;
    sfx("siren"); haptic?.("both", 0.5, 220);
    game.toast(`⚠ REDLINE ${level} ${pips(level)} · ${why}`, "warn");
    dispatchT = level === 3 ? 2.5 : 1.2;              // sirens first, then the drop
  }

  function offense(npc, killed) {
    if (level >= 3) return;                            // the dog's already loose
    if (killed) raise(Math.max(level + 1, 2), "CIVILIAN KILLED");
    else raise(level + 1, level === 0 ? "CITIZEN ASSAULT LOGGED" : "REPEAT OFFENDER");
  }

  function dispatch() {
    if (level === 3) {
      for (const l of [1, 2]) encounters.cancelCustom(IDS[l]);   // the troops clear out for the psycho
      encounters.startCustom(IDS[3], {
        title: "CYBERPSYCHO · RAZORBACK", sub: "REDLINE 3. Tenkai doesn't arrest people. It lets the dog off the leash.", color: "#ff2a3a",
        arrive: "dropship", boss: true, center: "player", wave: [["psycho", 0, -9]],
        when: () => !encounters.storyFightActive,
        onClear: () => { level = 0; calmT = 0; game.give?.(300, "Razorback bounty"); game.toast("RAZORBACK NEUTRALIZED · REDLINE cleared. Tenkai wiped your record. For now.", "complete"); },
        onFail: () => { level = 0; }
      });
      return;
    }
    const lv = level, sq = SQUADS[lv];
    encounters.startCustom(IDS[lv], {
      title: sq.title, sub: "", color: COLORS[lv], quick: true,
      arrive: "drop", center: "player", wave: sq.wave,
      when: () => !encounters.storyFightActive,
      // wiping Tenkai's own responders pushes you up a level, like killing cops
      onClear: () => { if (level === lv && lv < 3) raise(lv + 1, "TENKAI RESPONDERS DOWN"); },
      onFail: () => {}
    });
  }

  // still hot while any live responder is within ESCAPE metres of you
  function respondersClose() {
    for (const l of [1, 2]) for (const e of encounters.customEnemies(IDS[l]))
      if (!e.dead && (!player || Math.hypot(e.group.position.x - player.position.x, e.group.position.z - player.position.z) < ESCAPE)) return true;
    return false;
  }

  function update(dt) {
    if (dispatchT > 0 && (dispatchT -= dt) <= 0) dispatch();
    if (level === 1 || level === 2) {
      if (dispatchT > 0 || respondersClose()) calmT = 0;
      else if ((calmT += dt) >= CALM[level]) {
        for (let l = level; l >= 1; l--) encounters.cancelCustom(IDS[l]);   // they lose you and pull back
        level -= 1; calmT = 0;
        game.toast(level ? `REDLINE ${level} ${pips(level)} · Tenkai lost your trail.` : "REDLINE cleared. Behave.", "objective");
      }
    }
  }
  function hunter() { return encounters.customEnemies(IDS[3]).find(e => !e.dead) || null; }
  function nearestResponder() {
    for (const l of [2, 1]) { const e = encounters.customEnemies(IDS[l]).find(o => !o.dead); if (e) return e; }
    return null;
  }

  npcSys.hooks.onHurt = offense;
  combat.hooks.onDeath = () => {
    if (!level) return;
    for (const l of [1, 2, 3]) encounters.cancelCustom(IDS[l]);
    level = 0; dispatchT = 0; calmT = 0;
  };
  combat.hooks.deathLine = () => hunter() ? "RAZORBACK sends its regards." : null;

  return {
    update,
    debugDispatch() { level = 3; dispatch(); },
    debugSet(l) { level = 0; raise(l, "DEBUG"); },
    get level() { return level; },
    banner() {
      if (!level) return null;
      const title = `⚠ REDLINE ${level}  ${pips(level)}`;
      if (level === 3) { const h = hunter(); return { title, text: h ? "RAZORBACK is hunting you. Kill it or die trying. Running won't work." : "Sirens… something's coming.", color: COLORS[3], target: h ? h.group.position.clone().setY(1.4) : null }; }
      const r = nearestResponder();
      const left = Math.ceil(CALM[level] - calmT);
      const text = dispatchT > 0 ? "Sirens… Tenkai is dispatching." : calmT > 0 ? `Lay low. Trail goes cold in ${left} s.` : r ? (level === 1 ? `Drones on you. Get ${ESCAPE} m clear to lose them, or kill them and it gets worse.` : `Squad on you. Get ${ESCAPE} m clear, or wipe them and they release the psycho.`) : "Tenkai is looking for you.";
      return { title, text, color: COLORS[level], target: r ? r.group.position.clone().setY(1.4) : null };
    }
  };
}
