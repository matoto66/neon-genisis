// NEON GENESIS — Tenkai heat (wanted level).
//
// Hurting a citizen the first time logs a WARNING (it wears off after a few minutes).
// Hurt someone again — or kill anyone — and Tenkai doesn't send cops: it releases
// RAZORBACK, a cyberpsycho on a leash, and drops it right on top of you.
// Kill it and your record is wiped (plus a bounty). Die and Tenkai calls it even.
import * as THREE from "three";

export function createHeat({ game, combat, npcSys, encounters, audio, haptic }) {
  let level = 0, warnT = 0, dispatchT = 0;
  const sfx = n => audio?.play(n);
  const WARN_TIME = 180;

  function offense(npc, killed) {
    if (level >= 2) return;                         // it's already coming for you
    if (level === 0 && !killed) {
      level = 1; warnT = WARN_TIME;
      game.toast("⚠ TENKAI WARNING · Citizen assault logged. Do it again and they send something.", "warn");
      sfx("siren"); haptic?.("both", 0.4, 200);
      return;
    }
    level = 2; dispatchT = 2.5;                     // a short delay: sirens, then the drop
    game.toast(killed ? "⚠ CIVILIAN KILLED · TENKAI IS RELEASING A CYBERPSYCHO" : "⚠ SECOND OFFENSE · TENKAI IS RELEASING A CYBERPSYCHO", "warn");
    sfx("siren");
  }
  function dispatch() {
    encounters.startCustom("psycho_hunt", {
      title: "CYBERPSYCHO · RAZORBACK", sub: "Tenkai doesn't arrest people. It lets the dog off the leash.", color: "#ff2a3a",
      arrive: "dropship", boss: true, center: "player", wave: [["psycho", 0, -9]],
      when: () => !encounters.storyFightActive,
      onClear: () => { level = 0; game.give?.(300, "Razorback bounty"); game.toast("RAZORBACK NEUTRALIZED · Tenkai wiped your record. For now.", "complete"); },
      onFail: () => { level = 0; }
    });
  }
  function update(dt) {
    if (level === 1) { warnT -= dt; if (warnT <= 0) { level = 0; game.toast("Tenkai warning expired. Behave.", "objective"); } }
    if (dispatchT > 0 && (dispatchT -= dt) <= 0) dispatch();
  }
  function hunter() { return encounters.customEnemies("psycho_hunt").find(e => !e.dead) || null; }

  npcSys.hooks.onHurt = offense;
  combat.hooks.onDeath = () => { if (level) { encounters.cancelCustom("psycho_hunt"); level = 0; dispatchT = 0; } };
  combat.hooks.deathLine = () => hunter() ? "RAZORBACK sends its regards." : null;

  return {
    update,
    debugDispatch() { level = 2; dispatch(); },
    get level() { return level; },
    banner() {
      if (level === 1) return { title: "⚠ TENKAI WARNING", text: `Citizen assault logged. One more and they release something. (${Math.ceil(warnT / 60)} min)`, color: "#ffb02e" };
      if (level === 2) { const h = hunter(); return { title: "⚠ CYBERPSYCHO HUNTING YOU", text: h ? "Kill RAZORBACK or die trying. Running won't work." : "Sirens… something's coming.", color: "#ff2a3a", target: h ? h.group.position.clone().setY(1.4) : null }; }
      return null;
    }
  };
}
