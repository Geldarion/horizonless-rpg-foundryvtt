import {
  DamageType,
  FightingStyle,
  NPCType,
  TradeSpecialization,
} from "../data/enums.mjs";
export const HORIZONLESS_RPG = {};

/**
 * The set of Ability Scores used within the system.
 * @type {Object}
 */
HORIZONLESS_RPG.abilities = {
  str: 'HORIZONLESS_RPG.Ability.Str.long',
  dex: 'HORIZONLESS_RPG.Ability.Dex.long',
  con: 'HORIZONLESS_RPG.Ability.Con.long',
  int: 'HORIZONLESS_RPG.Ability.Int.long',
  wis: 'HORIZONLESS_RPG.Ability.Wis.long',
  cha: 'HORIZONLESS_RPG.Ability.Cha.long',
};

HORIZONLESS_RPG.abilityAbbreviations = {
  str: 'HORIZONLESS_RPG.Ability.Str.abbr',
  dex: 'HORIZONLESS_RPG.Ability.Dex.abbr',
  con: 'HORIZONLESS_RPG.Ability.Con.abbr',
  int: 'HORIZONLESS_RPG.Ability.Int.abbr',
  wis: 'HORIZONLESS_RPG.Ability.Wis.abbr',
  cha: 'HORIZONLESS_RPG.Ability.Cha.abbr',
};

HORIZONLESS_RPG.damageTypes = {
  [DamageType.BLUDGEONING]: { label: "Bludgeoning", injuring: false },
  [DamageType.PIERCING]: { label: "Piercing", injuring: false },
  [DamageType.SLASHING]: { label: "Slashing", injuring: false },
  [DamageType.ACID]: { label: "Acid", injuring: false },
  [DamageType.COLD]: { label: "Cold", injuring: false },
  [DamageType.FIRE]: { label: "Fire", injuring: false },
  [DamageType.LIGHTNING]: { label: "Lightning", injuring: false },
  [DamageType.POISON]: { label: "Poison", injuring: false },
  [DamageType.PSYCHIC]: { label: "Psychic", injuring: false },
  [DamageType.FORCE]: { label: "Force", injuring: false },
  [DamageType.NECROTIC]: { label: "Necrotic", injuring: false },
  [DamageType.RADIANT]: { label: "Radiant", injuring: false }
};

HORIZONLESS_RPG.damageTypeGroups = {
  physical: {
    label: "Physical",
    types: [DamageType.BLUDGEONING, DamageType.PIERCING, DamageType.SLASHING]
  },
  elemental: {
    label: "Elemental",
    types: [DamageType.ACID, DamageType.COLD, DamageType.FIRE, DamageType.LIGHTNING]
  },
  biological: {
    label: "Biological",
    types: [DamageType.POISON, DamageType.PSYCHIC]
  },
  supernatural: {
    label: "Supernatural",
    types: [DamageType.FORCE, DamageType.NECROTIC, DamageType.RADIANT]
  }
};

HORIZONLESS_RPG.tradeSpecializations = {
  [TradeSpecialization.NONE]: "<None>",
  [TradeSpecialization.CARETAKER]: "Caretaker",
  [TradeSpecialization.CRAFTING_ALCHEMIST]: "Crafting (Alchemist)",
  [TradeSpecialization.CRAFTING_ARTISAN]: "Crafting (Artisan)",
  [TradeSpecialization.CRAFTING_BATTLESMITH]: "Crafting (Battlesmith)",
  [TradeSpecialization.CRAFTING_SCRIVENER]: "Crafting (Scrivener)",
  [TradeSpecialization.GAMBLER]: "Gambler",
  [TradeSpecialization.HAGGLER]: "Haggler",
  [TradeSpecialization.MEDIC]: "Medic",
  [TradeSpecialization.RESEARCHER]: "Researcher"
};

HORIZONLESS_RPG.fightingStyles = {
  [FightingStyle.ALONGSIDE_A_SHIELD]: "Alongside a Shield",
  [FightingStyle.BASIC_RANGED]: "Basic Ranged",
  [FightingStyle.DUAL_WIELDING]: "Dual Wielding",
  [FightingStyle.HEAVY]: "Heavy",
  [FightingStyle.IMPROVISED]: "Improvised",
  [FightingStyle.LOADING_RANGED]: "Loading Ranged",
  [FightingStyle.LONG]: "Long",
  [FightingStyle.SKIRMISHER]: "Skirmisher",
  [FightingStyle.SOLITARY]: "Solitary",
  [FightingStyle.THROWN]: "Thrown",
  [FightingStyle.UNARMED]: "Unarmed"
};

HORIZONLESS_RPG.fightingStyleTypes = {
  melee: "Melee",
  ranged: "Ranged"
};

HORIZONLESS_RPG.npcTypes = {
  [NPCType.MINION]: "Minion",
  [NPCType.THREAT]: "Threat",
  [NPCType.BOSS]: "Boss"
};
