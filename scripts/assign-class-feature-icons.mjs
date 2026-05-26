import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const classesDir = path.resolve("module", "data", "dataSource", "classes");
const foundryPublicDir = path.resolve("..", "..", "..", "App", "resources", "app", "public");
const foundryIconsDir = path.join(foundryPublicDir, "icons");

function collectIcons(dir) {
  const entries = [];
  for (const entry of readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      entries.push(...collectIcons(entryPath));
      continue;
    }
    if (!/\.(?:webp|svg|png)$/i.test(entryPath)) continue;
    entries.push(path.relative(foundryPublicDir, entryPath).replace(/\\/g, "/"));
  }
  return entries;
}

const icons = collectIcons(foundryIconsDir).sort();

const classTerms = {
  artificer: ["arcane", "gear", "cog", "machine", "tool", "hammer", "alchemy", "vial", "wand", "rune", "crystal"],
  berserker: ["rage", "fist", "fire", "impact", "shockwave", "axe", "skull", "quake", "blood", "roar"],
  champion: ["shield", "banner", "radiant", "holy", "ward", "standard", "heart", "hand", "crown", "sun"],
  druid: ["nature", "seed", "plant", "leaf", "beast", "earth", "storm", "wave", "grove", "root"],
  evincer: ["light", "beam", "prism", "star", "sun", "speed", "portal", "time", "lens", "ray"],
  fighter: ["sword", "blade", "shield", "stance", "strike", "target", "helmet", "guard", "weapon"],
  hexblade: ["curse", "hex", "shadow", "blood", "skull", "death", "chain", "doom", "blade", "void"],
  maven: ["music", "voice", "star", "dream", "dice", "inspire", "sphere", "heart", "hand", "song"],
  oracle: ["eye", "star", "sun", "moon", "fate", "vision", "glass", "prophecy", "radiance", "fragment"],
  ranger: ["nature", "track", "bow", "arrow", "claw", "sense", "wind", "beast", "leaf", "foot"],
  seeker: ["dagger", "mask", "boot", "speed", "trick", "card", "key", "eye", "shadow", "dice"],
  witch: ["witch", "familiar", "skull", "poison", "curse", "eye", "blood", "coven", "hand", "shadow"],
  wizard: ["book", "scroll", "rune", "arcane", "crystal", "spell", "theory", "hourglass", "wand", "star"]
};

const featureTerms = [
  [/spellcasting|battlecasting/i, ["spell", "magic", "book", "rune", "casting"]],
  [/maneuvers?/i, ["sword", "weapon", "training", "stance"]],
  [/field|study|realm|vision|legend|path|lure|mettle|code|pursuit|enclave|coven|lens/i, ["symbol", "emblem", "talisman", "token", "sigil"]],
  [/ability improvement/i, ["upgrade", "up", "arrow", "star", "body"]],
  [/exploration|final reach/i, ["map", "compass", "path", "horizon", "journey"]],
  [/innovation|improvise|resourceful|assembly|workshop|widget|fine-tuned|appraisal|reserves|arcanodynamic/i, ["gear", "tool", "cog", "hammer", "vial", "device", "crystal"]],
  [/chemistry/i, ["vial", "potion", "alchemy", "flask"]],
  [/engraving/i, ["rune", "metal", "etch", "hammer", "anvil"]],
  [/wandcarving/i, ["wand", "wood", "branch", "carve"]],
  [/shockwave|seismic|leap|charge/i, ["impact", "explosion", "quake", "slam", "fist"]],
  [/wrath|taunt|rage|flame/i, ["rage", "fire", "roar", "angry", "skull"]],
  [/legion|one/i, ["giant", "fist", "strength", "muscle"]],
  [/coldfury/i, ["ice", "frost", "crystal"]],
  [/siegebreaker/i, ["hammer", "wall", "crack", "siege"]],
  [/rally|collective|sanctuary|confidence/i, ["banner", "standard", "sun", "hand", "heart"]],
  [/ward|aegis|reinforcement|stand|resolved/i, ["shield", "barrier", "guard", "protect"]],
  [/foresight|timely/i, ["eye", "time", "watch", "star"]],
  [/tenacity/i, ["barrier", "shield", "wall", "fortress"]],
  [/landword|earth|grove|flora|seed|blossom/i, ["seed", "sprout", "leaf", "root", "plant"]],
  [/critter|dire|majestic|form/i, ["claw", "beast", "paw", "animal"]],
  [/storm/i, ["storm", "lightning", "cloud"]],
  [/wave/i, ["wave", "water", "sea"]],
  [/lightspeed|photonic|solar|lodestar|blueshift|vergence/i, ["light", "ray", "beam", "star", "prism", "speed"]],
  [/breakneck/i, ["speed", "wind", "motion"]],
  [/fracture/i, ["crack", "shard", "crystal"]],
  [/timetorn/i, ["time", "hourglass", "clock"]],
  [/momentum|alacrity|tumble|backflip/i, ["speed", "motion", "boot", "dash"]],
  [/counter|vigil|tactic|stalwart|unflinching|vanguard/i, ["shield", "guard", "eye", "stance"]],
  [/double strike|execution|mastery|razor/i, ["sword", "blade", "strike", "weapon"]],
  [/commander|gambit/i, ["map", "chess", "banner", "strategy"]],
  [/drifter/i, ["boot", "road", "cloak"]],
  [/doom|hex|curse|clutches|death|lifesteal|blood|shadow|violence|abyss|unknown/i, ["curse", "skull", "blood", "shadow", "chain", "blade"]],
  [/avarice/i, ["gold", "coin", "crown"]],
  [/sphere|inspiration|talent|harmonious|resonance/i, ["music", "song", "dice", "star", "heart"]],
  [/dream/i, ["dream", "moon", "sleep"]],
  [/possibility|multiversal/i, ["portal", "star", "branch", "dice"]],
  [/radiance|glimpse|filament|aurora|stellar|fateful|prophesy|calamity|discovery|unity|vitreous/i, ["eye", "star", "sun", "moon", "glass", "thread"]],
  [/channel ancients|ancient|adaptation|conduit/i, ["totem", "leaf", "root", "claw", "nature"]],
  [/sense|piercing|acute|nyctohawk|wind|dune/i, ["eye", "arrow", "wind", "moon", "sand"]],
  [/trick|flourish|masterstroke|scoundrel|spell thief|nighteye|close call/i, ["dagger", "mask", "card", "key", "shadow", "eye"]],
  [/familiar|council|coven|blight|malad|bloodbound|alterity|life|lore|warning/i, ["familiar", "skull", "poison", "eye", "blood", "hand", "book"]],
  [/theorem|spellbook|scrawl|contingency|crystallization|actualization|dynamancy|entropomancy|magnamancy/i, ["book", "scroll", "rune", "crystal", "hourglass", "formula"]]
];

