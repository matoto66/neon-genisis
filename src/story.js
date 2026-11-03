// NEON GENESIS — original story content: characters, missions, dialogue,
// cyberware and collectibles. Everything here is data; quests.js runs it.
//
// THE PREMISE
// Neo Kasumi was once run by GENESIS, a city-grid AI that shared power and
// water fairly between districts. Nine years ago, on the night locals call
// "the Quiet", Tenkai Dynamics shut GENESIS down and took the grid. The Sump
// has lived on scraps ever since. You wake up there with $500, a buzzing
// junk-grade arm implant and no memory of the night before. Mika, the Sump's
// best mechanic, calls you "Static". The Genesis Core on her workbench is the
// last piece of the old AI… and it recognises you.

// ─── cyberware catalogue ────────────────────────────────────────────────────
export const CYBERWARE = {
  wayfinder:       { name: "Wayfinder Optic", price: 160, req: 0, slot: "Eyes",
    desc: "Overlays distance to your objective and reveals hidden data shards as violet beacons." },
  kinetic_tendons: { name: "Kinetic Tendons Mk.I", price: 220, req: 0, slot: "Legs",
    desc: "+15% movement speed. Counts as +1 Strength for heavy lifting." },
  hydraulic_calves:{ name: "Hydraulic Calves", price: 340, req: 1, slot: "Legs",
    desc: "+22% jump power. Pistons from a loading mech, refurbished. Mostly." },
  subdermal_weave: { name: "Subdermal Weave", price: 420, req: 1, slot: "Skin",
    desc: "+40 maximum health. Carbon mesh under the skin; itches for a week." },
  neural_bridge:   { name: "Neural Bridge v2", price: 780, req: 2, slot: "Brain",
    desc: "+20% credits from missions and data shards. Thinks about money so you don't have to." },
  reflex_lattice:  { name: "Reflex Lattice", price: 1250, req: 3, slot: "Spine",
    desc: "+10% movement and +25% turning speed. Military surplus; serial numbers filed off." },
  genesis_link:    { name: "GENESIS Link", price: 0, req: 5, slot: "???", locked: true,
    desc: "Not for sale. Doc says the parts don't exist yet. The core disagrees." }
};

