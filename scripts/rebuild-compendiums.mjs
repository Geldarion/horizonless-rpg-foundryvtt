import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { removePackArtifacts } from "./compendium-pack-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const PACKS = Object.freeze([
  {
    name: "spells",
    script: "build-spell-compendium.mjs"
  },
  {
    name: "ancestry-features",
    script: "build-ancestry-feature-compendium.mjs"
  },
  {
    name: "class-features",
    script: "build-class-feature-compendium.mjs"
  },
  {
    name: "maneuvers",
    script: "build-maneuver-compendium.mjs"
  },
  {
    name: "curios",
    script: "build-curio-compendium.mjs"
  }
]);

function deletePackArtifacts(packName) {
  const legacyOutputPath = path.join(rootDir, "packs", `${packName}.db`);
  const outputPath = path.join(rootDir, "packs", packName);

  try {
    removePackArtifacts(outputPath, legacyOutputPath);
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: failed to delete pack artifacts for "${packName}" (${code}).`);
    console.error("Foundry may still be running or still locking compendium files. Close Foundry and run this command again.");
    console.error(message);
    process.exit(1);
  }
}

function runBuilder(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  for (const pack of PACKS) {
    deletePackArtifacts(pack.name);
  }

  for (const pack of PACKS) {
    runBuilder(pack.script);
  }

}

main();
