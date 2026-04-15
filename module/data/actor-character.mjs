import HorizonlessActorBase from "./base-actor.mjs";
import {
  CasterType,
  GuardMode,
  TradeSpecialization,
  TradeType,
} from "./enums.mjs";

function getTradeAbilityChoices() {
  return ["", ...Object.keys(CONFIG.HORIZONLESS_RPG?.abilities ?? {})];
}

function createEmptyTradeTask() {
  return { name: "", description: "" };
}

function createTradeTaskSchema(fields) {
  return new fields.SchemaField({
    name: new fields.StringField({ required: true, blank: true, initial: "" }),
    description: new fields.StringField({ required: true, blank: true, initial: "" })
  });
}

function createTradeSchemaEntry(fields) {
  return new fields.SchemaField({
    name: new fields.StringField({ required: true, blank: true, initial: "" }),
    ability: new fields.StringField({
      required: true,
      blank: true,
      choices: getTradeAbilityChoices(),
      initial: ""
    }),
    specialization: new fields.StringField({
      required: true,
      blank: true,
      choices: Object.values(TradeSpecialization),
      initial: TradeSpecialization.NONE
    }),
    tasks: new fields.ArrayField(createTradeTaskSchema(fields), {
      initial: [createEmptyTradeTask(), createEmptyTradeTask(), createEmptyTradeTask()]
    })
  });
}

function createTradeArraySchema(fields) {
  return new fields.ArrayField(createTradeSchemaEntry(fields), {
    initial: [
      {
        name: "",
        ability: "",
        specialization: "",
        tasks: [createEmptyTradeTask(), createEmptyTradeTask(), createEmptyTradeTask()]
      }
    ]
  });
}

function createCustomResourceSchema(fields) {
  return new fields.SchemaField({
    name: new fields.StringField({ required: true, blank: true, initial: "" }),
    value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 })
  });
}

export default class HorizonlessCharacter extends HorizonlessActorBase {

  // Central place for per-rank class progression rules.
  static CLASS_PROGRESSION = Object.freeze({
    artificer: { hpPerRank: 7, staminaPerRank: 7, casterType: CasterType.BATTLECASTER },
    berserker: { hpPerRank: 9, staminaPerRank: 9, casterType: CasterType.MARTIAL },
    champion: { hpPerRank: 7, staminaPerRank: 7, casterType: CasterType.BATTLECASTER },
    fighter: { hpPerRank: 9, staminaPerRank: 9, casterType: CasterType.MARTIAL },
    druid: { hpPerRank: 5, staminaPerRank: 5, casterType: CasterType.SPELLCASTER },
    evincer: { hpPerRank: 7, staminaPerRank: 7, casterType: CasterType.BATTLECASTER },
    hexblade: { hpPerRank: 7, staminaPerRank: 7, casterType: CasterType.BATTLECASTER },
    maven: { hpPerRank: 5, staminaPerRank: 5, casterType: CasterType.SPELLCASTER },
    oracle: { hpPerRank: 5, staminaPerRank: 5, casterType: CasterType.SPELLCASTER },
    ranger: { hpPerRank: 7, staminaPerRank: 7, casterType: CasterType.BATTLECASTER },
    seeker: { hpPerRank: 9, staminaPerRank: 9, casterType: CasterType.MARTIAL },
    wizard: { hpPerRank: 5, staminaPerRank: 5, casterType: CasterType.SPELLCASTER },
    witch: { hpPerRank: 5, staminaPerRank: 5, casterType: CasterType.SPELLCASTER }
  });

