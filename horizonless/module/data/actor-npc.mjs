import HorizonlessActorBase from "./base-actor.mjs";
import { NPCType, NPCTypes } from "./enums.mjs";

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
    
    return schema
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    if (this.resolve?.max !== undefined) {
      this.resolve.max = 3;
      this.resolve.value = Math.min(this.resolve.value, this.resolve.max);
    }

    //this.xp = this.cr * this.cr * 100;
  }
}
