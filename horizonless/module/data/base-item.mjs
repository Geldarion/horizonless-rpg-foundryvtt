import HorizonlessDataModel from "./base-model.mjs";

export default class HorizonlessItemBase extends HorizonlessDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });

    return schema;
  }

}