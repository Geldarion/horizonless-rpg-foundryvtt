import { HorizonlessItemSheet } from './item-sheet.mjs';

export class HorizonlessArmorItemSheet extends HorizonlessItemSheet {
  /** @override */
  get template() {
    return 'systems/horizonless/templates/item/item-armor-sheet.hbs';
  }
}
