import SystemActorModel from "./actor-base.mjs";

export default class ObjectModel extends SystemActorModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };

    const schema = super.defineSchema();

    schema.wreckageDifficulty = new fields.NumberField({
      ...requiredInteger,
      initial: 10,
      min: 0
    });

    schema.toughness = new fields.NumberField({
      ...requiredInteger,
      initial: 5,
      min: 0
    });

    return schema;
  }

}