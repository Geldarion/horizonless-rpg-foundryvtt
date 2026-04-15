import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removePackArtifacts, writeCompendiumPack } from "./compendium-pack-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourcePath = path.join(rootDir, "module", "data", "dataSource", "curios.json");
const outputPath = path.join(rootDir, "packs", "curios");
const legacyOutputPath = path.join(rootDir, "packs", "curios.db");

const MOJIBAKE_REPLACEMENTS = Object.freeze([
  ["РІР‚в„ў", "'"],
  ["РІР‚Сљ", '"'],
  ["РІР‚Сњ", '"'],
  ["РІР‚вЂњ", "-"],
  ["РІР‚вЂќ", "-"],
  ["РІв‚¬В¦", "..."],
  ["вЂ™", "'"],
  ["вЂњ", '"'],
  ["вЂќ", '"'],
  ["вЂ“", "-"],
  ["вЂ”", "-"],
  ["в€¦", "..."]
]);

function cleanText(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    text = text.split(bad).join(good);
  }
  return text.replace(/\r\n/g, "\n").trim();
}

function normalizeImagePath(value) {
  const normalized = cleanText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return "icons/svg/book.svg";

  if (/^(?:https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;
  return normalized;
}

function normalizeCurioChatDescription(rawDescription = "") {
  const source = String(rawDescription ?? "").replace(/\r\n/g, "\n");
  return source.replace(/\n\t+/g, "\n");
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

function createCurioDocument(curio, index, usedIds) {
  const name = cleanText(curio?.Name ?? curio?.name) || `Curio ${index + 1}`;
  return {
    _id: buildId(name, usedIds),
    name,
    type: "curio",
    img: normalizeImagePath(curio?.icon),
    system: {
      description: normalizeCurioChatDescription(
        cleanText(curio?.Description ?? curio?.description)
      ),
      rarity: cleanText(curio?.Rarity ?? curio?.rarity),
      discipline: cleanText(curio?.Discipline ?? curio?.discipline),
      craftingThresholdScore: cleanText(
        curio?.["Crafting Threshold Score"] ?? curio?.craftingThresholdScore
      ),
      actionType: cleanText(curio?.["Action Type"] ?? curio?.actionType),
      mainType: cleanText(curio?.MainType ?? curio?.mainType),
      subType: cleanText(curio?.SubType ?? curio?.subType),
      flavor: cleanText(curio?.Flavor ?? curio?.flavor),
      quantity: 1,
      weight: 0
    },
    effects: [],
    folder: null,
    sort: (index + 1) * 1000,
    ownership: { default: 0 },
    permission: { default: 0 },
    flags: {}
  };
}

async function main() {
  const source = JSON.parse(readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(source)) {
    throw new Error("curios.json must be an array.");
  }

  const usedIds = new Set();
  const docs = source.map((curio, index) => createCurioDocument(curio, index, usedIds));

  removePackArtifacts(outputPath, legacyOutputPath);
  await writeCompendiumPack({
    rootDir,
    outputPath,
    documents: docs
  });
}

await main();
