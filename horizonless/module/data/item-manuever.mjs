import HorizonlessItemBase from "./base-item.mjs";

export default class HorizonlessManuever extends HorizonlessItemBase {
  static MANUEVER_TYPES = Object.freeze([
    "",
    "attack",
    "strategy"
  ]);

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.manueverType = new fields.StringField({
      required: true,
      blank: true,
      choices: this.MANUEVER_TYPES,
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
