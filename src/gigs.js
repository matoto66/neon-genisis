// NEON GENESIS — gigs: repeatable side jobs from the GIG BOARD (wrist menu GIGS tab, or J on PC).
//
// Three offers at a time, re-rolled every few minutes. One active gig at a time.
//   COURIER  — carry a package to a drop point before the timer runs out (scooter helps).
//   NEST     — Tenkai drones have nested somewhere: go there and wipe them.
//   BOUNTY   — a marked punk and his guard are holed up somewhere: drop the mark.
// Gig fights use the encounter system (quick drop-in, no cutscene) and don't raise REDLINE.
// Dying fails the active gig. Only totals (gigs done, cash earned) are saved.
import * as THREE from "three";
import { state, saveGame } from "./state.js";

export function createGigs({ game, combat, encounters, player, audio }) {
  const REROLL = 300;                                   // seconds between fresh boards
  const COLOR = "#ff6fe0";
  const FIGHT_ID = "gig_fight";
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const totals = () => (state.gigs ||= { done: 0, earned: 0 });

  // places on the street grid you can walk to (ground level)
  const DROPS = [
    { name: "Lantern Alley", p: [-18, 0, 9.5] }, { name: "the drain vent, Sump east", p: [17, 0, -10] },
    { name: "the Sump junction", p: [0, 0, -46] }, { name: "outside Second Skin", p: [8, 0, -80] },
    { name: "the Neon Mile east alley", p: [28.5, 0, -104.6] }, { name: "Spire Plaza", p: [0, 0, -118] },
    { name: "the Docks gate", p: [44, 0, -46] }, { name: "the lot by the noodle bar", p: [14, 0, 5.2] }
  ];
  const FIGHT_SPOTS = [
    { name: "the Sump main drag", p: [0, 0, 22] }, { name: "the Sump junction", p: [0, 0, -46] },
    { name: "mid Neon Mile", p: [0, 0, -90] }, { name: "Spire Plaza", p: [0, 0, -118] }
  ];
  const CLIENTS = ["a fixer called Static", "Mama Okoye's noodle crew", "a nervous med-tech", "a Sump runner kid", "an off-book Spire clerk", "a scrap dealer named Vex"];
  const PACKAGES = ["a sealed med-cooler", "a crate of bootleg chips", "a datashard wrapped in foil", "a jar of something that hums", "spare cyber-knee parts"];
  const MARKS = ["\"Kettle\" Draven", "Sixfinger Lu", "Mosswick", "\"Halfcode\" Reyes", "Brick Tanaka"];

  let offers = [], active = null, rerollT = REROLL;

  const dist2 = p => Math.hypot(p[0] - player.position.x, p[2] - player.position.z);
  function makeOffer(type) {
    type ||= pick(["courier", "nest", "bounty"]);
    if (type === "courier") {
      const spots = DROPS.filter(d => dist2(d.p) > 25);
      const d = pick(spots.length ? spots : DROPS);
      return { type, title: "COURIER", where: d.name, p: d.p, pay: 0, client: pick(CLIENTS), cargo: pick(PACKAGES) };
    }
    const s = pick(FIGHT_SPOTS);
    if (type === "nest") return { type, title: "NEST CLEAR", where: s.name, p: s.p, pay: Math.round(rnd(230, 290) / 10) * 10, client: pick(CLIENTS) };
    return { type, title: "BOUNTY", where: s.name, p: s.p, pay: Math.round(rnd(340, 420) / 10) * 10, client: pick(CLIENTS), mark: pick(MARKS) };
  }
  function courierPay(o) { return Math.min(380, Math.round((150 + dist2(o.p) * 1.4) / 10) * 10); }
  function describe(o) {
    if (o.type === "courier") return `Run ${o.cargo} to ${o.where} for ${o.client}. Timed.`;
    if (o.type === "nest") return `Tenkai drones nesting at ${o.where}. Wipe them out.`;
    return `${o.mark} is holed up at ${o.where} with a guard. Drop him.`;
  }
  function reroll() {
    offers = [makeOffer("courier"), makeOffer(Math.random() < 0.5 ? "nest" : "bounty"), makeOffer()];
    rerollT = REROLL;
  }
  reroll();

  function accept(i) {
    if (active) return "Finish or drop your current gig first.";
    const o = offers[i]; if (!o) return "";
    if (o.type === "courier") { o.pay = courierPay(o); o.timeLeft = Math.round(dist2(o.p) / 2.4 + 35); }
    active = o; offers.splice(i, 1, makeOffer());
    game.toast(`GIG ACCEPTED · ${o.title}${o.type === "courier" ? ` · ${o.timeLeft} s` : ""}`, "mission");
    if (o.type !== "courier") startFight(o);
    return `Gig accepted. ${o.type === "courier" ? "Package is in your bag. Move." : "Marked on your HUD."}`;
  }
  function startFight(o) {
    const wave = o.type === "nest"
      ? [["scav", -4, -3], ["scav", 4, -3], ["sentry", 0, 3]]
      : [["gunner", 0, -2], ["enforcer", 3, 1]];
    encounters.cancelCustom(FIGHT_ID);
    encounters.startCustom(FIGHT_ID, {
      title: o.title, sub: "", color: COLOR, quick: true, arrive: "drop", center: o.p, wave,
      // only kicks off when you get there (and no story fight is running)
      when: () => !encounters.storyFightActive && dist2(o.p) < 16,
      onClear: () => { if (active === o) complete(); },
      onFail: () => { if (active === o) fail("You went down. Gig's blown."); }
    });
  }
  function complete() {
    const o = active; active = null;
    const t = totals(); t.done++; t.earned += o.pay; saveGame();
    game.toast(`GIG COMPLETE · ${o.title}`, "complete");
    game.give?.(o.pay, `${o.client}`);
  }
  function fail(why) {
    if (!active) return;
    const o = active; active = null;
    if (o.type !== "courier") encounters.cancelCustom(FIGHT_ID);
    game.toast(`GIG FAILED · ${why}`, "warn");
  }
  function abandon() { if (!active) return ""; fail("You walked away from it."); return "Gig dropped. Word gets around, but whatever."; }

  function update(dt) {
    if (!active && (rerollT -= dt) <= 0) reroll();
    if (active?.type === "courier") {
      active.timeLeft -= dt;
      if (dist2(active.p) < 3) complete();
      else if (active.timeLeft <= 0) fail("Too slow. The client hung up.");
    }
  }

  // dying blows the active gig (fight gigs also fail through encounters' onFail)
  const prevDeath = combat.hooks.onDeath;
  combat.hooks.onDeath = () => { prevDeath?.(); if (active) fail("You went down. Gig's blown."); };

  function fightTarget() {
    const e = encounters.customEnemies(FIGHT_ID).find(o => !o.dead);
    return e ? e.group.position.clone().setY(1.4) : null;
  }

  // GIG BOARD panel (shares the store panel with Rook's)
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;
  const store = {
    title: "GIG BOARD · WORK ON THE WIRE", accent: COLOR, tabColor: "#a0287a",
    tabs: [{ id: "board", label: "GIGS" }],
    subtitle: () => `DONE ${totals().done} · EARNED $${totals().earned.toLocaleString()}${active ? "" : ` · NEW GIGS ${mmss(rerollT)}`}`,
    rows() {
      const rows = [];
      if (active) rows.push({ id: "drop", name: `ACTIVE · ${active.title}`, color: COLOR, tag: `$${active.pay}${active.type === "courier" ? ` · ${Math.ceil(active.timeLeft)} s left` : ""}`, desc: describe(active), label: "DROP GIG", buttonColor: "#5a2a3a" });
      offers.forEach((o, i) => rows.push({ id: "take:" + i, name: o.title, color: "#ffffff", tag: o.type === "courier" ? `~$${courierPay(o)} · ${o.where.toUpperCase()}` : `$${o.pay} · ${o.where.toUpperCase()}`, desc: describe(o), label: active ? "BUSY" : "ACCEPT", buttonColor: active ? "#56607a" : "#a0287a" }));
      return rows;
    },
    click(id) { if (id === "drop") return abandon(); if (id.startsWith("take:")) return accept(+id.slice(5)); return ""; }
  };

  return {
    update, store,
    get active() { return active; },
    banner() {
      if (!active) return null;
      const o = active;
      if (o.type === "courier") return { title: `GIG · COURIER · ${Math.max(0, Math.ceil(o.timeLeft))} s`, text: `Deliver ${o.cargo} to ${o.where}. $${o.pay}.`, color: COLOR, target: new THREE.Vector3(o.p[0], 1.4, o.p[2]) };
      const t = fightTarget();
      const text = o.type === "nest" ? (t ? "Wipe the nest." : `Head to ${o.where}. Tenkai drones nesting there.`) : (t ? `Drop ${o.mark}.` : `Find ${o.mark} at ${o.where}.`);
      return { title: `GIG · ${o.title} · $${o.pay}`, text, color: COLOR, target: t || new THREE.Vector3(o.p[0], 1.4, o.p[2]) };
    },
    debugComplete() { if (active) complete(); }
  };
}
