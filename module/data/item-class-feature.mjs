import HorizonlessItemBase from "./base-item.mjs";

export default class HorizonlessClassFeature extends HorizonlessItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.className = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.rank = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });
    schema.flavorText = new fields.StringField({ required: true, blank: true, initial: "" });

    return schema;
  }

  prepareDerivedData() {
    this.className = String(this.className ?? "").trim();

    const parsedRank = Number(this.rank ?? 1);
    const normalizedRank = Number.isFinite(parsedRank) ? Math.max(1, Math.trunc(parsedRank)) : 1;
    this.rank = normalizedRank;

    this.flavorText = String(this.flavorText ?? "").trim();
  }
}
