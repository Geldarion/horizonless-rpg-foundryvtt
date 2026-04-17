import HorizonlessActorBase from "./base-actor.mjs";
import { DamageTypes, NPCType, NPCTypes } from "./enums.mjs";

const NPC_CUSTOM_ATTACK_KIND = Object.freeze({
  ATTACK: "attack",
  SAVE: "save"
});

const NPC_CUSTOM_SAVE_TYPES = Object.freeze([
  "Poise",
  "Reflex",
  "Fortitude",
  "Quick-Wits",
  "Will",
  "Courage"
]);

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
    saveType: new fields.StringField({
      required: true,
      blank: true,
      choices: ["", ...NPC_CUSTOM_SAVE_TYPES],
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

    schema.customAttacks = new fields.ArrayField(createNpcCustomAttackSchema(fields), {
      initial: []
    });
    
    return schema
  }

  prepareBaseData() {
    super.prepareBaseData();

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
