import { ItemType } from '../data/enums.mjs';

export function getArmorStrengthRequirementFailure(item, actor = item?.actor) {
  if (item?.type !== ItemType.ARMOR) return null;
  if (!actor) return null;

  const actorStr = Number(actor.system?.abilities?.str?.mod ?? 0);
  const requiredStr = Number(item.system?.strRequirement ?? 0);
  if (actorStr >= requiredStr) return null;

  return {
    actorStr,
    requiredStr,
    message: `${item.name} requires STR ${requiredStr} to be worn.`,
  };
}
