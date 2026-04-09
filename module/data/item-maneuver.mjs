import HorizonlessItemBase from "./base-item.mjs";

export default class HorizonlessManeuver extends HorizonlessItemBase {
  static MANEUVER_TYPES = Object.freeze([
    "",
    "attack",
    "strategy"
  ]);

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.maneuverType = new fields.StringField({
      required: true,
      blank: true,
      choices: this.MANEUVER_TYPES,
      initial: ""
    });
    schema.flavor = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.repetitionPenalty = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.advancements = new fields.ArrayField(
      new fields.SchemaField({
        requirement: new fields.StringField({ required: true, blank: true, initial: "" }),
        text: new fields.StringField({ required: true, blank: true, initial: "" })
      }),
      { initial: [] }
    );

    return schema;
  }
}
