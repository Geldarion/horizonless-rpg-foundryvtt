import HorizonlessItem from "./item-item.mjs";
import { DamageTypes, FightingStyle } from "./enums.mjs";

export default class HorizonlessWeaponItem extends HorizonlessItem {
  static FIGHTING_STYLES = FightingStyle;
  static FIGHTING_STYLE_TYPES = Object.freeze({
    MELEE: "melee",
    RANGED: "ranged"
  });
  static ATTACK_ABILITY = Object.freeze({
    STR: "str",
    DEX: "dex",
    STR_OR_DEX: "strOrDex"
  });
  static FIGHTING_STYLE_ATTACK_ABILITIES = Object.freeze({
    [FightingStyle.ALONGSIDE_A_SHIELD]: this.ATTACK_ABILITY.STR_OR_DEX,
    [FightingStyle.BASIC_RANGED]: this.ATTACK_ABILITY.DEX,
    [FightingStyle.DUAL_WIELDING]: this.ATTACK_ABILITY.STR_OR_DEX,
    [FightingStyle.HEAVY]: this.ATTACK_ABILITY.STR,
    [FightingStyle.IMPROVISED]: this.ATTACK_ABILITY.STR,
    [FightingStyle.LOADING_RANGED]: this.ATTACK_ABILITY.DEX,
    [FightingStyle.LONG]: this.ATTACK_ABILITY.STR_OR_DEX,
    [FightingStyle.SKIRMISHER]: this.ATTACK_ABILITY.STR_OR_DEX,
    [FightingStyle.SOLITARY]: this.ATTACK_ABILITY.STR_OR_DEX,
    [FightingStyle.THROWN]: this.ATTACK_ABILITY.DEX,
    [FightingStyle.UNARMED]: this.ATTACK_ABILITY.STR
  });
  static FIGHTING_STYLE_TYPE_BY_STYLE = Object.freeze({
    [FightingStyle.ALONGSIDE_A_SHIELD]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.BASIC_RANGED]: this.FIGHTING_STYLE_TYPES.RANGED,
    [FightingStyle.DUAL_WIELDING]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.HEAVY]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.IMPROVISED]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.LOADING_RANGED]: this.FIGHTING_STYLE_TYPES.RANGED,
    [FightingStyle.LONG]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.SKIRMISHER]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.SOLITARY]: this.FIGHTING_STYLE_TYPES.MELEE,
    [FightingStyle.THROWN]: this.FIGHTING_STYLE_TYPES.RANGED,
    [FightingStyle.UNARMED]: this.FIGHTING_STYLE_TYPES.MELEE
  });

  static getAttackAbilityByStyle(fightingStyle, { strMod = 0, dexMod = 0 } = {}) {
    const rule = this.FIGHTING_STYLE_ATTACK_ABILITIES[fightingStyle] ?? this.ATTACK_ABILITY.STR;
    if (rule === this.ATTACK_ABILITY.STR_OR_DEX) {
      return Number(dexMod) > Number(strMod) ? this.ATTACK_ABILITY.DEX : this.ATTACK_ABILITY.STR;
    }
    return rule;
  }

  static getFightingStyleType(fightingStyle) {
    return this.FIGHTING_STYLE_TYPE_BY_STYLE[fightingStyle] ?? this.FIGHTING_STYLE_TYPES.MELEE;
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.fightingStyle = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.values(this.FIGHTING_STYLES),
      initial: this.FIGHTING_STYLES.ALONGSIDE_A_SHIELD
    });
    schema.fightingStyleType = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.values(this.FIGHTING_STYLE_TYPES),
      initial: this.FIGHTING_STYLE_TYPES.MELEE
    });
    schema.damageType = new fields.StringField({
      required: true,
      nullable: false,
      choices: DamageTypes,
      initial: "slashing"
    });
    schema.injuring = new fields.BooleanField({
      required: true,
      nullable: false,
      initial: false
    });

    // Break down roll formula into three independent fields
    schema.roll = new fields.SchemaField({
      diceNum: new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 }),
      diceSize: new fields.StringField({ initial: "d20" }),
      diceBonus: new fields.StringField({ initial: "+@str.mod+@tierBonus" })
    })

    schema.formula = new fields.StringField({ blank: true });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    const actorSystem = this.parent?.actor?.system ?? {};
    const strMod = Number(actorSystem.abilities?.str?.mod ?? 0);
    const dexMod = Number(actorSystem.abilities?.dex?.mod ?? 0);
    const attackAbility = this.constructor.getAttackAbilityByStyle(this.fightingStyle, { strMod, dexMod });
    const fightingStyleType = this.constructor.getFightingStyleType(this.fightingStyle);
    const roll = this.roll;
    const diceNum = Math.max(1, Math.floor(Number(roll?.diceNum ?? 1)));
    const diceSize = String(roll?.diceSize ?? "d20") || "d20";
    const diceBonus = `+@${attackAbility}.mod+@tierBonus`;

    roll.diceBonus = diceBonus;
    this.injuring = Boolean(this.injuring);
    this.formula = `${diceNum}${diceSize}${diceBonus}`;
    this.fightingStyleType = fightingStyleType;
  }
}