const negativeTerms = ["placeholder", "unknown", "broken"];

const overrides = {
  artificer: {
    "Arcane Battlecasting": "icons/magic/symbols/runes-star-blue.webp",
    "Unified Model": "icons/magic/symbols/cog-glowing-green.webp",
    "Share Results I": "icons/sundries/documents/document-sealed-signatures-red.webp",
    "Spell Widgets II": "icons/commodities/tech/tube-chamber-lightning.webp",
    "Magical Reserves": "icons/containers/bags/pouch-gold-grey.webp",
    "Maximized Arcanodynamic Potential": "icons/magic/symbols/cog-orange-red.webp",
    "Artificer Field: Chemistry": "icons/consumables/potions/bottle-conical-bubbling-blue.webp",
    "Artificer Field: Wandcarving": "icons/skills/ranged/wand-attack-beam-blue.webp"
  },
  berserker: {
    "Exploration": [
      "icons/tools/navigation/map-marked-red.webp",
      "icons/tools/navigation/compass-worn-copper.webp",
      "icons/tools/navigation/map-simple-brown.webp"
    ],
    "Wrath Evolutions IV": "icons/magic/fire/flame-burning-skull-purple.webp",
    "Berserker Mettle: Coldfury": "icons/magic/water/ice-crystal-white.webp",
    "Berserker Mettle: Flamewrought": "icons/magic/fire/flame-burning-skull-orange.webp"
  },
  champion: {
    "Divine Battlecasting": "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    "Ability Improvement": [
      "icons/skills/movement/arrow-upward-blue.webp",
      "icons/skills/movement/arrow-upward-white.webp",
      "icons/magic/holy/angel-winged-humanoid-blue.webp"
    ],
    "Exploration": [
      "icons/tools/navigation/map-marked-blue.webp",
      "icons/tools/navigation/compass-brass-blue-red.webp",
      "icons/tools/navigation/map-marked-gold.webp"
    ],
    "Final Reach": "icons/tools/navigation/map-chart-tan.webp",
    "Champion Legend: Confidence": "icons/sundries/flags/banner-standard-tattered-red.webp",
    "Champion Legend: Foresight": "icons/magic/perception/eye-ringed-glow-angry-small-red.webp",
    "Champion Legend: Tenacity": "icons/magic/defensive/shield-barrier-blue.webp"
  },
  druid: {
    "Druid Path: Storms": "icons/magic/lightning/bolt-cloud-sky-white.webp",
    "Druid Path: Waves": "icons/magic/water/wave-water-blue.webp",
    "Final Reach": "icons/tools/navigation/map-simple-tree.webp"
  },
  evincer: {
    "Evincer Lens: Breakneck": "icons/magic/air/wind-stream-blue-gray.webp",
    "Evincer Lens: Timetorn": "icons/magic/time/clock-spinning-gold-pink.webp",
    "Final Reach": "icons/tools/navigation/map-marked-white-red.webp"
  },
  fighter: {
    "Ability Improvement": [
      "icons/skills/movement/arrow-upward-blue.webp",
      "icons/skills/movement/arrow-upward-white.webp",
      "icons/skills/melee/sword-shield-stylized-white.webp"
    ],
    "Exploration": [
      "icons/tools/navigation/map-marked-black.webp",
      "icons/tools/navigation/compass-plain-blue.webp",
      "icons/tools/navigation/map-marked-brown.webp"
    ],
    "Final Reach": "icons/tools/navigation/map-chart-tan.webp",
    "Fighter Code: Drifter": "icons/equipment/feet/boots-collared-rounded-brown.webp"
  },
  hexblade: {
    "Doomglyphs": "icons/magic/symbols/runes-carved-stone-green.webp",
    "Bloodshield": "icons/magic/defensive/shield-barrier-blood-red.webp",
    "Exploration": [
      "icons/tools/navigation/map-marked-purple.webp",
      "icons/tools/navigation/compass-chain-blue.webp",
      "icons/tools/navigation/map-marked-red.webp"
    ],
    "Final Reach": "icons/tools/navigation/map-chart-tan.webp"
  },
  maven: {
    "Harmonic Spellcasting": "icons/magic/sonic/scream-wail-shout-teal.webp",
    "Maven Realm": "icons/creatures/birds/songbird-yellow-flying.webp",
    "Sphere of Influence II": "icons/magic/sonic/projectile-sound-rings-wave.webp",
    "Multiversal Talent": "icons/magic/movement/portal-vortex-orange.webp",
    "Harmonious Instant": "icons/magic/time/clock-stopwatch-white-blue.webp",
    "Final Reach": "icons/tools/navigation/map-marked-gold.webp",
    "Maven Realm: Dreams": "icons/commodities/treasure/dreamcatcher-blue.webp",
    "Maven Realm: Possibility": "icons/dice/d20black.svg",
    "Maven Realm: Resonance": "icons/magic/sonic/explosion-shock-sound-wave.webp"
  },
  oracle: {
    "Divine Spellcasting": "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    "Exploration": [
      "icons/tools/navigation/map-marked-blue.webp",
      "icons/tools/navigation/compass-chain-blue.webp",
      "icons/tools/navigation/map-marked-white-red.webp"
    ],
    "Stellar Fragment": "icons/magic/light/explosion-star-blue.webp",
    "Vitreous Glance": "icons/commodities/treasure/crystal-ball-blue-purple.webp",
    "Final Reach": "icons/tools/navigation/map-chart-tan.webp",
    "Oracle Vision: Discovery": "icons/sundries/documents/document-symbol-eye.webp"
  },
  ranger: {
    "Ranger Enclave": "icons/commodities/treasure/totem-wooden-glowing-green.webp",
    "Tumble": "icons/skills/movement/feet-winged-boots-blue.webp",
    "Tumbling Strike": "icons/skills/ranged/arrow-flying-broadhead-metal.webp",
    "Improved Tumble": "icons/skills/movement/feet-bladed-boots-fire.webp",
    "Final Reach": "icons/tools/navigation/map-simple-tree.webp",
    "Ranger Enclave: Dune Strider": "icons/magic/death/skull-sand-white-yellow.webp",
    "Ranger Enclave: Nyctohawk": "icons/creatures/birds/raptor-owl-flying-moon.webp",
    "Ranger Enclave: Wind Warden": "icons/magic/air/wind-stream-purple-blue.webp"
  },
  seeker: {
    "Alacrity I": "icons/skills/movement/feet-winged-boots-blue.webp",
    "Backflip": "icons/skills/movement/feet-winged-boots-brown.webp",
    "Gambit I": "icons/sundries/gaming/chess-knight-white-glass.webp",
    "Alacrity II": "icons/skills/movement/feet-winged-boots-silver.webp",
    "Gambit II": "icons/sundries/gaming/chess-pawn-white-glass.webp",
    "Exploration": [
      "icons/tools/navigation/map-marked-black.webp",
      "icons/tools/navigation/compass-worn-copper.webp",
      "icons/tools/navigation/map-marked-red.webp"
    ],
    "Final Reach": "icons/tools/navigation/map-chart-tan.webp"
  },
  witch: {
    "Occult Spellcasting": "icons/magic/unholy/orb-glowing-yellow-purple.webp",
    "Familiar": "icons/creatures/mammals/cat-hunched-glowing-red.webp",
    "Increased Familiarity": "icons/creatures/mammals/cat-hunched-glowing-green.webp",
    "Exploration": [
      "icons/tools/navigation/map-marked-purple.webp",
      "icons/tools/navigation/compass-chain-blue.webp",
      "icons/tools/navigation/map-marked-black.webp"
    ],
    "Final Reach": "icons/tools/navigation/map-chart-tan.webp",
    "Witch Coven: Life": "icons/magic/life/heart-hand-gold-green.webp",
    "Witch Coven: Lore": "icons/sundries/books/book-eye-red.webp"
  },
  wizard: {
    "Exploration": [
      "icons/tools/navigation/map-marked-blue.webp",
      "icons/tools/navigation/compass-plain-blue.webp",
      "icons/tools/navigation/map-chart-tan.webp"
    ],
    "Theory of Crystallization": "icons/commodities/gems/gem-faceted-diamond-pink-gold.webp",
    "Generalized Scrawl": "icons/sundries/scrolls/scroll-runed-blue.webp",
    "The Fundamental Theory of Arcane Actualization": "icons/magic/symbols/runes-star-pentagon-blue.webp",
    "Final Reach": "icons/tools/navigation/map-marked-gold.webp",
    "Wizard Study: Entropomancy": "icons/magic/time/hourglass-tilted-gray.webp"
  }
};