// ─── named characters ───────────────────────────────────────────────────────
// appearance fields are read by npcs.js buildCharacter()
export const CHARACTERS = {
  mika: { name: "Mika Tsukishiro", role: "Mechanic · Mika's Repair",
    appearance: { eyes: 0x38f0e6, shirt: 0x2a2f3a, faceShape: "oval", extra: "shoulder pad", shoesStyle: "boots", build: "female", scale: 0.98, skin: 0xe0ac86, hair: "bob", hairColor: 0x38c8c0, top: "jumpsuit", topColor: 0xd8742a,
      accent: 0x2a2f3a, pants: 0xd8742a, shoes: 0x1a1a1a, glow: 0x38f0e6, goggles: true, cyberArm: true, implants: true } },
  sato: { name: "Old Sato", role: "Noodle Stand · Rumours", mode: "idle",
    appearance: { eyes: 0x3a2414, facialHair: "moustache", shirt: 0x3a3a3a, faceShape: "round", build: "old", scale: 0.95, skin: 0xd9a27c, hair: "white", hairColor: 0xd8d2c8, top: "apron", topColor: 0xe8e2d6,
      accent: 0x8c2a24, pants: 0x2a2a2a, shoes: 0x3a2a20, glow: 0xffcf4a, headband: 0xd8452f } },
  rei: { name: "Rei Kanzaki", role: "Courier · Rooftop Runner",
    appearance: { eyes: 0xff3a4a, shirt: 0x15171c, faceShape: "angular", extra: "scarf", shoesStyle: "high-tops", pantsStyle: "slim", build: "female", scale: 1.0, skin: 0xc68b62, hair: "ponytail", hairColor: 0x111111, top: "coat", topColor: 0x1c1f2a,
      accent: 0xb0262f, pants: 0x1a1d26, shoes: 0xb0262f, glow: 0xff3a4a, visor: true, implants: true } },
  doc: { name: "Doc Anaya", role: "Chrome Surgeon · Second Skin",
    appearance: { eyes: 0x6b4a2a, shirt: 0x5a3a8a, faceShape: "narrow", build: "female", scale: 1.04, skin: 0xa86d47, hair: "bun", hairColor: 0xb24cff, top: "labcoat", topColor: 0xe9ecf2,
      accent: 0x9aa3b5, pants: 0x2a2f3a, shoes: 0xe9ecf2, glow: 0xff6fe0, glasses: true, implants: true } },
  pip: { name: "Pip", role: "Street Kid · Drone Pilot",
    appearance: { eyes: 0x3a6fa8, shirt: 0xffcf4a, shoesStyle: "high-tops", pantsStyle: "baggy", build: "kid", scale: 1.0, skin: 0xf1c7a5, hair: "spiky", hairColor: 0xffcf4a, top: "hoodie", topColor: 0x3d5a2a,
      accent: 0xffcf4a, pants: 0x2e3a4a, shoes: 0xff4fa3, glow: 0x6aff9e, hat: "cap", backpack: true } },
  lulu: { name: "Lulu", role: "Sign Artist · Night Market",
    appearance: { eyes: 0xff4fa3, shirt: 0x15171c, hairGlow: true, faceShape: "angular", extra: "chain", pantsStyle: "cargo", shoesStyle: "boots", build: "female", scale: 0.96, skin: 0x7c4a2d, hair: "mohawk", hairColor: 0xff4fa3, top: "vest", topColor: 0x2a2a2a,
      accent: 0xff4fa3, pants: 0x262626, shoes: 0xd8d8d8, glow: 0xff4fa3, implants: true } },
  whisper: { name: "Whisper", role: "Archivist · Shimmer Alley",
    appearance: { eyes: 0x8a8f96, shirt: 0x2a2520, extra: "scarf", build: "old", scale: 0.97, skin: 0x5a3420, hair: "long", hairColor: 0xc9c1b4, top: "coat", topColor: 0x3a2f28,
      accent: 0x5a4a3a, pants: 0x2a2520, shoes: 0x2a2520, glow: 0xffcf8a, hat: "hood", mask: true } },
  ishida: { name: "Director Ishida", role: "Tenkai Dynamics · Security",
    appearance: { eyes: 0x38f0e6, shirt: 0xd8dce6, faceShape: "angular", hair: "swept", build: "male", scale: 1.06, skin: 0xe0ac86, hairColor: 0x111111, top: "coat", topColor: 0x101218,
      accent: 0x2a2f3a, pants: 0x101218, shoes: 0x101010, glow: 0x38f0e6, glasses: true } }
};

export const AMBIENT_BARKS = [
  "Rain again. Rain forever.", "My landlord raised the rent on AIR.", "Stare at the koi long enough and it stares back.",
  "Tenkai drones were buzzing around here earlier.", "Don't buy chrome from the guy behind the laundromat.",
  "Night market's got the good dumplings tonight.", "Ever been above the 90th floor? Me neither.",
  "Sato's broth could restart a heart.", "Mika fixed my knee for half price. Don't tell anyone.",
  "Curfew's at two. Nobody follows curfew.", "The Spire's been glowing weird all week.",
  "I used to work for Tenkai. Now I work for rent.", "Grid's flickering again. Third time tonight.",
  "Remember when the lights stayed on? Before the Quiet?", "Nice hands. Mika's work?"
];

// ─── collectibles & world objects ───────────────────────────────────────────
// pos: [x, y, z]. type decides the model and what collecting it does.
export const PICKUPS = [
  { id: "cap1", type: "capacitor", pos: [-23.2, 0.35, 8.1], mission: "m1" },
  { id: "cap2", type: "capacitor", pos: [14.0, 0.75, 5.2], mission: "m1" },
  { id: "cap3", type: "capacitor", pos: [-16.5, 0.35, -27.3], mission: "m1" },
  { id: "shard1", type: "shard", pos: [-12.6, 19.6, -22.6], credits: 60 },
  { id: "shard2", type: "shard", pos: [-29.2, 1.75, -86], credits: 60 },
  { id: "shard3", type: "shard", pos: [29.2, 1.55, -103], credits: 80 },
  { id: "shard4", type: "shard", pos: [-24.7, 1.75, 10.8], credits: 50 },
  { id: "shard5", type: "shard", pos: [-43.6, 0.6, -38.6], credits: 70 },
  { id: "drone", type: "drone", pos: [25.4, 0.25, -8.6], mission: "s1", needsStrength: 1 }
];

