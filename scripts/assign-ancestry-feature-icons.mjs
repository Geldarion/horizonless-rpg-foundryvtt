import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("module", "data", "dataSource", "ancestries.json");
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

const availableIcons = new Set(collectIcons(foundryIconsDir));

const featureIcons = {
  Avirin: {
    primary_feature: "icons/creatures/abilities/wings-birdlike-blue.webp",
    secondary_feature: "icons/commodities/claws/talon-blue.webp",
    tertiary_feature: "icons/commodities/materials/feather-white-glowing-beams.webp"
  },
  Deepborn: {
    primary_feature: "icons/magic/control/energy-stream-link-large-white.webp",
    secondary_feature: "icons/magic/control/energy-stream-link-spiral-blue.webp",
    tertiary_feature: "icons/commodities/biological/organ-brain-pink-purple.webp",
    inheritor_feature: "icons/creatures/magical/spirit-undead-horned-blue.webp"
  },
  Drakonin: {
    primary_feature: "icons/creatures/abilities/dragon-fire-breath-orange.webp",
    secondary_feature: "icons/equipment/chest/breastplate-layered-steel-black.webp",
    tertiary_feature: "icons/commodities/treasure/brooch-gold-eye-green.webp",
    inheritor_feature: "icons/creatures/reptiles/dragon-horned-blue.webp"
  },
  Dwarf: {
    primary_feature: "icons/magic/earth/projectile-stone-landslide.webp",
    secondary_feature: "icons/commodities/gems/gem-rough-heart-teal.webp",
    tertiary_feature: "icons/commodities/stone/rock-chunk-pumice-white.webp"
  },
  Elf: {
    primary_feature: "icons/environment/wilderness/portal.webp",
    secondary_feature: "icons/consumables/plants/leaf-maple-green-purple.webp",
    tertiary_feature: "icons/magic/perception/eye-ringed-glow-angry-small-red.webp",
    inheritor_feature: "icons/magic/nature/symbol-moon-stars-white.webp"
  },
  Erinae: {
    primary_feature: "icons/magic/perception/orb-eye-scrying.webp",
    secondary_feature: "icons/magic/symbols/star-yellow.webp",
    tertiary_feature: "icons/magic/time/day-night-sun-moon.webp"
  },
  Felidaen: {
    primary_feature: "icons/skills/movement/feet-winged-boots-blue.webp",
    secondary_feature: "icons/commodities/claws/claws-plain-brown.webp",
    tertiary_feature: "icons/tools/navigation/map-marked-black.webp"
  },
  Fzzbr: {
    primary_feature: "icons/magic/lightning/bolt-strike-blue-white.webp",
    secondary_feature: "icons/magic/lightning/bolt-forked-large-teal.webp",
    tertiary_feature: "icons/tools/navigation/compass-chain-blue.webp"
  },
  Gnome: {
    primary_feature: "icons/magic/perception/silhouette-stealth-shadow.webp",
    secondary_feature: "icons/magic/movement/trail-streak-zigzag-teal.webp",
    tertiary_feature: "icons/commodities/currency/coin-plain-portal-gold.webp",
    inheritor_feature: "icons/creatures/magical/fae-fairy-winged-glowing-green.webp"
  },
  Goblin: {
    primary_feature: "icons/magic/movement/abstract-ribbons-red-orange.webp",
    secondary_feature: "icons/magic/life/heart-hand-gold-green.webp",
    tertiary_feature: "icons/tools/smithing/hammer-sledge-steel-grey.webp"
  },
  Halfling: {
    primary_feature: "icons/magic/life/heart-red-blue.webp",
    secondary_feature: "icons/consumables/grains/bread-loaf-glowing-tan.webp",
    tertiary_feature: "icons/commodities/treasure/medal-ribbon-star-gold-red.webp"
  },
  Human: {
    primary_feature: "icons/magic/control/buff-strength-muscle-damage-orange.webp",
    secondary_feature: "icons/skills/wounds/blood-spurt-spray-red.webp",
    tertiary_feature: "icons/tools/hand/lockpicks-steel-grey.webp"
  },
  Juneir: {
    primary_feature: "icons/magic/life/heart-hand-gold-green-light.webp",
    secondary_feature: "icons/magic/defensive/shield-barrier-flaming-diamond-blue-yellow.webp",
    tertiary_feature: "icons/creatures/mammals/deer-antlers-blue.webp",
    inheritor_feature: "icons/magic/nature/plant-seed-hands-glow-yellow.webp"
  },
  Kobold: {
    primary_feature: "icons/creatures/reptiles/lizard-mouth-glowing-red.webp",
    secondary_feature: "icons/magic/perception/eye-ringed-glow-angry-large-red.webp",
    tertiary_feature: "icons/sundries/gaming/dice-runed-brown.webp",
    inheritor_feature: "icons/creatures/reptiles/dragon-winged-blue.webp"
  },
  Lizardfolk: {
    primary_feature: "icons/creatures/abilities/stinger-spine-horn-blood.webp",
    secondary_feature: "icons/commodities/bones/bones-hand-grey.webp",
    tertiary_feature: "icons/magic/acid/projectile-glowing-bubbles.webp"
  },
  Merfolk: {
    primary_feature: "icons/weapons/polearms/spear-flared-silver-pink.webp",
    secondary_feature: "icons/magic/water/wave-water-blue.webp",
    tertiary_feature: "icons/magic/water/water-hand.webp",
    inheritor_feature: "icons/commodities/stone/engraved-symbol-water-grey.webp"
  },
  Nerva: {
    primary_feature: "icons/magic/perception/orb-crystal-ball-scrying.webp",
    secondary_feature: "icons/commodities/claws/talon-black.webp",
    tertiary_feature: "icons/skills/trades/music-singing-voice-blue.webp"
  },
  Orc: {
    primary_feature: "icons/magic/fire/flame-burning-fist-strike.webp",
    secondary_feature: "icons/magic/defensive/shield-barrier-blue.webp",
    tertiary_feature: "icons/skills/wounds/injury-body-pain-gray.webp"
  },
  Skeleton: {
    primary_feature: "icons/magic/death/skull-energy-light-purple.webp",
    secondary_feature: "icons/magic/death/skeleton-skull-soul-blue.webp",
    tertiary_feature: "icons/commodities/bones/bones-hand-tan.webp",
    inheritor_feature: "icons/commodities/bones/skull-hollow-white.webp"
  },
  Slime: {
    primary_feature: "icons/creatures/slimes/slime-movment-dripping-green.webp",
    secondary_feature: "icons/magic/acid/projectile-faceted-glob.webp",
    tertiary_feature: "icons/creatures/slimes/slime-giant-face-eyes.webp",
    inheritor_feature: "icons/creatures/slimes/slime-blob-pseudopods-green.webp"
  },
  Soulforged: {
    primary_feature: "icons/magic/light/explosion-star-glow-blue.webp",
    secondary_feature: "icons/magic/light/orb-container-orange.webp",
    tertiary_feature: "icons/magic/control/control-influence-puppet.webp",
    inheritor_feature: "icons/commodities/tech/cog-large-steel-white.webp"
  }
};

const ancestries = JSON.parse(readFileSync(sourcePath, "utf8"));

for (const ancestry of ancestries) {
  const icons = featureIcons[ancestry.name];
  if (!icons) throw new Error(`Missing icon choices for ${ancestry.name}`);

  for (const [featureKey, icon] of Object.entries(icons)) {
    if (!ancestry[featureKey]) throw new Error(`${ancestry.name} has no ${featureKey}`);
    if (!availableIcons.has(icon)) throw new Error(`${ancestry.name} ${featureKey} icon does not exist: ${icon}`);
  }

  const duplicates = Object.entries(icons)
    .filter(([, icon], index, entries) => entries.findIndex(([, other]) => other === icon) !== index);
  if (duplicates.length) {
    throw new Error(`${ancestry.name} has duplicate icon choices: ${duplicates.map(([key]) => key).join(", ")}`);
  }

  ancestry.feature_icons = icons;
}

writeFileSync(sourcePath, `${JSON.stringify(ancestries, null, 2)}\n`, "utf8");
