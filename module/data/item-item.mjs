import HorizonlessItemBase from "./base-item.mjs";

export default class HorizonlessItem extends HorizonlessItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.quantity = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });
    schema.weight = new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
    schema.roll = new fields.SchemaField({
      diceNum: new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 }),
      diceSize: new fields.StringField({ initial: "d20" }),
      diceBonus: new fields.StringField({ initial: "" })
    });
    schema.formula = new fields.StringField({ blank: true });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    const roll = this.roll;
    const diceNum = Math.max(1, Math.floor(Number(roll?.diceNum ?? 1)));
    const diceSize = String(roll?.diceSize ?? "d20") || "d20";
    const diceBonus = String(roll?.diceBonus ?? "");

    this.formula = `${diceNum}${diceSize}${diceBonus}`;
  }

}
