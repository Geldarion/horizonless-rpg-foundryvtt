import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourcePath = path.join(rootDir, "module", "data", "dataSource", "maneuvers.json");
const outputPath = path.join(rootDir, "packs", "maneuvers.db");

const MOJIBAKE_REPLACEMENTS = Object.freeze([
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

function normalizeManeuverType(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "attack" || normalized === "strategy") return normalized;
  return "";
}

function normalizeAdvancements(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      requirement: cleanText(entry?.requirement),
      text: cleanText(entry?.text),
    }))
    .filter((entry) => entry.requirement.length > 0 || entry.text.length > 0);
}

function createManeuverDocument(maneuver, index, usedIds) {
  const name = cleanText(maneuver?.name) || `Maneuver ${index + 1}`;
  return {
    _id: buildId(name, usedIds),
    name,
    type: "maneuver",
    img: normalizeImagePath(maneuver?.icon),
    system: {
      description: cleanText(maneuver?.description),
      maneuverType: normalizeManeuverType(maneuver?.["maneuver type"] ?? maneuver?.maneuverType),
      flavor: cleanText(maneuver?.flavor),
      repetitionPenalty: cleanText(maneuver?.["repitition penalty"] ?? maneuver?.repetitionPenalty),
      advancements: normalizeAdvancements(maneuver?.advancements),
    },
    effects: [],
    folder: null,
    sort: (index + 1) * 1000,
    ownership: { default: 0 },
    permission: { default: 0 },
    flags: {}
  };
}

function main() {
  const source = JSON.parse(readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(source)) {
    throw new Error("maneuvers.json must be an array.");
  }

  const usedIds = new Set();
  const docs = source.map((maneuver, index) => createManeuverDocument(maneuver, index, usedIds));
  const ndjson = `${docs.map((doc) => JSON.stringify(doc)).join("\n")}\n`;

  writeFileSync(outputPath, ndjson, "utf8");
}

main();
