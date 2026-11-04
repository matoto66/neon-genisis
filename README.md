# Neon Genesis VR

An anime-inspired, open-world cyberpunk VR game for Meta Quest 3 / 3S, built with Three.js and WebXR.
Play it at **https://matoto66.github.io/neon-genisis/** (Quest Browser → **ENTER VR**).

## The story so far

Neo Kasumi used to be run by **GENESIS**, a city-grid AI that shared power fairly — even with the poor
districts. Nine years ago, on the night locals call *the Quiet*, Tenkai Dynamics shut it down and took the grid.
You wake up in **the Sump** with $500, a buzzing junk-grade arm implant and no memory of last night.
Mika, the Sump's best mechanic, calls you *Static*. The Genesis Core on her workbench is the last piece of
the old AI… and it recognises you.

**Chapter 1 — Static Signal** (6 parts): Mika's repair job and the salvage capacitors, the Genesis Core
wakes up, Old Sato's rumours, Rei's rooftop hideout and the Tenkai sensor pylons, Doc Anaya's clinic, and
Tenkai's offer at Spire Plaza. Accept or refuse — Mika remembers which.
* **Side jobs:** Pip's lost drone (needs Strength), Lulu's shorting junction boxes, Whisper's five GENESIS data shards.

## Controls

| | Quest | PC |
|---|---|---|
| Move | Left stick | WASD / arrows |
| Sprint | Click the left stick (stops when you let go of the stick) | Hold Shift |
| Turn | Right stick (smooth, turns around your head) | Mouse (click to lock) |
| Interact / talk / grab | Point + trigger (either hand) | Look at it + **F** (or click) |
| Dialogue choices | Point + trigger | **1–4** or click |
| Jump | A | Space |
| Menu (stats, cyberware, objective) | Y | E |
| Mika's door | Grab the handle with trigger and twist | F |
| Mute sound | — | M |

## Districts

* **The Sump** — start area. Mika's Repair (west side), Sato's noodle stand (market lot, east), Lantern Alley,
  Drain Alley, Rust Alley (freight lift up to the capsule-hotel rooftop).
* **Ring Road** — cross street with the holographic koi circling the junction.
* **Neon Mile** — towers, night market, Second Skin clinic (buy cyberware here), Shimmer Alley shrine.
* **Spire Plaza** — the Tenkai Spire and the giant holographic orb you can see from everywhere.

## Progression

* 3 starting attribute points (Strength / Health / Cyberware Compatibility); finishing chapters awards more.
* Compatibility = cyberware slots (2 + compatibility) and which grades your body accepts.
* Cyberware is bought in person from Doc Anaya and has real effects (speed, jump, health, credit bonus,
  turning, objective distance + shard beacons).
* Progress saves automatically on the device. "Start a new story" on the title screen erases it.

## Project structure

```
index.html            page, start screen, desktop HUD/menus (cache-busting ?v= on CSS/JS)
style.css             all 2D UI styling
Genisis_ core.gltf    the Genesis Core model (Blockbench)
src/main.js           renderer, VR session, controls, hands, Mika's shop, menus, main loop
src/city.js           the city: districts, collision boxes, rooftops, signage, props, rain, fog
src/npcs.js           NPC characters (named + crowd), walking/idle/sitting/talking animation
src/story.js          story data: characters, dialogue, missions, cyberware, collectibles
src/quests.js         gameplay: mission engine, dialogue/shop board, interactions, beacons, toasts
src/state.js          player state and saving
src/optimize.js       draw-call reduction (skinned merging, static merging)
src/audio.js          all sound: procedural music per district, rain/city ambience, 3D sounds, footsteps, voices
src/character.js      character builder shared by NPCs and the player creator
src/creator.js        character creator options, presets, randomizer, saving
src/intro.js          holographic story intro (plays on a new story; replay from Settings)
src/guide.js          objective guide: sky beam or dotted path line along the streets
genesis_core_v2.glb   the detailed Genesis Core (Genisis_ core.gltf is kept as the fallback/backup)
tools/                build_genesis_core.html — rebuilds genesis_core_v2.glb
```

**Adding content:** new dialogue/missions go in `src/story.js` only. Positions for story places live in the
`anchors` object in `src/city.js`.

## Performance notes (Quest)

* Static city geometry is merged into ~40 meshes; NPCs and the robotic hands are GPU-skinned (2 draw calls each).
* Only 4 real point lights in the city; street-lamp glow is faked with additive light pools.
* Fixed foveated rendering is on; NPCs further than ~36 m are hidden.

## Developer tips

* Open the page with `?debug` (e.g. `index.html?debug`) to get `window.__NEON` in the console:
  `__NEON.teleport(x, y, z, yaw)`, `__NEON.stats()` (draw calls), `__NEON.game.debug` (missions, dialogue).
* GitHub Pages caches files for ~10 minutes. When you change `src/main.js` or `style.css`, bump the `?v=` in `index.html`.

## Built with

Three.js r180 · WebXR · JavaScript · GitHub Pages
