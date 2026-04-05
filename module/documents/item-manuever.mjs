import { HorizonlessBaseItem } from './item-base.mjs';

const renderTemplate = foundry.applications.handlebars.renderTemplate;

const MANUEVER_MESSAGE_TEMPLATES = {
  chatContent: 'systems/horizonless/module/messages/manuevers/chat-content.hbs',
  rollFlavorSuffix: 'systems/horizonless/module/messages/manuevers/roll-flavor-suffix.hbs',
};

export class HorizonlessManueverItem extends HorizonlessBaseItem {
  _parseAdvancementRequirement(requirement) {
    const rawRequirement = String(requirement ?? '').trim();
    if (!rawRequirement) return null;

    const threshold = this._parseFirstNumber(rawRequirement);
    if (!Number.isFinite(threshold)) return null;

    const abilityMatch = rawRequirement
      .toUpperCase()
      .match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/);
    if (!abilityMatch) return null;

    return {
      threshold,
      ability: abilityMatch[1].toLowerCase(),
      requirement: rawRequirement,
    };
  }

  _getMetManueverAdvancements() {
    if (this.type !== 'manuever') return [];
    if (!this.actor) return [];

    const actorAbilities = this.actor.system?.abilities ?? {};
    const advancements = this.system.advancements;

    return advancements.filter((advancement) => {
      const parsedRequirement = this._parseAdvancementRequirement(
        advancement?.requirement
      );
      if (!parsedRequirement) return false;

      const actorScore = Number(
        actorAbilities?.[parsedRequirement.ability]?.mod
      );
      if (!Number.isFinite(actorScore)) return false;

      return actorScore >= parsedRequirement.threshold;
    });
  }

  async _buildManueverChatContent(baseContent = '') {
    const flavorText = String(this.system?.flavor ?? '').trim();
    const manueverName = String(this.name ?? 'This maneuver').trim() || 'This maneuver';
    const metAdvancements = this._getMetManueverAdvancements();
    let advancements = [];

    if (metAdvancements.length > 0) {
      advancements = await Promise.all(
        metAdvancements.map(async (advancement) => {
          const requirement = String(advancement?.requirement ?? '').trim();
          const text = String(advancement?.text ?? '').trim();
          const textHtml = text
            ? await this._prepareChatContent(text)
            : '';
          return {
            requirement,
            textHtml,
          };
        })
      );
    }

    return renderTemplate(MANUEVER_MESSAGE_TEMPLATES.chatContent, {
      flavor: flavorText,
      baseContentHtml: baseContent,
      manueverName,
      hasAdvancements: advancements.length > 0,
      advancements,
    });
  }

  async _buildManueverRollFlavorSuffix() {
    if (this.type !== 'manuever') return '';

    const flavorText = String(this.system?.flavor ?? '').trim();
    const manueverName = String(this.name ?? 'This maneuver').trim() || 'This maneuver';

    const metAdvancements = this._getMetManueverAdvancements();
    const requirements = metAdvancements
      .map((advancement) => String(advancement?.requirement ?? '').trim())
      .filter((requirement) => requirement.length > 0);

    return renderTemplate(MANUEVER_MESSAGE_TEMPLATES.rollFlavorSuffix, {
      flavor: flavorText,
      manueverName,
      hasRequirements: requirements.length > 0,
      requirements,
      hasContent: Boolean(flavorText) || requirements.length > 0,
    });
  }
}
