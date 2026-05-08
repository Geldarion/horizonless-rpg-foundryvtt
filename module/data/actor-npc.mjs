import HorizonlessActorBase from "./base-actor.mjs";
import { DamageTypes, NPCType, NPCTypes, SaveTypes } from "./enums.mjs";

const NPC_TIER_BONUS_OFFSETS = Object.freeze({
  [NPCType.MINION]: 0,
  [NPCType.THREAT]: 1,
  [NPCType.BOSS]: 2
});

const NPC_CUSTOM_ATTACK_KIND = Object.freeze({
  ATTACK: "attack",
  SAVE: "save"
});

function createNpcCustomAttackSchema(fields) {
  return new fields.SchemaField({
    kind: new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.values(NPC_CUSTOM_ATTACK_KIND),
      initial: NPC_CUSTOM_ATTACK_KIND.ATTACK
    }),
    name: new fields.StringField({ required: true, blank: true, initial: "" }),
    toHitBonus: new fields.StringField({ required: true, blank: true, initial: "" }),
    advantageModifier: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: -3,
      max: 3
    }),
    saveType: new fields.StringField({
      required: true,
      blank: true,
      choices: ["", ...SaveTypes],
      initial: ""
    }),
    dc: new fields.StringField({ required: true, blank: true, initial: "" }),
    damage: new fields.StringField({ required: true, blank: true, initial: "" }),
    damageType: new fields.StringField({
      required: true,
      blank: true,
      choices: ["", ...DamageTypes],
      initial: ""
    })
  });
}

export default class HorizonlessNPC extends HorizonlessActorBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.type = new fields.StringField({
      required: true,
      nullable: false,
      initial: NPCType.MINION,
      choices: NPCTypes
    });

    schema.tier = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 1,
      max: 4
    });

    schema.customAttacks = new fields.ArrayField(createNpcCustomAttackSchema(fields), {
      initial: []
    });
    
    return schema
  }

  prepareBaseData() {
    super.prepareBaseData();

    const tier = Math.min(4, Math.max(1, Math.floor(Number(this.tier ?? 1))));
    const typeOffset = NPC_TIER_BONUS_OFFSETS[this.type] ?? NPC_TIER_BONUS_OFFSETS[NPCType.MINION];
    this.tierBonus = 2 * (tier + typeOffset);

    if (this.resolve?.max !== undefined) {
      this.resolve.max = 3;
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    if (this.resolve) {
      this.resolve.value = Math.min(this.resolve.value, this.resolve.max ?? 0);
    }

    //this.xp = this.cr * this.cr * 100;
  }
}
