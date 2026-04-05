import HorizonlessItemBase from "./base-item.mjs";
import { AncestryFeatureTypes } from "./enums.mjs";

export default class HorizonlessFeature extends HorizonlessItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.ancestryFeatureType = new fields.StringField({
      required: true,
      blank: true,
      choices: AncestryFeatureTypes,
      initial: ""
    });
    schema.ancestry = new fields.StringField({
      required: true,
      blank: true,
      initial: ""
    });

    return schema;
  }
}