function tokens(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function wantedTerms(feature, className, index) {
  const text = `${feature.name} ${feature.flavor_text ?? ""} ${feature.description ?? ""}`;
  const wanted = [...(classTerms[className] ?? []), ...tokens(feature.name)];
  for (const [pattern, terms] of featureTerms) {
    if (pattern.test(text)) wanted.push(...terms);
  }
  wanted.push(String(index + 1));
  return wanted;
}

function scoreIcon(icon, terms) {
  const lower = icon.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (term.length < 2) continue;
    if (lower.includes(term)) score += term.length + 3;
  }
  for (const bad of negativeTerms) {
    if (lower.includes(bad)) score -= 20;
  }
  if (lower.includes("/magic/")) score += 2;
  if (lower.includes("/skills/")) score += 2;
  if (lower.includes("/commodities/")) score -= 1;
  if (lower.endsWith(".svg")) score -= 1;
  return score;
}

function pickIcon(feature, className, used, index) {
  const terms = wantedTerms(feature, className, index);
  let best = null;
  for (const icon of icons) {
    if (used.has(icon)) continue;
    const score = scoreIcon(icon, terms);
    if (!best || score > best.score || (score === best.score && icon.length < best.icon.length)) {
      best = { icon, score };
    }
  }
  if (!best || best.score <= 0) {
    best = icons.find((icon) => !used.has(icon) && icon.includes("/magic/symbols/"))
      ? { icon: icons.find((icon) => !used.has(icon) && icon.includes("/magic/symbols/")), score: 0 }
      : { icon: icons.find((icon) => !used.has(icon)), score: 0 };
  }
  used.add(best.icon);
  return best.icon;
}

