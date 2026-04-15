import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function ensureFoundryGlobals() {
  globalThis.global ??= globalThis;
  globalThis.logger ??= {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
  };
}

function getFoundryLevelDatabaseModuleUrl(rootDir) {
  const foundryAppDir = path.resolve(rootDir, "..", "..", "..", "App", "resources", "app");
  const levelDatabasePath = path.join(foundryAppDir, "dist", "database", "backend", "level-database.mjs");
  return pathToFileURL(levelDatabasePath).href;
}

export function removeIfPresent(targetPath) {
  if (!existsSync(targetPath)) return;
  rmSync(targetPath, { recursive: true, force: false });
}

export function removePackArtifacts(outputPath, legacyOutputPath = null) {
  removeIfPresent(outputPath);
  if (legacyOutputPath) removeIfPresent(legacyOutputPath);
}

export async function writeCompendiumPack({
  rootDir,
  outputPath,
  folders = [],
  documents = [],
  documentSublevel = "items"
}) {
  ensureFoundryGlobals();

  const { default: LevelDatabase } = await import(getFoundryLevelDatabaseModuleUrl(rootDir));
  const databaseName = `build:${path.basename(outputPath)}:${Date.now()}`;
  const db = await LevelDatabase.connect(databaseName, outputPath, {
    allowRepair: false,
    sublevels: [documentSublevel, "folders"]
  });

  try {
    const batch = db.batch();
    const documentStore = db.sublevels[documentSublevel];
    const folderStore = db.sublevels.folders;

    for (const folder of folders) {
      batch.put(folderStore.prefixKey(folder._id), folder);
    }

    for (const document of documents) {
      batch.put(documentStore.prefixKey(document._id), document);
    }

    await batch.write();
  } finally {
    await db.close();
  }
}