  // Index = class rank, value = total spell points from that class's ranks.
  static SPELL_POINT_TABLES = Object.freeze({
    [CasterType.MARTIAL]: [0],
    [CasterType.BATTLECASTER]: [0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    [CasterType.SPELLCASTER]: [0, 4, 8, 12, 15, 18, 21, 23, 25, 27, 28, 29, 30]
  });

  // Index = class rank, value = martial die from that class's ranks.
  static MARTIAL_DIE_TABLES = Object.freeze({
    [CasterType.MARTIAL]: ["", "1d8", "1d8", "1d8", "1d10", "1d10", "1d10", "1d12", "1d12", "1d12", "2d6", "2d6", "2d6"],
    [CasterType.BATTLECASTER]: ["", "1d6", "1d6", "1d6", "1d8", "1d8", "1d8", "1d10", "1d10", "1d10", "1d12", "1d12", "1d12"],
    [CasterType.SPELLCASTER]: ["", "1d4", "1d4", "1d4", "1d6", "1d6", "1d6", "1d8", "1d8", "1d8", "1d10", "1d10", "1d10"]
  });

  static get PLAYER_CLASSES() {
    return Object.keys(this.CLASS_PROGRESSION);
  }

  static getClassProgression(classId) {
    return this.CLASS_PROGRESSION[classId] ?? { hpPerRank: 0, staminaPerRank: 0, casterType: CasterType.MARTIAL };
  }

  static getSpellPointsAtRank(casterType, rank) {
    const table = this.SPELL_POINT_TABLES[casterType] ?? this.SPELL_POINT_TABLES[CasterType.MARTIAL];
    if (!Array.isArray(table) || table.length === 0) return 0;

    const normalizedRank = Math.max(0, Math.floor(Number(rank ?? 0)));
    const clampedRank = Math.min(normalizedRank, table.length - 1);
    return Number(table[clampedRank] ?? 0);
  }

  static getMartialDieAtRank(casterType, rank) {
    const table = this.MARTIAL_DIE_TABLES[casterType] ?? this.MARTIAL_DIE_TABLES[CasterType.MARTIAL];
    if (!Array.isArray(table) || table.length === 0) return "";

    const normalizedRank = Math.max(0, Math.floor(Number(rank ?? 0)));
    const clampedRank = Math.min(normalizedRank, table.length - 1);
    return String(table[clampedRank] ?? "");
  }

  static getDieAverage(dieNotation) {
    const match = String(dieNotation ?? "").trim().match(/^(\d+)d(\d+)$/i);
    if (!match) return 0;

    const diceNum = Math.max(0, Math.floor(Number(match[1] ?? 0)));
    const diceSize = Math.max(0, Math.floor(Number(match[2] ?? 0)));
    if (diceNum <= 0 || diceSize <= 0) return 0;

    return diceNum * ((diceSize + 1) / 2);
  }

  /**
   * Select the best class ranks for a stat (HP or stamina), capped by character level.
   * @param {"hpPerRank"|"staminaPerRank"} progressionKey
   * @param {number} levelCap
   * @returns {number}
   */
  _getMaxClassRankContribution(progressionKey, levelCap) {
    const classes = this.attributes?.classes ?? {};

    const rankedClasses = Object.entries(classes)
      .map(([classId, classData]) => {
        const ranks = Math.max(0, Math.floor(Number(classData?.level ?? 0)));
        const perRank = Number(
          this.constructor.getClassProgression(classId)?.[progressionKey] ?? 0
        );
        return { ranks, perRank };
      })
      .filter(({ ranks, perRank }) => ranks > 0 && perRank > 0)
      .sort((a, b) => b.perRank - a.perRank);

    let remainingRanks = Math.max(0, Math.floor(Number(levelCap ?? 0)));
    let total = 0;

    for (const { ranks, perRank } of rankedClasses) {
      if (remainingRanks <= 0) break;
      const takenRanks = Math.min(remainingRanks, ranks);
      total += takenRanks * perRank;
      remainingRanks -= takenRanks;
    }

    return total;
  }

  _getMaxClassSpellPoints(levelCap) {
    const classes = this.attributes?.classes ?? {};
    let totalSpellPoints = 0;

    for (const [classId, classData] of Object.entries(classes)) {
      const ranks = Math.max(0, Math.floor(Number(classData?.level ?? 0)));
      const cappedRanks = Math.min(Math.max(0, Math.floor(Number(levelCap ?? 0))), ranks);
      const casterType = this.constructor.getClassProgression(classId)?.casterType ?? CasterType.MARTIAL;
      const points = Number(this.constructor.getSpellPointsAtRank(casterType, cappedRanks));
      totalSpellPoints += points;
    }

    return totalSpellPoints;
  }

  _getMaxClassMartialDie(levelCap) {
    const classes = this.attributes?.classes ?? {};
    let strongestMartialDie = "";
    let strongestMartialDieAverage = 0;

    for (const [classId, classData] of Object.entries(classes)) {
      const ranks = Math.max(0, Math.floor(Number(classData?.level ?? 0)));
      const cappedRanks = Math.min(Math.max(0, Math.floor(Number(levelCap ?? 0))), ranks);
      if (cappedRanks <= 0) continue;

      const casterType = this.constructor.getClassProgression(classId)?.casterType ?? CasterType.MARTIAL;
      const martialDie = this.constructor.getMartialDieAtRank(casterType, cappedRanks);
      const martialDieAverage = this.constructor.getDieAverage(martialDie);

      if (martialDieAverage > strongestMartialDieAverage) {
        strongestMartialDieAverage = martialDieAverage;
        strongestMartialDie = martialDie;
      }
    }

    return strongestMartialDie;
  }

  _deriveLevelData() {
    const characterLevel = Math.max(
      0,
      Math.floor(Number(this.attributes?.level?.value ?? 0))
    );
    const normalizedLevel = Math.max(1, characterLevel);
    const tierBonus = Math.min(
      8,
      2 * (Math.floor((normalizedLevel - 1) / 3) + 1)
    );

    return { characterLevel, tierBonus };
  }

  _deriveAbilityMods() {
    return {
      conMod: Number(this.abilities?.con?.mod ?? 0),
      dexMod: Number(this.abilities?.dex?.mod ?? 0),
      strMod: Number(this.abilities?.str?.mod ?? 0)
    };
  }

  _deriveClassProgressionData(characterLevel) {
    const classHpBonus = this._getMaxClassRankContribution(
      "hpPerRank",
      characterLevel
    );
    const classStaminaBonus = this._getMaxClassRankContribution(
      "staminaPerRank",
      characterLevel
    );
    const classSpellPoints = this._getMaxClassSpellPoints(characterLevel);
    const classMartialDie = this._getMaxClassMartialDie(characterLevel);

    return { classHpBonus, classStaminaBonus, classSpellPoints, classMartialDie };
  }

  _applyResourceMaximums({
    conMod,
    tierBonus,
    classHpBonus,
    classStaminaBonus,
    classSpellPoints
  }) {
    if (this.hitpoints?.max !== undefined) {
      this.hitpoints.max = Math.max(0, 10 + conMod + classHpBonus);
      this.hitpoints.value = Math.min(this.hitpoints.value, this.hitpoints.max);
    }

    if (this.stamina?.max !== undefined) {
      this.stamina.max = Math.max(
        0,
        15 + (conMod * tierBonus) + classStaminaBonus
      );
      this.stamina.value = Math.min(this.stamina.value, this.stamina.max);
    }

    if (this.resolve?.max !== undefined) {
      const hasHeroicConSave = Boolean(this.abilities?.con?.saveHeroic);
      this.resolve.max = hasHeroicConSave ? 4 : 3;
      this.resolve.value = Math.min(this.resolve.value, this.resolve.max);
    }

    if (this.spellPoints?.max !== undefined) {
      this.spellPoints.max = Math.max(0, classSpellPoints);
      this.spellPoints.value = Math.min(this.spellPoints.value, this.spellPoints.max);
    }
  }

  _getWornArmorMeetingStrength(strMod) {
    const actorItems = this.parent?.items?.contents ?? [];
    return actorItems.find((item) => item.type === "armor"
      && Boolean(item.system?.worn)
      && strMod >= Number(item.system?.strRequirement ?? 0));
  }

  _getGuardArmorBonus(guardMode, tierBonus) {
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

  _applyDerivedArmorClass({ strMod, dexMod, tierBonus }) {
    const firstArmorItem = this._getWornArmorMeetingStrength(strMod);
    const armorBaseAc = Number(firstArmorItem?.system?.armorClass);
    const baseAc = Number.isFinite(armorBaseAc)
      ? armorBaseAc
      : 10 + Math.floor(tierBonus / 2) + Math.ceil(dexMod / 2);
    const guardMode = this.guard || GuardMode.NO_GUARD;
    const guardAc = this._getGuardArmorBonus(guardMode, tierBonus);

    this.armorClass = Math.max(0, baseAc + guardAc);
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    const classLevels = {};

    // Create level counters for each class
    for (const cls of this.PLAYER_CLASSES) {
      classLevels[cls] = new fields.SchemaField({
        level: new fields.NumberField({ ...requiredInteger, initial: 0 })
      });
    }

    schema.attributes = new fields.SchemaField({
      level: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1 })
      }),
      paragonFeatNum: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      classes: new fields.SchemaField(classLevels)
    });

    schema.spellPoints = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });
    schema.martialDie = new fields.StringField({
      required: true,
      blank: true,
      initial: ""
    });
    schema.signatureSpellId = new fields.StringField({
      required: true,
      blank: true,
      initial: ""
    });
    schema.ancestries = new fields.SchemaField({
      primaryFeatureId: new fields.StringField({
        required: true,
        blank: true,
        initial: ""
      }),
      secondaryFeatureId: new fields.StringField({
        required: true,
        blank: true,
        initial: ""
      }),
      tertiaryFeatureId: new fields.StringField({
        required: true,
        blank: true,
        initial: ""
      }),
      inheritorFeatureIds: new fields.ArrayField(
        new fields.StringField({
          required: true,
          blank: false,
          initial: ""
        }),
        {
          initial: []
        }
      )
    });

    schema.trades = new fields.SchemaField({
      [TradeType.BACKGROUND]: createTradeArraySchema(fields),
      [TradeType.ADVENTURER]: createTradeArraySchema(fields)
    });

    schema.customResources = new fields.ArrayField(createCustomResourceSchema(fields), {
      initial: []
    });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    const { characterLevel, tierBonus } = this._deriveLevelData();
    const { conMod, dexMod, strMod } = this._deriveAbilityMods();
    const {
      classHpBonus,
      classStaminaBonus,
      classSpellPoints,
      classMartialDie
    } = this._deriveClassProgressionData(characterLevel);

    this.tierBonus = tierBonus;
    this._applyResourceMaximums({
      conMod,
      tierBonus,
      classHpBonus,
      classStaminaBonus,
      classSpellPoints
    });
    this.martialDie = classMartialDie;
    this._applyDerivedArmorClass({ strMod, dexMod, tierBonus });
  }

  getRollData() {
    const data = super.getRollData();
    data.martialDie = String(this.martialDie ?? "");
    return data;
  }
}
