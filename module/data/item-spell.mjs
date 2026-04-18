import HorizonlessItemBase from "./base-item.mjs";
import { DamageTypes, SpellList } from "./enums.mjs";

const SPELL_LEVEL_LABELS = Object.freeze([
  "Cantrip",
  "1st Circle",
  "2nd Circle",
  "3rd Circle",
  "4th Circle",
  "5th Circle",
  "6th Circle"
]);

const SPELLCASTING_MODIFIERS = Object.freeze(["con", "int", "wis", "cha"]);

export default class HorizonlessSpell extends HorizonlessItemBase {
  static SPELL_LISTS = SpellList;
  static SPELL_LEVEL_LABELS = SPELL_LEVEL_LABELS;
  static SPELLCASTING_MODIFIERS = SPELLCASTING_MODIFIERS;

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.levelLabel = new fields.StringField({ required: true, blank: true, initial: this.SPELL_LEVEL_LABELS[0] });
    schema.spellLevel = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, max: 7 });
    schema.heightenedCircle = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, max: 7 });
    schema.spellList = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.values(this.SPELL_LISTS),
      initial: this.SPELL_LISTS.ARCANE
    });
    schema.spellcastingModifier = new fields.StringField({
      required: true,
      nullable: false,
      choices: this.SPELLCASTING_MODIFIERS,
      initial: "int"
    });
    schema.spellLists = new fields.ArrayField(
      new fields.StringField({
        required: true,
        nullable: false,
        choices: Object.values(this.SPELL_LISTS),
        initial: this.SPELL_LISTS.ARCANE
      }),
      { initial: [this.SPELL_LISTS.ARCANE] }
    );
    schema.castingTime = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.range = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.shape = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.shapeSize = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.duration = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.concentration = new fields.BooleanField({ required: true, nullable: false, initial: false });
    schema.flavor = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.attackType = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.savingThrowType = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.basicSavingThrow = new fields.BooleanField({
      required: true,
      nullable: false,
      initial: false
    });
    schema.heighteningOptions = new fields.ArrayField(
      new fields.SchemaField({
        text: new fields.StringField({ required: true, blank: true, initial: "" }),
        repeatable: new fields.BooleanField({ required: true, nullable: false, initial: false }),
        attributeRequirement: new fields.StringField({ required: true, blank: true, initial: "" })
      }),
      { initial: [] }
    );
    schema.conditionsApplied = new fields.ArrayField(
      new fields.StringField({ required: true, blank: true, initial: "" }),
      { initial: [] }
    );
    schema.damage = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.damageType = new fields.StringField({
      required: true,
      nullable: false,
      blank: true,
      choices: ["", ...DamageTypes],
      initial: ""
    });
    schema.injuring = new fields.BooleanField({
      required: true,
      nullable: false,
      initial: false
    });
    schema.healing = new fields.ObjectField({ required: false, nullable: true, initial: null });
    schema.summons = new fields.ObjectField({ required: false, nullable: true, initial: null });
    schema.discharge = new fields.ObjectField({ required: false, nullable: true, initial: null });
    schema.dischargeActive = new fields.BooleanField({ required: true, nullable: false, initial: false });
    schema.prepared = new fields.BooleanField({ required: true, nullable: false, initial: false });

    return schema;
  }
}
