import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removePackArtifacts, writeCompendiumPack } from "./compendium-pack-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourcePath = path.join(rootDir, "module", "data", "dataSource", "spells.json");
const outputPath = path.join(rootDir, "packs", "spells");
const legacyOutputPath = path.join(rootDir, "packs", "spells.db");

const SPELL_LIST_MAP = Object.freeze({
  arcane: "arcane",
  divine: "divine",
  harmonic: "harmonic",
  occult: "occult",
  primal: "primal"
});

const MOJIBAKE_REPLACEMENTS = Object.freeze([
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["∦", "..."]
]);

function cleanText(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    text = text.split(bad).join(good);
  }
  return text.replace(/\r\n/g, "\n").trim();
}

function normalizeSpellList(value) {
  const normalized = cleanText(value).toLowerCase();
  return SPELL_LIST_MAP[normalized] ?? SPELL_LIST_MAP.arcane;
}

function normalizeSpellLists(value) {
  const mapped = Array.isArray(value) ? value.map((entry) => normalizeSpellList(entry)) : [];
  const unique = [...new Set(mapped.filter(Boolean))];
  return unique.length > 0 ? unique : [SPELL_LIST_MAP.arcane];
}

function parseSpellLevel(levelLabel) {
  const normalized = cleanText(levelLabel).toLowerCase();
  if (!normalized || normalized === "cantrip") return 0;

  const match = normalized.match(/^(\d+)(st|nd|rd|th)\s+circle$/);
  if (!match) return 0;

  const circle = Number(match[1]);
  if (!Number.isFinite(circle)) return 0;
  return Math.max(0, Math.min(7, circle));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry))
    .filter((entry) => entry.length > 0);
}

function normalizeDamageType(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeDamageBufferEntry(entry = {}) {
  const max = Math.max(0, Math.floor(Number(entry?.max ?? 0)));
  const value = Math.min(
    max,
    Math.max(0, Math.floor(Number(entry?.value ?? 0)))
  );

  return {
    type: normalizeDamageType(entry?.type),
    value,
    max,
  };
}

function normalizeDamageBufferList(value, { ensureAtLeastOne = false } = {}) {
  const source = Array.isArray(value) ? value : [];
  const normalized = source.map((entry) => normalizeDamageBufferEntry(entry));

  if (!ensureAtLeastOne || normalized.length > 0) return normalized;
  return [{ type: "", value: 0, max: 0 }];
}

function parseHeighteningOptionText(optionText) {
  const raw = cleanText(optionText);
  if (!raw) return { text: "", repeatable: false, attributeRequirement: "" };

  const match = raw.match(/^\*\*\(([^)]*)\)\*\*\s*([\s\S]*)$/);
  if (!match) return { text: raw, repeatable: false, attributeRequirement: "" };

  const meta = String(match[1] ?? "")
    .split(",")
    .map((entry) => cleanText(entry))
    .filter(Boolean);
  const body = cleanText(match[2] ?? "");

  let repeatable = false;
  let attributeRequirement = "";
  const unknownMeta = [];

  for (const token of meta) {
    if (/^repeatable$/i.test(token)) {
      repeatable = true;
      continue;
    }
    if (/^\+\d+\s+[A-Z]{3}\s+and\s+above$/i.test(token)) {
      attributeRequirement = token;
      continue;
    }
    unknownMeta.push(token);
  }

  const prefix = unknownMeta.length > 0 ? `**(${unknownMeta.join(", ")})** ` : "";
  return {
    text: cleanText(`${prefix}${body}`),
    repeatable,
    attributeRequirement
  };
}

function normalizeHeighteningOption(option) {
  if (typeof option === "string") return parseHeighteningOptionText(option);
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return { text: "", repeatable: false, attributeRequirement: "" };
  }

  return {
    text: cleanText(option.text ?? option.option),
    repeatable: Boolean(option.repeatable),
    attributeRequirement: cleanText(option.attributeRequirement)
  };
}

function normalizeHeighteningOptions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeHeighteningOption(entry))
    .filter((entry) => entry.text.length > 0);
}

function normalizeSpellDamageProfile(value, fallbackInjuring = false) {
  const explicitInjuring = Boolean(fallbackInjuring);

  if (typeof value === "string") {
    return {
      damageType: normalizeDamageType(value),
      injuring: explicitInjuring
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      damageType: "",
      injuring: explicitInjuring
    };
  }

  return {
    damageType: normalizeDamageType(value.type ?? value.damageType),
    injuring: Boolean(value.injuring ?? explicitInjuring)
  };
}

function normalizeSpellDamageFormula(rawDamage = "") {
  const source = cleanText(rawDamage);
  if (!source) return null;

  const normalized = source
    .replace(/[вЂ“вЂ”]/g, "-")
    .replace(/[Г—xX]/g, "*")
    .replace(/\s+/g, " ")
    .trim();
  if (!/^[\d+\-*/().\s]+$/i.test(normalized)) return null;

  try {
    return normalized;
  } catch (_error) {
    return null;
  }
}