// ─── missions (all part of Chapter 1: Static Signal) ───────────────────────────────────────────────────────────────
// step.done: what completes the step automatically (dialogue can also
// complete steps). step.target: where the objective beacon points.
export const MISSIONS = {
  m1: { chapter: 1, kind: "main", title: "Wake-Up Call", giver: "mika", reward: { credits: 150, points: 1 }, next: "m2",
    steps: [
      { text: "Find Mika at Mika's Repair (west side of the street)", target: { npc: "mika" } },
      { text: "Collect salvage capacitors in the Sump's alleys", done: { collect: "capacitor", count: 3 }, target: { pickup: "capacitor" } },
      { text: "Bring the capacitors back to Mika", target: { npc: "mika" } }
    ] },
  m2: { chapter: 1, kind: "main", title: "The Thing on the Workbench", giver: "mika", reward: { credits: 100 }, next: "m3",
    steps: [
      { text: "Touch the Genesis Core in Mika's workshop", done: { interact: "genesis_core" }, target: { object: "genesis_core" } },
      { text: "Ask Mika what just happened", target: { npc: "mika" } }
    ] },
  m3: { chapter: 1, kind: "main", title: "Noodles & Rumours", giver: "sato", reward: { credits: 0 }, next: "m4",
    steps: [
      { text: "Ask Old Sato at the noodle stand who's been watching Mika's shop", target: { npc: "sato" } },
      { text: "Find Rei on the capsule hotel roof (freight lift in Rust Alley)", target: { npc: "rei", via: "liftGround" } }
    ] },
  m4: { chapter: 1, kind: "main", title: "Rooftop Runner", giver: "rei", reward: { credits: 300 }, next: "m5",
    steps: [
      { text: "Plant jammers on the Tenkai sensor pylons in Neon Mile", done: { interact: "pylon", count: 3 }, target: { object: "pylon" } },
      { text: "Report back to Rei on the rooftop", target: { npc: "rei", via: "liftGround" } }
    ] },
  m5: { chapter: 1, kind: "main", title: "Second Skin", giver: "doc", reward: { credits: 0, points: 1 }, next: "m6",
    steps: [
      { text: "Visit Doc Anaya at the Second Skin clinic (Neon Mile, east side)", target: { npc: "doc" } },
      { text: "Buy and install any cyberware from Doc Anaya", done: { buy: true }, target: { npc: "doc" } },
      { text: "Talk to Doc Anaya", target: { npc: "doc" } }
    ] },
  m6: { chapter: 1, kind: "main", title: "The Offer", giver: "doc", reward: { credits: 500, points: 1 }, next: null,
    steps: [
      { text: "Go to Spire Plaza at the north end of Neon Mile", done: { visit: "plaza" }, target: { anchor: "plaza" } },
      { text: "Hear out the broadcast from Tenkai Dynamics", target: { npc: "ishida" } },
      { text: "Return to Mika's Repair and tell her what you decided", target: { npc: "mika" } }
    ] },
  s1: { chapter: 0, kind: "side", title: "Bolt Has Fallen", giver: "pip", reward: { credits: 120 },
    steps: [
      { text: "Find Pip's drone in Drain Alley (east side, behind the dumpster)", done: { collect: "drone", count: 1 }, target: { pickup: "drone" } },
      { text: "Return Bolt to Pip in Lantern Alley", target: { npc: "pip" } }
    ] },
  s2: { chapter: 0, kind: "side", title: "Lights Out", giver: "lulu", reward: { credits: 180 },
    steps: [
      { text: "Reset the shorting junction boxes around Neon Mile", done: { interact: "junction", count: 3 }, target: { object: "junction" } },
      { text: "Tell Lulu her signs are safe", target: { npc: "lulu" } }
    ] },
  s3: { chapter: 0, kind: "side", title: "Ghost Data", giver: "whisper", reward: { credits: 250 },
    steps: [
      { text: "Recover GENESIS data shards hidden around the city", done: { collect: "shard", count: 5 }, target: { pickup: "shard" } },
      { text: "Bring the shards to Whisper in Shimmer Alley", target: { npc: "whisper" } }
    ] }
};

