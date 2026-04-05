import HorizonlessItem from "./item-item.mjs";

export default class HorizonlessArmorItem extends HorizonlessItem {
  static ARMOR_TYPES = Object.freeze({
    agile: "Agile Armor",
    stock: "Stock Armor",
    fortified: "Fortified Armor"
  });

  // Adjust STR requirements here to match your final rules.
  static ARMOR_RULES = Object.freeze({
    agile: {
      strRequirement: -1,
      calculateArmorClass: ({ tierBonus, dexMod }) => 12 + Math.floor(tierBonus / 2) + dexMod
    },
    stock: {
      strRequirement: 0,
      calculateArmorClass: ({ tierBonus }) => 15 + Math.floor(tierBonus / 2)
    },
    fortified: {
      strRequirement: 4,
      calculateArmorClass: ({ tierBonus, strMod }) => 16 + Math.floor(tierBonus / 2) + Math.ceil(strMod / 2)
    }
  });

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.armorType = new fields.StringField({
      required: true,
      nullable: false,
      choices: Object.keys(this.ARMOR_TYPES),
      initial: "stock"
    });

    schema.strRequirement = new fields.NumberField({
      ...requiredInteger,
      initial: this.ARMOR_RULES.stock.strRequirement,
      min: 0
    });

    schema.armorClass = new fields.NumberField({
      ...requiredInteger,
      initial: 15,
      min: 0
    });
    schema.worn = new fields.BooleanField({
      required: true,
      nullable: false,
      initial: false
    });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    const actorSystem = this.parent?.actor?.system ?? {};
    const tierBonus = Number(actorSystem.tierBonus ?? 0);
    const dexMod = Number(actorSystem.abilities?.dex?.mod ?? 0);
    const strMod = Number(actorSystem.abilities?.str?.mod ?? 0);

    const armorType = this.armorType ?? "stock";
    const rules = this.constructor.ARMOR_RULES[armorType] ?? this.constructor.ARMOR_RULES.stock;

    this.strRequirement = rules.strRequirement;
    this.armorClass = rules.calculateArmorClass({ tierBonus, dexMod, strMod });
  }
}