function normalizeDischarge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const dischargeDescription = cleanText(
    value.discharge_description ?? value.description ?? value.text
  );
  const dischargeDamage = cleanText(
    value.discharge_damage ?? value.damage
  );

  if (!dischargeDescription && !dischargeDamage) return null;

  return {
    discharge_description: dischargeDescription,
    discharge_damage: dischargeDamage || null
  };
}

function extractHeighteningOptions(description) {
  const text = cleanText(description);
  if (!text) return [];

  const lines = text.split("\n");
  const startIndex = lines.findIndex((line) => /\*\*\*Heightening\.\*\*\*/i.test(line));
  if (startIndex === -1) return [];

  const options = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*#/.test(line) || /^\s*\*\*\*[^*]+\.\*\*\*/.test(line)) break;
    if (!/^\s*\*\s+/.test(line)) continue;

    const optionLines = [line.trim().replace(/^\*\s+/, "").trim()];
    index += 1;

    while (index < lines.length) {
      const continuation = lines[index];
      if (/^\s*$/.test(continuation)) {
        optionLines.push("");
        index += 1;
        continue;
      }
      if (/^\s*\*\s+/.test(continuation) || /^\s*#/.test(continuation) || /^\s*\*\*\*[^*]+\.\*\*\*/.test(continuation)) {
        index -= 1;
        break;
      }
      optionLines.push(continuation.trim());
      index += 1;
    }

    const option = optionLines.join("\n").trim();
    if (option) options.push(option);
  }

  return options;
}

function normalizeImagePath(value) {
  const normalized = cleanText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return "icons/svg/book.svg";

  if (/^(?:https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;
  return normalized;
}

function buildId(seed, usedIds) {
  for (let index = 0; index < 1000; index += 1) {
    const id = createHash("sha1")
      .update(`${seed}:${index}`)
      .digest("base64url")
      .replace(/[-_]/g, "")
      .slice(0, 16)
      .padEnd(16, "0");
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }

  throw new Error(`Unable to allocate unique ID for seed: ${seed}`);
}

function createSpellDocument(spell, index, usedIds) {
  const name = cleanText(spell?.name) || `Spell ${index + 1}`;
  const levelLabel = cleanText(spell?.level) || "Cantrip";
  const spellLevel = parseSpellLevel(levelLabel);
  const spellLists = normalizeSpellLists(spell?.lists);
  const spellList = spellLists[0] ?? SPELL_LIST_MAP.arcane;

  const shape = cleanText(
    spell?.shape ?? spell?.area ?? spell?.aoe ?? spell?.templateShape
  );
  const shapeSize = cleanText(
    spell?.shapeSize ?? spell?.areaSize ?? spell?.aoeSize ?? spell?.templateSize
  );
  const damageProfile = normalizeSpellDamageProfile(spell?.damageType, spell?.injuring);

  return {
    _id: buildId(`${name}:${spellLevel}:${spellList}`, usedIds),
    name,
    type: "spell",
    img: normalizeImagePath(spell?.iconPath),
    system: {
      description: cleanText(spell?.description),
      levelLabel,
      spellLevel,
      heightenedCircle: spellLevel,
      spellList,
      spellLists,
      prepared: false,
      castingTime: cleanText(spell?.castingTime),
      range: cleanText(spell?.range),
      shape,
      shapeSize,
      duration: cleanText(spell?.duration),
      concentration: Boolean(spell?.concentration),
      flavor: cleanText(spell?.flavor),
      attackType: cleanText(spell?.attackType),
      savingThrowType: cleanText(spell?.savingThrowType),
      basicSavingThrow: Boolean(spell?.basicSavingThrow),
      heighteningOptions: normalizeHeighteningOptions(
        spell?.heighteningOptions ?? extractHeighteningOptions(spell?.description)
      ),
      conditionsApplied: normalizeStringArray(spell?.conditionsApplied),
      damage: normalizeSpellDamageFormula(spell?.damage) ?? cleanText(spell?.damage),
      damageType: damageProfile.damageType,
      injuring: damageProfile.injuring,
      healing: normalizeNullableObject(spell?.healing),
      summons: normalizeNullableObject(spell?.summons),
      discharge: normalizeDischarge(spell?.discharge)
    },
    effects: [],
    folder: null,
    sort: (index + 1) * 1000,
    ownership: { default: 0 },
    permission: { default: 0 },
    flags: {}
  };
}

function normalizeNullableObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function readJsonFile(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

async function main() {
  const source = readJsonFile(sourcePath);
  if (!Array.isArray(source)) {
    throw new Error("spells.json must be an array.");
  }

  const usedIds = new Set();
  const docs = source.map((spell, index) => createSpellDocument(spell, index, usedIds));

  removePackArtifacts(outputPath, legacyOutputPath);
  await writeCompendiumPack({
    rootDir,
    outputPath,
    documents: docs
  });
}

await main();