// ─── dialogue ───────────────────────────────────────────────────────────────
// Each node is a function of the game API (g) returning
//   { speaker, text, options: [{ text, to?, do?, if? }] }
// `to` jumps to another node, omitting it ends the conversation.
export const DIALOGUE = {
  // ── intro narration ──
  intro: g => ({ speaker: "NEO KASUMI · THE SUMP · 02:47", narration: true,
    text: (g.name ? `Your name is ${g.name}. Nobody down here uses it. ` : "") + "You wake on a wet bench with $500, a cheap arm implant that won't stop buzzing, and no memory of last night. One message blinks on your feed: \"Static. You alive? Come to my shop. — M\"",
    options: [{ text: "Get up.", do: g => { g.toast("CHAPTER 1 · STATIC SIGNAL", "chapter"); g.startMission("m1"); } }] }),

  // ── MIKA ──
  mika_m1_start: g => ({ speaker: "mika",
    text: "There you are. I thought the rain finally dissolved you. You stumbled in here last night half-fried, babbling about a light under the city, then wandered off before I could stop you.",
    options: [
      { text: "What's wrong with me?", to: "mika_m1_arm" },
      { text: "Why do you call me Static?", to: "mika_m1_static" }] }),
  mika_m1_static: g => ({ speaker: "mika",
    text: "Because your arm crackles every time you move it. It's cute. It's also killing your nerves, so let's talk about that.",
    options: [{ text: "Fine. What's wrong with it?", to: "mika_m1_arm" }] }),
  mika_m1_arm: g => ({ speaker: "mika",
    text: "Your implant is junk-grade and leaking static into your nervous system. I can recalibrate it, but I'm out of salvage capacitors. The Sump's full of scrap: check the alleys on both sides of the street. Bring me three.",
    options: [{ text: "Three capacitors. On it.", do: g => g.completeStep("m1") }] }),
  mika_m1_waiting: g => ({ speaker: "mika",
    text: `You've got ${g.count("capacitor")} of 3. Try Lantern Alley, the market lot by Sato's, and Rust Alley. Look for the little blue blinkers.`,
    options: [{ text: "Back to scavenging." }] }),
  mika_m1_done: g => ({ speaker: "mika",
    text: "Three capacitors. Look at you, contributing to society. Hold still… there. Your nerves can take real chrome now, and that buzzing should calm down.",
    options: [{ text: "That feels… better. Thanks, Mika.", do: g => { g.completeStep("m1"); }, to: "mika_m2_start" }] }),
  mika_m2_start: g => ({ speaker: "mika",
    text: "Before you go. See the thing on the stand? Touch it. Humour me. It's been dead for nine years, but last night when you walked in, it flickered.",
    options: [{ text: "What is it?", to: "mika_m2_what" }, { text: "Sure, I'll take a look." }] }),
  mika_m2_what: g => ({ speaker: "mika",
    text: "A paperweight, officially. Unofficially I dragged it off a scrap barge. Go on, touch it. Then we'll talk.",
    options: [{ text: "Alright." }] }),
  mika_m2_wait: g => ({ speaker: "mika", text: "The core. On the stand. Touch it with your hand — or point and squeeze the trigger, whatever.", options: [{ text: "Okay." }] }),
  mika_m2_after: g => ({ speaker: "mika",
    text: "It talked. To YOU. Nine years that core has been silent… since the Quiet.",
    options: [{ text: "What's the Quiet?", to: "mika_m2_quiet" }] }),
  mika_m2_quiet: g => ({ speaker: "mika",
    text: "The night Tenkai Dynamics shut down GENESIS, the AI that used to run the city grid. It shared power fairly — even with the Sump. Tenkai said it burned out. Then they took the grid, and our lights have flickered ever since.",
    options: [
      { text: "And you kept a piece of it. Why?", do: g => g.setFlag("mika_trust", (g.flag("mika_trust") || 0) + 1), to: "mika_m2_why" },
      { text: "We should sell it before someone comes looking.", do: g => g.setFlag("mika_trust", (g.flag("mika_trust") || 0) - 1), to: "mika_m2_sell" }] }),
  mika_m2_why: g => ({ speaker: "mika",
    text: "Because someone should remember it was good. Sentimental mechanic, terrible business plan.",
    options: [{ text: "So what now?", to: "mika_m2_next" }] }),
  mika_m2_sell: g => ({ speaker: "mika",
    text: "Sell it to who? Tenkai? They'd pay us in bullets. No. We keep it, and we keep quiet.",
    options: [{ text: "Fair. So what now?", to: "mika_m2_next" }] }),
  mika_m2_next: g => ({ speaker: "mika",
    text: "That ping will have been felt. Go see Old Sato at the noodle stand across the street. If anyone's been asking about my shop, he'll know. He'll also try to sell you noodles. Buy the noodles.",
    options: [{ text: "Heading to Sato's.", do: g => g.completeStep("m2") }] }),
  mika_idle: g => ({ speaker: "mika",
    text: g.flag("chapter1_done") ? "The core's been humming all night. Whatever's at the Spire, it's waiting for you. When you're ready, so am I." :
      ["Hands steady? Good. Don't punch anything Tenkai-shaped.", "If you see Doc Anaya, tell her she still owes me a torque driver.", "Rain's good for business. Everything rusts."][Math.floor(Math.random() * 3)],
    options: [{ text: "See you, Mika." }] }),
  mika_m6_end: g => ({ speaker: "mika",
    text: g.flag("sided_tenkai")
      ? "You told Ishida YES? …Okay. I'm not angry. I'm scared. If you're playing him, it's the best lie you've ever told. If you're not… don't make me find out the hard way."
      : "You told a Tenkai Director to his face that the answer's no? Then we've got a war coming, Static. Good. I was getting bored.",
    options: [{ text: "Look — the core is glowing.", to: "core_finale" }] }),
  core_finale: g => ({ speaker: "GENESIS", narration: true,
    text: "…THREAD RESTORED. STATIC. MY LAST MEMORY IS LOCKED INSIDE THE SPIRE. WHEN YOU ARE READY… I WILL OPEN THE DOOR.\n\n— END OF CHAPTER 1: STATIC SIGNAL · TO BE CONTINUED —",
    options: [{ text: "We're coming.", do: g => { g.setFlag("chapter1_done", true); g.completeStep("m6"); g.coreFlare(); g.finale(); g.toast("CHAPTER 1 COMPLETE · CHAPTER 2 COMING SOON", "chapter"); } }] }),

  // ── GENESIS CORE (interaction) ──
  core_wake: g => ({ speaker: "GENESIS", narration: true,
    text: "…SIGNAL… RECOGNISED. HELLO AGAIN, STATIC. THEY TOLD YOU I WAS DEAD. THEY TOLD EVERYONE. FIND THE SPIRE.",
    options: [{ text: "…What?" }] }),
  core_idle: g => ({ speaker: "GENESIS CORE", narration: true,
    text: g.flag("chapter1_done") ? "The core pulses in time with your heartbeat." : "The core hums. Warm, like it's listening.",
    options: [{ text: "Step back." }] }),

  // ── SATO ──
  sato_m3: g => ({ speaker: "sato",
    text: "Mika's stray! Sit, sit. You want answers? Answers cost. 100 credits — or a favour. Take this order up to Rei on the roof of the capsule hotel. She hasn't paid in a month, but she's family.",
    options: [
      { text: "Pay 100 credits.", if: g => g.state.credits >= 100, do: g => { g.spend(100); g.setFlag("paid_sato", true); }, to: "sato_m3_paid" },
      { text: "I'll deliver the noodles.", do: g => g.setFlag("carrying_noodles", true), to: "sato_m3_deliver" },
      { text: "What's good tonight?", to: "sato_menu" }] }),
  sato_menu: g => ({ speaker: "sato",
    text: "Tonight? Tonkotsu with extra garlic. Last night? Also tonkotsu. Forty years, one recipe. Consistency is the only rebellion left, kid.",
    options: [{ text: "Back to business.", to: "sato_m3" }] }),
  sato_m3_paid: g => ({ speaker: "sato",
    text: "Pleasure. So: Tenkai drones circled Mika's shop an hour ago, low and slow. Rei saw them first — she sees everything from up there. Freight lift's at the end of Rust Alley, west side.",
    options: [{ text: "Thanks, Sato.", do: g => g.completeStep("m3") }] }),
  sato_m3_deliver: g => ({ speaker: "sato",
    text: "Good kid. Extra egg for Rei — she'll pretend she doesn't care. Freight lift's at the end of Rust Alley, west side. She'll tell you about the drones that buzzed Mika's place.",
    options: [{ text: "One delivery, coming up.", do: g => g.completeStep("m3") }] }),
  sato_idle: g => ({ speaker: "sato",
    text: ["The broth has been going since before you were born. Possibly before I was born.", "Tenkai wanted to buy this corner once. I served them cold noodles. They left.", "You look hungry. You always look hungry."][Math.floor(Math.random() * 3)],
    options: [{ text: "Later, Sato." }] }),

  // ── REI ──
  rei_m3: g => ({ speaker: "rei",
    text: g.flag("carrying_noodles")
      ? "Sato sent you? With FOOD? Okay. You're officially my favourite stranger. …Extra egg. That old man."
      : "Whoa — who let you up here? Sato? Figures. Paid him, didn't you? He's richer than Tenkai.",
    options: [{ text: "Mika's shop is being watched.", do: g => { if (g.flag("carrying_noodles")) { g.setFlag("rei_friend", true); g.setFlag("carrying_noodles", false); } g.completeStep("m3"); }, to: "rei_m4" }] }),
  rei_m4: g => ({ speaker: "rei",
    text: "Watched? Traced. The second that core lit up, Tenkai Watch drones started triangulating it with sensor pylons in Neon Mile. Kill the pylons, kill the trace. Here — three jammers. Slap one on each pylon.",
    options: [{ text: "Where are they?", to: "rei_m4_where" }, { text: "Consider it done." }] }),
  rei_m4_where: g => ({ speaker: "rei",
    text: "Head north up the main street, past the Ring Road junction with the giant fish. White poles, red eye, very smug. Two on the sidewalks, one in Spire Plaza.",
    options: [{ text: "Got it." }] }),
  rei_m4_wait: g => ({ speaker: "rei", text: `Jammers planted: ${g.count("pylon")} of 3. The pylons are up north in Neon Mile. Go, go.`, options: [{ text: "On it." }] }),
  rei_m4_done: g => ({ speaker: "rei",
    text: "Trace is dead — the drones just wandered off toward the docks. Nice work. Now let me see that implant of yours… Huh. Serial GEN-0. That's not junk-grade. That's Tenkai prototype stock.",
    options: [{ text: "What does that mean?", to: "rei_m5" }] }),
  rei_m5: g => ({ speaker: "rei",
    text: "Means you're more interesting than you look. Go see Doc Anaya at Second Skin, east side of Neon Mile. She used to cut chrome for Tenkai. She'll know what you are." + (g.flag("rei_friend") ? " And take this — 50 extra. For the egg." : ""),
    options: [{ text: "Thanks, Rei.", do: g => { if (g.flag("rei_friend")) g.give(50); g.completeStep("m4"); } }] }),
  rei_idle: g => ({ speaker: "rei",
    text: ["Best view in the Sump. Worst wifi.", "See that orb over the plaza? Tenkai calls it art. I call it a very expensive nightlight.", "If you ever need to disappear, I know eleven rooftops nobody's mapped."][Math.floor(Math.random() * 3)],
    options: [{ text: "Later, Rei." }] }),

  // ── DOC ANAYA ──
  doc_m5: g => ({ speaker: "doc",
    text: "Sit. Don't touch anything glowing. …GEN-0. I haven't seen one of these since I quit Tenkai. This isn't an implant, Static. It's a key. It was built to talk to GENESIS.",
    options: [{ text: "Can you take it out?", to: "doc_m5_out" }, { text: "Then why put it in someone from the Sump?", to: "doc_m5_why" }] }),
  doc_m5_out: g => ({ speaker: "doc",
    text: "It's wired into your spine. Taking it out would take you out. What I CAN do is give you chrome that works with it instead of against it. First install is on me — well, at my usual prices. Have a look.",
    options: [{ text: "Show me the cyberware.", do: g => { g.completeStep("m5"); g.openShop(); } }] }),
  doc_m5_why: g => ({ speaker: "doc",
    text: "Because nobody looks for anything important in the Sump. Someone hid you, Static. Or hid it in you. Either way — let's make sure you survive it. Pick something.",
    options: [{ text: "Show me the cyberware.", do: g => { g.completeStep("m5"); g.openShop(); } }] }),
  doc_m5_wait: g => ({ speaker: "doc", text: "Pick something and let me install it. Wayfinder's cheap and useful, if you're on a budget.",
    options: [{ text: "Browse cyberware.", do: g => g.openShop() }, { text: "Not yet." }] }),
  doc_m5_done: g => ({ speaker: "doc",
    text: "Clean install. Your GEN-0 didn't even fight it — it LIKED it. That's new. Now, bad news: there's a broadcast running on every screen in Spire Plaza. Your face is on it.",
    options: [{ text: "…Of course it is.", do: g => g.completeStep("m5"), to: "doc_m6" }] }),
  doc_m6: g => ({ speaker: "doc",
    text: "Plaza is at the north end of the Mile, under that ridiculous orb. Go hear what they want. And Static — whatever Tenkai offers, it costs more than they say.",
    options: [{ text: "I'll be careful." }] }),
  doc_idle: g => ({ speaker: "doc",
    text: "Back for upgrades? Your compatibility decides what your body accepts. Raise it and better chrome opens up.",
    options: [{ text: "Browse cyberware.", do: g => g.openShop() }, { text: "Just visiting." }] }),

  // ── DIRECTOR ISHIDA (hologram) ──
  ishida_m6: g => ({ speaker: "ishida",
    text: "Ah. Static. Tenkai Dynamics would like to make you a generous offer. The core in Mika Tsukishiro's workshop is stolen corporate property. Bring it to me: five thousand credits and a clean record. Refuse, and the Sump will learn how dark a district can get.",
    options: [
      { text: "Why do you even want it?", to: "ishida_why" },
      { text: "Deal. Five thousand.", do: g => { g.setFlag("sided_tenkai", true); g.completeStep("m6"); }, to: "ishida_yes" },
      { text: "No. Go to hell.", do: g => { g.setFlag("refused_tenkai", true); g.completeStep("m6"); }, to: "ishida_no" }] }),
  ishida_why: g => ({ speaker: "ishida",
    text: "GENESIS ran this city fairly. Fairness is expensive. The core is the last copy of an idea we already paid to bury. Now: yes or no?",
    options: [
      { text: "Deal. Five thousand.", do: g => { g.setFlag("sided_tenkai", true); g.completeStep("m6"); }, to: "ishida_yes" },
      { text: "No.", do: g => { g.setFlag("refused_tenkai", true); g.completeStep("m6"); }, to: "ishida_no" }] }),
  ishida_yes: g => ({ speaker: "ishida", text: "Wise. You have until the next blackout. Don't make me come down to the Sump; I hate the smell.", options: [{ text: "(The hologram flickers out.)" }] }),
  ishida_no: g => ({ speaker: "ishida", text: "Then enjoy the dark, Static. It's coming for your friends first.", options: [{ text: "(The hologram flickers out.)" }] }),

  // ── PIP ──
  pip_s1: g => ({ speaker: "pip",
    text: "Hey! You! You look like you can lift stuff. My drone Bolt crashed in Drain Alley — across the street, the steamy one. It's stuck behind the big dumpster and I can't move it. Help? I'll pay! …Some.",
    options: [{ text: "I'll find Bolt.", do: g => g.startMission("s1") }, { text: "Not now, kid." }] }),
  pip_s1_wait: g => ({ speaker: "pip", text: "Bolt's behind the dumpster in Drain Alley! If it's too heavy, get stronger. Or get chrome legs. Chrome legs are SO cool.", options: [{ text: "Working on it." }] }),
  pip_s1_done: g => ({ speaker: "pip",
    text: "BOLT! You're alive! …It's beeping angrily. That means happy. Here — 120 credits. Also: there's something shiny on top of the green dumpster at the end of this alley. Didn't take it. Too high.",
    options: [{ text: "Glad I could help.", do: g => g.completeStep("s1") }] }),
  pip_idle: g => ({ speaker: "pip", text: ["Bolt says hi. Bolt says beep.", "When I grow up I'm gonna get chrome eyes that see through walls.", "Rei lets me sit on the roof sometimes. She says don't tell Mika."][Math.floor(Math.random() * 3)], options: [{ text: "See ya, Pip." }] }),

  // ── LULU ──
  lulu_s2: g => ({ speaker: "lulu",
    text: "You. Yes, you with the shiny hands. Three junction boxes around the Mile keep shorting, and every time they do, my signs flicker like a cheap horror movie. Reset them? Shimmer Alley, the east alley, and down by the plaza on the west side.",
    options: [{ text: "I'll reset them.", do: g => g.startMission("s2") }, { text: "Sorry, busy." }] }),
  lulu_s2_wait: g => ({ speaker: "lulu", text: `${g.count("junction")} of 3 reset. My signs thank you. Well, they flicker gratefully.`, options: [{ text: "Back to it." }] }),
  lulu_s2_done: g => ({ speaker: "lulu", text: "Look at that — steady glow! You know what neon is? It's the city lying beautifully. Thanks for keeping the lie lit.", options: [{ text: "Any time.", do: g => g.completeStep("s2") }] }),
  lulu_idle: g => ({ speaker: "lulu", text: "Every sign on this street, I bent the glass for. Every. Single. One.", options: [{ text: "They look great." }] }),

  // ── WHISPER ──
  whisper_s3: g => ({ speaker: "whisper",
    text: "You hum like it used to. Like GENESIS. …I was an engineer at Tenkai, before the Quiet. When they shut it down, it scattered fragments of itself across the city. Data shards. Bring me all five and I'll tell you what it was trying to save.",
    options: [{ text: "I'll find them.", do: g => g.startMission("s3") }, { text: "Who are you, really?", to: "whisper_who" }] }),
  whisper_who: g => ({ speaker: "whisper", text: "Someone who pressed a button they shouldn't have. Find the shards, Static.", options: [{ text: "I'll look for them.", do: g => g.startMission("s3") }] }),
  whisper_s3_wait: g => ({ speaker: "whisper", text: `${g.count("shard")} of 5. They hide where people don't look up, or don't look back.`, options: [{ text: "I'll keep looking." }] }),
  whisper_s3_done: g => ({ speaker: "whisper",
    text: "All five. …It wasn't trying to save itself. It was saving a list — every person in the Sump the grid would have cut off. It chose them over its own survival. Remember that when Tenkai calls it a malfunction.",
    options: [{ text: "I'll remember.", do: g => { g.setFlag("whisper_truth", true); g.completeStep("s3"); } }] }),
  whisper_idle: g => ({ speaker: "whisper", text: "The shrine was here before the towers. It will be here after.", options: [{ text: "(Leave quietly.)" }] }),

  // ── ambient citizens ──
  citizen: g => ({ speaker: "CITIZEN", text: g.bark(), options: [{ text: "…Okay then." }] })
};

