export const CasterType = Object.freeze({
  MARTIAL: "martial",
  BATTLECASTER: "battlecaster",
  SPELLCASTER: "spellcaster"
});

export const ItemType = Object.freeze({
  ITEM: "item",
  ARMOR: "armor",
  WEAPON: "weapon",
  CURIO: "curio",
  FEATURE: "feature",
  CLASS_FEATURE: "class-feature",
  SPELL: "spell",
  MANEUVER: "maneuver"
});

export const NPCType = Object.freeze({
  MINION: "minion",
  THREAT: "threat",
  BOSS: "boss"
});

export const NPCTypes = Object.freeze(Object.values(NPCType));

export const GearItemType = Object.freeze([
  ItemType.ITEM,
  ItemType.ARMOR,
  ItemType.WEAPON,
  ItemType.CURIO
]);

export const GuardMode = Object.freeze({
  NO_GUARD: "noGuard",
  HALF_GUARD: "halfGuard",
  FULL_GUARD: "fullGuard"
});

export function getGuardArmorBonus(guardMode, tierBonus) {
  switch (guardMode) {
    case GuardMode.HALF_GUARD:
      return Math.floor(tierBonus / 2);
    case GuardMode.FULL_GUARD:
      return tierBonus;
    case GuardMode.NO_GUARD:
    default:
      return 0;
  }
}

export const SpellList = Object.freeze({
  ARCANE: "arcane",
  DIVINE: "divine",
  HARMONIC: "harmonic",
  OCCULT: "occult",
  PRIMAL: "primal"
});

export const SheetTheme = Object.freeze({
  DEFAULT: "default",
  EMBER: "ember"
});

export const TradeType = Object.freeze({
  BACKGROUND: "background",
  ADVENTURER: "adventurer"
});

export const TradeTypes = Object.freeze(Object.values(TradeType));

export const AncestryFeatureType = Object.freeze({
  PRIMARY: "primary",
  SECONDARY: "secondary",
  TERTIARY: "tertiary",
  INHERITOR: "inheritor"
});

export const AncestryFeatureTypes = Object.freeze([
  "",
  ...Object.values(AncestryFeatureType)
]);

export const DamageType = Object.freeze({
  BLUDGEONING: "bludgeoning",
  PIERCING: "piercing",
  SLASHING: "slashing",
  ACID: "acid",
  COLD: "cold",
  FIRE: "fire",
  LIGHTNING: "lightning",
  POISON: "poison",
  PSYCHIC: "psychic",
  FORCE: "force",
  NECROTIC: "necrotic",
  RADIANT: "radiant"
});

export const DamageTypes = Object.freeze(Object.values(DamageType));

export const SaveType = Object.freeze({
  POISE: "Poise",
  REFLEX: "Reflex",
  FORTITUDE: "Fortitude",
  QUICK_WITS: "Quick-Wits",
  WILL: "Will",
  COURAGE: "Courage"
});

export const SaveTypes = Object.freeze(Object.values(SaveType));

export const SaveAbilityMap = Object.freeze({
  [SaveType.POISE]: "str",
  [SaveType.REFLEX]: "dex",
  [SaveType.FORTITUDE]: "con",
  [SaveType.QUICK_WITS]: "int",
  [SaveType.WILL]: "wis",
  [SaveType.COURAGE]: "cha"
});

export const TradeSpecialization = Object.freeze({
  NONE: "",
  CARETAKER: "caretaker",
  CRAFTING_ALCHEMIST: "craftingAlchemist",
  CRAFTING_ARTISAN: "craftingArtisan",
  CRAFTING_BATTLESMITH: "craftingBattlesmith",
  CRAFTING_SCRIVENER: "craftingScrivener",
  GAMBLER: "gambler",
  HAGGLER: "haggler",
  MEDIC: "medic",
  RESEARCHER: "researcher"
});

export const FightingStyle = Object.freeze({
  ALONGSIDE_A_SHIELD: "alongsideAShield",
  BASIC_RANGED: "basicRanged",
  DUAL_WIELDING: "dualWielding",
  HEAVY: "heavy",
  IMPROVISED: "improvised",
  LOADING_RANGED: "loadingRanged",
  LONG: "long",
  SKIRMISHER: "skirmisher",
  SOLITARY: "solitary",
  THROWN: "thrown",
  UNARMED: "unarmed"
});
