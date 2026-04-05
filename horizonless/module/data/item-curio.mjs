import HorizonlessItem from "./item-item.mjs";

export default class HorizonlessCurioItem extends HorizonlessItem {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.rarity = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.discipline = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.craftingThresholdScore = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.actionType = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.mainType = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.subType = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.flavor = new fields.StringField({ required: true, blank: true, initial: "" });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    this.rarity = String(this.rarity ?? "").trim();
    this.discipline = String(this.discipline ?? "").trim();
    this.craftingThresholdScore = String(this.craftingThresholdScore ?? "").trim();
    this.actionType = String(this.actionType ?? "").trim();
    this.mainType = String(this.mainType ?? "").trim();
    this.subType = String(this.subType ?? "").trim();
    this.flavor = String(this.flavor ?? "").trim();
  }
}