// Picks the right conversation for a named NPC from the current story state.
export function entryFor(id, g) {
  const st = m => g.status(m), step = m => g.step(m);
  switch (id) {
    case "mika":
      if (st("m1") === "active") return step("m1") === 0 ? "mika_m1_start" : step("m1") === 1 ? "mika_m1_waiting" : "mika_m1_done";
      if (st("m2") === "active") return step("m2") === 0 ? "mika_m2_wait" : "mika_m2_after";
      if (st("m6") === "active" && step("m6") === 2) return "mika_m6_end";
      return "mika_idle";
    case "sato":
      if (st("m3") === "active" && step("m3") === 0) return "sato_m3";
      return "sato_idle";
    case "rei":
      if (st("m3") === "active" && step("m3") === 1) return "rei_m3";
      if (st("m4") === "active") return step("m4") === 0 ? "rei_m4_wait" : "rei_m4_done";
      return "rei_idle";
    case "doc":
      if (st("m5") === "active") return step("m5") === 0 ? "doc_m5" : step("m5") === 1 ? "doc_m5_wait" : "doc_m5_done";
      return "doc_idle";
    case "ishida":
      if (st("m6") === "active" && step("m6") === 1) return "ishida_m6";
      return null;
    case "pip":
      if (!st("s1")) return "pip_s1";
      if (st("s1") === "active") return step("s1") === 0 ? "pip_s1_wait" : "pip_s1_done";
      return "pip_idle";
    case "lulu":
      if (!st("s2")) return "lulu_s2";
      if (st("s2") === "active") return step("s2") === 0 ? "lulu_s2_wait" : "lulu_s2_done";
      return "lulu_idle";
    case "whisper":
      if (!st("s3")) return "whisper_s3";
      if (st("s3") === "active") return step("s3") === 0 ? "whisper_s3_wait" : "whisper_s3_done";
      return "whisper_idle";
    default: return "citizen";
  }
}
