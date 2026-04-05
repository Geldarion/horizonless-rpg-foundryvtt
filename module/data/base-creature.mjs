import SystemActorModel from "./actor-base.mjs";
import { GuardMode } from "./enums.mjs";

export default class CreatureModel extends SystemActorModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };

    const schema = super.defineSchema();

    schema.stamina = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 })
    });

    schema.resolve = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 4, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 4, min: 0 })
    });

    schema.tierBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 2,
      min: 0
    });

    schema.speed = new fields.NumberField({
      ...requiredInteger,
      initial: 30,
      min: 0
    });

    schema.type = new fields.StringField({
      required: true,
      nullable: false,
      choices: [
        "aberration",
        "beast",
        "celestial",
        "construct",
        "dragon",
        "elemental",
        "fey",
        "fiend",
        "humanoid",
        "monstrosity",
        "ooze",
        "plant",
        "titan",
        "undead"
      ],
      initial: "humanoid"
    });

    schema.guard = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.values(GuardMode),
      initial: GuardMode.NO_GUARD
    });

    return schema;
  }

}
