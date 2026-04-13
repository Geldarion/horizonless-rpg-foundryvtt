import HorizonlessDataModel from "./base-model.mjs";
import { DamageTypes, GuardMode } from "./enums.mjs";

export default class HorizonlessActor extends HorizonlessDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;

    const requiredInteger = { required: true, nullable: false, integer: true };

    const schema = {};

    schema.hitpoints = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 })
    });

    schema.stamina = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 })
    });

    schema.resolve = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 4, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 4, min: 0 })
    });

    schema.armorClass = new fields.NumberField({
      ...requiredInteger,
      initial: 10,
      min: 0
    });

    schema.tierBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 2,
      min: 0
    });

    schema.guard = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.values(GuardMode),
      initial: GuardMode.NO_GUARD
    });

    schema.biography = new fields.StringField({
      required: true,
      blank: true,
      initial: ""
    });

    schema.damageBuffers = new fields.ArrayField(
      new fields.SchemaField({
        type: new fields.StringField({
          required: true,
          blank: true,
          choices: ['', ...DamageTypes],
          initial: ""
        }),
        value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
      }),
      {
        initial: []
      }
    );

    schema.size = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.keys(CONFIG.HORIZONLESS_RPG.sizes),
      initial: "medium"
    });
    
    // Iterate over ability names and create a new SchemaField for each.
    schema.abilities = new fields.SchemaField(Object.keys(CONFIG.HORIZONLESS_RPG.abilities).reduce((obj, ability) => {
      obj[ability] = new fields.SchemaField({
        mod: new fields.NumberField({ ...requiredInteger, initial: 0, min: -2 }),
        saveHeroic: new fields.BooleanField({
          required: true,
          nullable: false,
          initial: false
        }),
      });
      return obj;
    }, {}));

    return schema;
  }

  prepareDerivedData() {
    // Loop through ability scores, and add their modifiers to our sheet output.
    for (const key in this.abilities) {
      // Calculate the modifier using d20 rules.
      //this.abilities[key].mod = Math.floor((this.abilities[key].value - 10) / 2);
      // Handle ability label localization.
      this.abilities[key].label = game.i18n.localize(CONFIG.HORIZONLESS_RPG.abilities[key]) ?? key;
    }
  }

  getRollData() {
    const data = {};

    // Copy the ability scores to the top level, so that rolls can use
    // formulas like `@str.mod + 4`.
    if (this.abilities) {
      for (let [k,v] of Object.entries(this.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    data.tierBonus = Number(this.tierBonus ?? 0);
    data.halfTierBonus = Math.floor(data.tierBonus / 2);

    //data.lvl = this.attributes.level.value;

    return data
  }

}
