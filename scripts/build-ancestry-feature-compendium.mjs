import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const foundryAppDir = path.resolve(rootDir, "..", "..", "..", "App", "resources", "app");
const sourcePath = path.join(rootDir, "module", "data", "dataSource", "ancestries.json");
const outputPath = path.join(rootDir, "packs", "ancestry-features");
const legacyOutputPath = path.join(rootDir, "packs", "ancestry-features.db");
const systemManifestPath = path.join(rootDir, "system.json");
const foundryPackagePath = path.join(foundryAppDir, "package.json");
const classicLevelPath = path.join(foundryAppDir, "node_modules", "classic-level", "index.js");

const FEATURE_FIELDS = Object.freeze([
  { sourceKey: "primary_feature", type: "primary", label: "Primary Feature" },
  { sourceKey: "secondary_feature", type: "secondary", label: "Secondary Feature" },
  { sourceKey: "tertiary_feature", type: "tertiary", label: "Tertiary Feature" },
  { sourceKey: "inheritor_feature", type: "inheritor", label: "Inheritor Feature" }
]);

const MOJIBAKE_REPLACEMENTS = Object.freeze([
  ["Р Р†Р вЂљРІвЂћСћ", "'"],
  ["Р Р†Р вЂљРЎС™", '"'],
  ["Р Р†Р вЂљРЎСљ", '"'],
  ["Р Р†Р вЂљРІР‚Сљ", "-"],
  ["Р Р†Р вЂљРІР‚Сњ", "-"],
  ["Р Р†РІвЂљВ¬Р’В¦", "..."],
  ["РІР‚в„ў", "'"],
  ["РІР‚Сљ", '"'],
  ["РІР‚Сњ", '"'],
  ["РІР‚вЂњ", "-"],
  ["РІР‚вЂќ", "-"],
  ["РІв‚¬В¦", "..."],
  ["Р“вЂ”", "x"],
  ["Р’Р…", "1/2"]
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

function splitFeatureNameAndDescription(value, fallbackName) {
  const text = cleanText(value);
  if (!text) return { name: fallbackName, description: "" };

  const [firstLine, ...rest] = text.split("\n");
  const possibleName = cleanText(firstLine);
  if (!possibleName) return { name: fallbackName, description: text };

  if (rest.length === 0) return { name: possibleName, description: "" };

  return {
    name: possibleName || fallbackName,
    description: cleanText(rest.join("\n"))
  };
}

function normalizeAncestryName(value) {
  return cleanText(value).toLowerCase();
}

function formatFeatureTierSuffix(type) {
  if (type === "primary") return " (Primary)";
  if (type === "secondary") return " (Secondary)";
  if (type === "tertiary") return " (Tertiary)";
  return "";
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

function createFolderDocument(ancestryName, ancestryIndex, usedIds, metadata) {
  const normalizedAncestryName = cleanText(ancestryName) || `Ancestry ${ancestryIndex + 1}`;

  return {
    _id: buildId(`ancestry-folder:${slugify(normalizedAncestryName)}`, usedIds),
    name: normalizedAncestryName,
    type: "Item",
    folder: null,
    sorting: "m",
    sort: (ancestryIndex + 1) * 1000,
    color: null,
    flags: {},
    _stats: createStats(metadata)
  };
}

function createFeatureDocument(ancestry, ancestryIndex, field, fieldIndex, folderId, usedIds, metadata) {
  const ancestryName = cleanText(ancestry?.name) || `Ancestry ${ancestryIndex + 1}`;
  const normalizedAncestry = normalizeAncestryName(ancestryName);
  const sourceText = cleanText(ancestry?.[field.sourceKey]);
  if (!sourceText) return null;

  const fallbackName = field.label;
  const parsed = field.type === "inheritor"
    ? { name: fallbackName, description: sourceText }
    : splitFeatureNameAndDescription(sourceText, fallbackName);
  const featureName = cleanText(parsed.name) || fallbackName;
  const itemName = `${ancestryName} - ${featureName}${formatFeatureTierSuffix(field.type)}`;
  const description = cleanText(parsed.description || sourceText);

  return {
    _id: buildId(`ancestry-feature:${ancestryName}:${field.sourceKey}:${featureName}`, usedIds),
    name: itemName,
    type: "feature",
    img: "icons/svg/book.svg",
    system: {
      description,
      ancestryFeatureType: field.type,
      ancestry: ancestryName,
      normalizedAncestry
    },
    effects: [],
    folder: folderId,
    sort: ((ancestryIndex + 1) * 100000) + ((fieldIndex + 1) * 1000),
    ownership: { default: 0 },
    flags: {
      horizonless: {
        ancestry: ancestryName,
        ancestryFeatureType: field.type
      }
    },
    _stats: createStats(metadata)
  };
}

function loadAncestries() {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  if (!Array.isArray(source)) {
    throw new Error("ancestries.json must be an array.");
  }

  return source;
}

function buildCompendiumDocuments(metadata) {
  const ancestries = loadAncestries();
  const usedIds = new Set();
  const folders = [];
  const docs = [];
  const folderByAncestry = new Map();

  ancestries.forEach((ancestry, ancestryIndex) => {
    const ancestryName = cleanText(ancestry?.name) || `Ancestry ${ancestryIndex + 1}`;
    let folder = folderByAncestry.get(ancestryName);

    if (!folder) {
      folder = createFolderDocument(ancestryName, folderByAncestry.size, usedIds, metadata);
      folderByAncestry.set(ancestryName, folder);
      folders.push(folder);
    }

    FEATURE_FIELDS.forEach((field, fieldIndex) => {
      const doc = createFeatureDocument(
        ancestry,
        ancestryIndex,
        field,
        fieldIndex,
        folder._id,
        usedIds,
        metadata
      );
      if (doc) docs.push(doc);
    });
  });

  return { folders, docs };
}

function removeIfPresent(targetPath) {
  if (!existsSync(targetPath)) return;
  rmSync(targetPath, { recursive: true, force: false });
}

async function loadClassicLevel() {
  const moduleUrl = pathToFileURL(classicLevelPath).href;
  return import(moduleUrl);
}

async function writePack({ folders, docs }) {
  removeIfPresent(outputPath);
  removeIfPresent(legacyOutputPath);

  const { ClassicLevel } = await loadClassicLevel();
  const db = new ClassicLevel(outputPath, {
    createIfMissing: true,
    keyEncoding: "utf8",
    valueEncoding: "json"
  });

  try {
    await db.open();
    const batch = db.batch();

    for (const folder of folders) {
      batch.put(`!folders!${folder._id}`, folder);
    }

    for (const doc of docs) {
      batch.put(`!items!${doc._id}`, doc);
    }

    await batch.write();
  } finally {
    await db.close();
  }
}

async function main() {
  const metadata = loadSystemMetadata();
  const documents = buildCompendiumDocuments(metadata);
  await writePack(documents);
}

await main();
