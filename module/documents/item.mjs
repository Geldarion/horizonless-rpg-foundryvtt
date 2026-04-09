import { HorizonlessWeaponItem } from './item-weapon.mjs';
import { HorizonlessSpellItem } from './item-spell.mjs';
import { HorizonlessManeuverItem } from './item-maneuver.mjs';

/**
 * Public Item document class used by system registration.
 * Composition chain:
 * Item -> HorizonlessBaseItem -> HorizonlessWeaponItem -> HorizonlessItem
 */
export class HorizonlessItem extends HorizonlessWeaponItem {
  static registerHooks() {
    HorizonlessWeaponItem.registerHooks();
    HorizonlessSpellItem.registerHooks();
  }

  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    if (this.type === 'spell') {
      HorizonlessSpellItem.prototype._applyDefaultSpellcastingModifierToSource.call(this, data);
    }
  }

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    if (this.type === 'spell') {
      HorizonlessSpellItem.prototype._applyDefaultSpellcastingModifierToUpdate.call(this, changed);
    }
  }

  _parseAdvancementRequirement(requirement) {
    return HorizonlessManeuverItem.prototype._parseAdvancementRequirement.call(this, requirement);
  }

  _getMetManeuverAdvancements() {
    return HorizonlessManeuverItem.prototype._getMetManeuverAdvancements.call(this);
  }

  _buildManeuverChatContent(baseContent = '') {
    return HorizonlessManeuverItem.prototype._buildManeuverChatContent.call(this, baseContent);
  }

  async _buildManeuverRollFlavorSuffix() {
    return HorizonlessManeuverItem.prototype._buildManeuverRollFlavorSuffix.call(this);
  }

  _setPendingHeighteningSelections(selections) {
    return HorizonlessSpellItem.prototype._setPendingHeighteningSelections.call(this, selections);
  }

  _consumePendingHeighteningSelections() {
    return HorizonlessSpellItem.prototype._consumePendingHeighteningSelections.call(this);
  }

  async _formatHeighteningSelectionsHtml(selections) {
    return HorizonlessSpellItem.prototype._formatHeighteningSelectionsHtml.call(this, selections);
  }

  _isHeighteningSelected() {
    return HorizonlessSpellItem.prototype._isHeighteningSelected.call(this);
  }

  _getOrdinalSuffix(value) {
    return HorizonlessSpellItem.prototype._getOrdinalSuffix.call(this, value);
  }

  _getSpellCircleFromSystem() {
    return HorizonlessSpellItem.prototype._getSpellCircleFromSystem.call(this);
  }

  _getSpellCircleLabel(circleValue) {
    return HorizonlessSpellItem.prototype._getSpellCircleLabel.call(this, circleValue);
  }

  _showHeighteningConfirmationDialog() {
    return HorizonlessSpellItem.prototype._showHeighteningConfirmationDialog.call(this);
  }

  _getCastingSourceApplication(options = {}) {
    return HorizonlessSpellItem.prototype._getCastingSourceApplication.call(this, options);
  }

  _withMinimizedCastingSourceApplication(options, callback) {
    return HorizonlessSpellItem.prototype._withMinimizedCastingSourceApplication.call(this, options, callback);
  }

  _resolveSpellTemplateConfig() {
    return HorizonlessSpellItem.prototype._resolveSpellTemplateConfig.call(this);
  }

  _placeSpellTemplate() {
    return HorizonlessSpellItem.prototype._placeSpellTemplate.call(this);
  }

  _targetTokensInTemplate(templateDocument) {
    return HorizonlessSpellItem.prototype._targetTokensInTemplate.call(this, templateDocument);
  }

  async roll(options = {}) {
    if (this.type === 'spell') {
      return HorizonlessSpellItem.prototype.roll.call(this, options);
    }
    return super.roll();
  }
}
