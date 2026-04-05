import { HorizonlessItemSheet } from './item-sheet.mjs';

export class HorizonlessWeaponItemSheet extends HorizonlessItemSheet {
  /** @override */
  get template() {
    return 'systems/horizonless/templates/item/item-weapon-sheet.hbs';
  }
}
