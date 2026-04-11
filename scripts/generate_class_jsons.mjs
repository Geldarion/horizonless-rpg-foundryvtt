#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLASS_NAMES = [
  'artificer',
  'berserker',
  'champion',
  'druid',
  'evincer',
  'fighter',
  'hexblade',
  'maven',
  'oracle',
  'ranger',
  'seeker',
  'witch',
  'wizard',
];

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_CLASSES_DIR = path.join(REPO_ROOT, 'module', 'data', 'dataSource', 'classes');

function parseArgs(argv) {
  const options = {
    sourceDir: DEFAULT_CLASSES_DIR,
    cleanDir: null,
    outDir: null,
    writeCleaned: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--source-dir':
        options.sourceDir = argv[++i];
        break;
      case '--clean-dir':
        options.cleanDir = argv[++i];
        break;
      case '--out-dir':
        options.outDir = argv[++i];
        break;
      case '--no-clean-write':
        options.writeCleaned = false;
        break;
      default:
        if (!arg.startsWith('--') && i === 0) {
          options.sourceDir = arg;
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  options.sourceDir = path.resolve(options.sourceDir);
  options.cleanDir = path.resolve(options.cleanDir ?? path.join(options.sourceDir, 'cleaned_markdown'));
  options.outDir = path.resolve(options.outDir ?? options.sourceDir);
  return options;
}

function normalizeNewlines(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function stripFormattingArtifacts(text) {
  return text
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\=/g, '=')
    .replace(/\\\+/g, '+');
}

function cleanMarkdown(rawText) {
  let text = normalizeNewlines(rawText);

  const overviewMatch = text.match(/^##\s+.+?Overview(?:\s+Table)?\s*$/m);
  if (overviewMatch) {
    text = text.slice(overviewMatch.index);
  }

  text = text
    .replace(/^\s*\[\[Back to Top\]\{\.underline\}\]\([^\n)]+\)\s*$/gm, '')
    .replace(/\[\[([^\]]+?)\]\{\.underline\}\]\([^\n)]+\)/g, '$1')
    .replace(/\[([^\]]+?)\]\{\.underline\}/g, '$1')
    .replace(/^##\s*$/gm, '')
    .replace(/^\s{2,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  text = stripFormattingArtifacts(text);

  return text.endsWith('\n') ? text : `${text}\n`;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanupCellText(value) {
  return normalizeWhitespace(
    value
      .replace(/\*\*/g, '')
      .replace(/\\/g, '')
      .replace(/\u00A0/g, ' '),
  );
}

function isOverviewHeading(line) {
  return /overview(?:\s+table)?/i.test(cleanupCellText(line).replace(/^#+\s*/, ''));
}

function splitTableCells(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cleanupCellText(cell));
}

function isGridSeparatorLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('+') && trimmed.endsWith('+');
}

function splitGridCells(line, boundaries) {
  const cells = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i] + 1;
    const end = boundaries[i + 1];
    cells.push(cleanupCellText(line.slice(start, end)));
  }

  return cells;
}

function mergeRowLines(rowLines, columnCount, boundaries = null) {
  const merged = Array.from({ length: columnCount }, () => []);

  for (const line of rowLines) {
    const cells = boundaries ? splitGridCells(line, boundaries) : splitTableCells(line);

    for (let i = 0; i < columnCount; i += 1) {
      const cell = cleanupCellText(cells[i] ?? '');
      if (cell) {
        merged[i].push(cell);
      }
    }
  }

  return merged.map((parts) => parts.join(' ').trim());
}

function isMarkdownSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function parseOverviewTable(cleanedText) {
  const lines = normalizeNewlines(cleanedText).split('\n');
  const overviewIndex = lines.findIndex((line) => isOverviewHeading(line));
  if (overviewIndex === -1) {
    return [];
  }

  const tableLines = [];

  for (let i = overviewIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (tableLines.length === 0) {
      if (trimmed.startsWith('|') || isGridSeparatorLine(trimmed)) {
        tableLines.push(line);
      }
      continue;
    }

    if (!(trimmed.startsWith('|') || isGridSeparatorLine(trimmed))) {
      break;
    }

    tableLines.push(line);
  }

  if (tableLines.length === 0) {
    return [];
  }

  if (tableLines[0].trim().startsWith('+')) {
    const boundaries = [];

    for (let i = 0; i < tableLines[0].length; i += 1) {
      if (tableLines[0][i] === '+') {
        boundaries.push(i);
      }
    }

    const blocks = [];
    let currentBlock = [];

    for (let i = 1; i < tableLines.length; i += 1) {
      const line = tableLines[i];
      const trimmed = line.trim();

      if (isGridSeparatorLine(trimmed)) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [];
        }
        continue;
      }

      if (trimmed.startsWith('|')) {
        currentBlock.push(line);
      }
    }

    if (blocks.length < 2) {
      return [];
    }

    const headers = mergeRowLines(blocks[0], boundaries.length - 1, boundaries);
    const rows = [];

    for (const block of blocks.slice(1)) {
      const mergedRow = mergeRowLines(block, headers.length, boundaries);
      const row = {};

      for (let i = 0; i < headers.length; i += 1) {
        row[headers[i] ?? ''] = mergedRow[i] ?? '';
      }

      const rankValue = row.Rank ?? '';
      if (/^\d+$/.test(rankValue)) {
        rows.push(row);
      }
    }

    return rows;
  }

  const parsedRows = tableLines
    .map((line) => splitTableCells(line))
    .filter((cells) => cells.some((cell) => cell !== ''));

  if (parsedRows.length < 2) {
    return [];
  }

  const headers = parsedRows[0];
  const dataRows = isMarkdownSeparatorRow(parsedRows[1]) ? parsedRows.slice(2) : parsedRows.slice(1);
  const rows = [];

  for (const mergedRow of dataRows) {
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i] ?? ''] = cleanupCellText(mergedRow[i] ?? '');
    }

    if (Object.values(row).some((value) => value !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function splitParagraphs(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function maybeExtractFlavorText(body) {
  const paragraphs = splitParagraphs(body);
  if (paragraphs.length === 0) {
    return { flavorText: '', description: body.trim() };
  }

  const first = paragraphs[0]
    .replace(/\r/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();

  const singleLine = normalizeWhitespace(first);
  const match = singleLine.match(/^(?:"|вЂњ)?\*(.+?)\*(?:"|вЂќ)?$/);
  if (!match) {
    return { flavorText: '', description: body.trim() };
  }

  const flavorText = normalizeWhitespace(match[1]).replace(/^"+|"+$/g, '');
  const description = paragraphs.slice(1).join('\n\n').trim();
  return { flavorText, description };
}

function extractRank(description) {
  const match = description.match(/At\s+([^\n.]*?Rank)\b/);
  return match ? normalizeWhitespace(match[1]) : '';
}

function parseFeatures(cleanedText) {
  const headingRegex = /^#\s+(.+)$/gm;
  const headings = Array.from(cleanedText.matchAll(headingRegex));
  const features = [];

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const next = headings[i + 1];
    const name = current[1].trim();
    const bodyStart = current.index + current[0].length;
    const bodyEnd = next ? next.index : cleanedText.length;
    const rawBody = cleanedText.slice(bodyStart, bodyEnd).trim();

    const { flavorText, description } = maybeExtractFlavorText(rawBody);
    const rank = extractRank(description);

    features.push({
      name,
      flavor_text: flavorText,
      rank,
      description,
    });
  }

  return features;
}

function buildClassJson(cleanedText, className) {
  return {
    class: className,
    overview_table: parseOverviewTable(cleanedText),
    features: parseFeatures(cleanedText),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await fs.mkdir(options.outDir, { recursive: true });
  if (options.writeCleaned) {
    await fs.mkdir(options.cleanDir, { recursive: true });
  }

  const summary = [];

  for (const className of CLASS_NAMES) {
    const inputPath = path.join(options.sourceDir, `${className}.md`);
    try {
      const raw = await fs.readFile(inputPath, 'utf8');
      const cleaned = cleanMarkdown(raw);
      const generated = buildClassJson(cleaned, className);

      if (options.writeCleaned) {
        await fs.writeFile(path.join(options.cleanDir, `${className}.md`), cleaned, 'utf8');
      }
      await fs.writeFile(
        path.join(options.outDir, `${className}.json`),
        `${JSON.stringify(generated, null, 2)}\n`,
        'utf8',
      );

      summary.push(`${className}: ${generated.overview_table.length} overview rows, ${generated.features.length} features`);
    } catch (error) {
      summary.push(`${className}: skipped (${error.message})`);
    }
  }

  console.log('Generated class JSON summary:');
  for (const line of summary) {
    console.log(`- ${line}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
