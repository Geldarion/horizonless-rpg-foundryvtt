import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removePackArtifacts, writeCompendiumPack } from "./compendium-pack-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const foundryAppDir = path.resolve(rootDir, "..", "..", "..", "App", "resources", "app");
const sourceDir = path.join(rootDir, "module", "data", "dataSource", "classes");
const outputPath = path.join(rootDir, "packs", "class-features");
const legacyOutputPath = path.join(rootDir, "packs", "class-features.db");
const systemManifestPath = path.join(rootDir, "system.json");
const foundryPackagePath = path.join(foundryAppDir, "package.json");

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

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatDisplayLabel(value) {
  return cleanText(value)
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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

function parseRank(value, fallbackRank = null) {
  const normalized = cleanText(value);
  const match = normalized.match(/\d+/);
  const rank = match ? Number(match[0]) : Number(normalized);
  if (!Number.isFinite(rank)) {
    if (Number.isFinite(fallbackRank)) {
      return Math.max(1, Math.trunc(fallbackRank));
    }
    return 1;
  }
  return Math.max(1, Math.trunc(rank));
}

function inferFeatureRank(feature, previousRank = null) {
  const explicitRank = parseRank(feature?.rank, null);
  if (cleanText(feature?.rank)) {
    return explicitRank;
  }

  const description = cleanText(feature?.description);
  const levelMatch = description.match(/(?:character\s+)?level\s+(\d+)/i);
  if (levelMatch) {
    return parseRank(levelMatch[1], previousRank);
  }

  const rankMatch = description.match(/(\d+)(?:st|nd|rd|th)?\s+rank/i);
  if (rankMatch) {
    return parseRank(rankMatch[1], previousRank);
  }

  return parseRank(feature?.rank, previousRank);
}

function formatRankLabel(rank) {
  const normalizedRank = Math.max(1, Math.trunc(Number(rank) || 1));
  const tens = normalizedRank % 100;

  if (tens >= 11 && tens <= 13) {
    return `${normalizedRank}th Rank`;
  }

  switch (normalizedRank % 10) {
    case 1:
      return `${normalizedRank}st Rank`;
    case 2:
      return `${normalizedRank}nd Rank`;
    case 3:
      return `${normalizedRank}rd Rank`;
    default:
      return `${normalizedRank}th Rank`;
  }
}

function loadSystemMetadata() {
  const systemManifest = JSON.parse(readFileSync(systemManifestPath, "utf8"));
  const foundryPackage = JSON.parse(readFileSync(foundryPackagePath, "utf8"));

  return {
    systemId: cleanText(systemManifest.id),
    systemVersion: cleanText(systemManifest.version),
    coreVersion: `${foundryPackage.release?.generation ?? 13}.${foundryPackage.release?.build ?? 0}`
  };
}

function createStats(metadata) {
  return {
    coreVersion: metadata.coreVersion,
    systemId: metadata.systemId || null,
    systemVersion: metadata.systemVersion || null,
    createdTime: null,
    modifiedTime: null,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null,
    exportSource: null
  };
}

function createFolderDocument(className, classIndex, usedIds, metadata) {
  const normalizedClassName = cleanText(className) || `Class ${classIndex + 1}`;
  const displayClassName = formatDisplayLabel(normalizedClassName) || normalizedClassName;

  return {
    _id: buildId(`class-folder:${slugify(normalizedClassName)}`, usedIds),
    name: displayClassName,
    type: "Item",
    folder: null,
    sorting: "m",
    sort: (classIndex + 1) * 1000,
    color: null,
    flags: {},
    _stats: createStats(metadata)
  };
}

function createClassFeatureDocument(feature, className, classIndex, featureIndex, folderId, usedIds, metadata, rank) {
  const normalizedClassName = cleanText(className) || `Class ${classIndex + 1}`;
  const featureName = cleanText(feature?.name) || `${normalizedClassName} Feature ${featureIndex + 1}`;
  const name = `${formatRankLabel(rank)} - ${featureName}`;

  return {
    _id: buildId(`class-feature:${normalizedClassName}:${name}:${rank}`, usedIds),
    name,
    type: "class-feature",
    img: "icons/svg/book.svg",
    system: {
      description: cleanText(feature?.description),
      className: normalizedClassName,
      rank,
      flavorText: cleanText(feature?.flavor_text)
    },
    effects: [],
    folder: folderId,
    sort: ((classIndex + 1) * 100000) + ((featureIndex + 1) * 1000),
    ownership: { default: 0 },
    flags: {
      horizonless: {
        className: normalizedClassName,
        rank
      }
    },
    _stats: createStats(metadata)
  };
}

function loadClasses() {
  const files = readdirSync(sourceDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  return files.map((file) => {
    const source = JSON.parse(readFileSync(path.join(sourceDir, file), "utf8"));
    return {
      file,
      className: cleanText(source?.class ?? file.replace(/\.json$/i, "")),
      features: Array.isArray(source?.features) ? source.features : []
    };
  });
}

function buildCompendiumDocuments(metadata) {
  const classes = loadClasses();
  const usedIds = new Set();
  const folders = [];
  const docs = [];
  const folderByClassName = new Map();

  classes.forEach((classData, classIndex) => {
    const normalizedClassName = cleanText(classData.className) || `Class ${classIndex + 1}`;
    let folder = folderByClassName.get(normalizedClassName);
    let previousRank = null;

    if (!folder) {
      folder = createFolderDocument(normalizedClassName, folderByClassName.size, usedIds, metadata);
      folderByClassName.set(normalizedClassName, folder);
      folders.push(folder);
    }

    classData.features.forEach((feature, featureIndex) => {
      const rank = inferFeatureRank(feature, previousRank);
      previousRank = rank;
      docs.push(
        createClassFeatureDocument(
          feature,
          normalizedClassName,
          classIndex,
          featureIndex,
          folder._id,
          usedIds,
          metadata,
          rank
        )
      );
    });
  });

  return { folders, docs };
}

async function writePack({ folders, docs }) {
  removePackArtifacts(outputPath, legacyOutputPath);
  await writeCompendiumPack({
    rootDir,
    outputPath,
    folders,
    documents: docs
  });
}

async function main() {
  const metadata = loadSystemMetadata();
  const documents = buildCompendiumDocuments(metadata);
  await writePack(documents);
}

await main();