for (const file of readdirSync(classesDir).filter((entry) => entry.endsWith(".json")).sort()) {
  const filePath = path.join(classesDir, file);
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const className = data.class;
  const used = new Set();
  const counts = new Map();
  data.features = data.features.map((feature, index) => {
    const occurrence = counts.get(feature.name) ?? 0;
    counts.set(feature.name, occurrence + 1);
    const override = overrides[className]?.[feature.name];
    const overrideIcon = Array.isArray(override) ? override[occurrence] : override;
    const img = overrideIcon && icons.includes(overrideIcon) && !used.has(overrideIcon)
      ? overrideIcon
      : pickIcon(feature, className, used, index);
    used.add(img);
    return {
      ...feature,
      icon: img,
      img
    };
  });
  data.features = data.features.map((feature, featureIndex) => {
    if (!feature.icons || typeof feature.icons !== "object") return feature;

    const nestedIcons = {};
    for (const [title, currentIcon] of Object.entries(feature.icons)) {
      const normalizedIcon = typeof currentIcon === "string" ? currentIcon : "";
      if (normalizedIcon && icons.includes(normalizedIcon) && !used.has(normalizedIcon)) {
        used.add(normalizedIcon);
        nestedIcons[title] = normalizedIcon;
        continue;
      }

      nestedIcons[title] = pickIcon(
        {
          name: title,
          flavor_text: feature.flavor_text ?? "",
          description: `${feature.name}\n${title}\n${feature.description ?? ""}`
        },
        className,
        used,
        featureIndex
      );
    }

    return {
      ...feature,
      icons: nestedIcons
    };
  });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
