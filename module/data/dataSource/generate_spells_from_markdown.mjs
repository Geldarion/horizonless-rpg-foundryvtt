#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    reference: null,
    report: null,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        args.input = argv[++i] ?? null;
        break;
      case '--output':
      case '-o':
        args.output = argv[++i] ?? null;
        break;
      case '--reference':
      case '-r':
        args.reference = argv[++i] ?? null;
        break;
      case '--report':
        args.report = argv[++i] ?? null;
        break;
      case '--strict':
        args.strict = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input || !args.output) {
    printHelp();
    throw new Error('Both --input and --output are required.');
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node generate_spells_from_markdown.mjs --input spells.md --output spells.generated.json [--reference spells.json] [--report validation.txt] [--strict]

Notes:
  - The markdown file is treated as the source of truth.
  - The optional reference JSON is used for validation and for carrying forward fields that are not present in the markdown source, especially iconPath and some targeting metadata.
`);
}

async function readText(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return text.replace(/^\uFEFF/, '');
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function cleanMojibake(text) {
  let out = normalizeNewlines(text)
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '');

  const replacements = [
    ['РІР‚в„ў', "'"],
    ['Р“В©', 'é'],
    ['Р“В\u00A0', 'à'],
    ['Р"В©', 'é'],
    ['Р"В\u00A0', 'à'],
    ['â€™', "'"],
    ['â€˜', "'"],
    ['â€œ', '"'],
    ['â€\u009d', '"'],
    ['â€“', '-'],
    ['â€”', '-'],
    ['â€¦', '...'],
    ['Ã©', 'é'],
    ['Ã¨', 'è'],
    ['Ã¡', 'á'],
    ['Ã ', 'à'],
    ['Â', ''],
    ['’', "'"],
    ['‘', "'"],
    ['“', '"'],
    ['”', '"'],
    ['–', '-'],
    ['—', '-'],
    ['−', '-'],
    ['×', 'x'],
    ['…', '...'],
    ['’', "'"],
  ];

  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }

  return out;
}

function normalizeKey(value) {
  return cleanMojibake(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeBody(body) {
  const cleaned = cleanMojibake(body)
    .replace(/^# \*\*List of .*?\*\*\s*$/gmu, '')
    .replace(/\n{3,}/g, '\n\n');

  const lines = cleaned.split('\n');
  const out = [];
  let previousWasBlank = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/g, '');
    const stripped = line.replace(/^\t+/, '');

    if (!stripped.trim()) {
      if (out.length > 0 && !previousWasBlank) {
        out.push('');
      }
      previousWasBlank = true;
      continue;
    }

    out.push(stripped);
    previousWasBlank = false;
  }

  while (out[0] === '') out.shift();
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function splitSpellBlocks(markdown) {
  const headingRegex = /^## \*\*\\\[(?<level>[^\]]+)\\\] (?<name>.+?)\*\*\s*$/gmu;
  const matches = [...markdown.matchAll(headingRegex)];
  const blocks = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const next = matches[i + 1];
    const start = match.index + match[0].length;
    const end = next ? next.index : markdown.length;
    const rawBlock = markdown.slice(start, end).trim();

    blocks.push({
      index: i,
      rawLevel: cleanMojibake(match.groups.level).trim(),
      rawName: cleanMojibake(match.groups.name).trim(),
      rawBlock,
    });
  }

  return blocks;
}

function extractRequiredField(blockText, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = blockText.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\t*(.+)$`, 'mu'));
  if (!match) {
    throw new Error(`Could not find required field "${label}".`);
  }
  return cleanMojibake(match[1]).trim();
}

function extractFlavorAndDescription(blockText) {
  const cleaned = cleanMojibake(blockText);
  const flavorMatch = cleaned.match(/^## \*(.+?)\*\s*$/mu);
  if (!flavorMatch) {
    throw new Error('Could not find flavor line.');
  }

  const flavor = cleanMojibake(flavorMatch[1]).trim();
  const description = normalizeBody(cleaned.slice(flavorMatch.index + flavorMatch[0].length));
  return { flavor, description };
}

function formatLevel(rawLevel) {
  return rawLevel === 'Cantrip' ? 'Cantrip' : `${rawLevel} Circle`;
}

function getBaseDescription(description) {
  return description.split('\n\n***Heightening.***')[0];
}

function deriveAttackType(description) {
  const base = getBaseDescription(description).toLowerCase();
  if (base.includes('you make a melee spell attack') || base.includes('makes a melee spell attack')) {
    return 'melee spell attack';
  }
  if (base.includes('you make a ranged spell attack') || base.includes('makes a ranged spell attack')) {
    return 'ranged spell attack';
  }
  return null;
}

function deriveSavingThrowType(description) {
  const base = getBaseDescription(description);
  const patterns = [
    /may make a \*\*([A-Za-z-]+)\*\* or \*\*([A-Za-z-]+)\*\* saving throw/i,
    /make a basic \*\*([A-Za-z-]+)\*\* saving throw/i,
    /make a \*\*([A-Za-z-]+)\*\* saving throw/i,
    /make a basic ([A-Za-z-]+) save\b/i,
    /make a ([A-Za-z-]+) save\b/i,
  ];

  for (const pattern of patterns) {
    const match = base.match(pattern);
    if (!match) continue;
    if (match[2]) return `${match[1]} or ${match[2]}`;
    return match[1];
  }

  return null;
}

function deriveBasicSavingThrow(description) {
  const base = getBaseDescription(description);
  return /make a basic \*\*[A-Za-z-]+\*\* saving throw|make a basic [A-Za-z-]+ save\b/i.test(base);
}

function parseDamagePhrase(innerText, suffix) {
  const inner = innerText.trim().replace(/[.,;:]+$/g, '');

  const injuringMatch = inner.match(/^injuring ([A-Za-z-]+) damage$/i);
  if (injuringMatch) {
    const amount = parseDerivedAmountFromSuffix(suffix);
    return amount ? { amount, type: injuringMatch[1], injuring: true } : null;
  }

  const explicitMatch = inner.match(/^(.+?) ([A-Za-z-]+) damage$/i);
  if (explicitMatch) {
    return {
      amount: explicitMatch[1].trim(),
      type: explicitMatch[2],
      injuring: false,
    };
  }

  const typeOnlyMatch = inner.match(/^([A-Za-z-]+) damage$/i);
  if (typeOnlyMatch) {
    const amount = parseDerivedAmountFromSuffix(suffix);
    return amount
      ? { amount, type: typeOnlyMatch[1], injuring: false }
      : null;
  }

  if (/^damage$/i.test(inner)) {
    const amount = parseDerivedAmountFromSuffix(suffix);
    return amount ? { amount, type: null, injuring: false } : null;
  }

  return null;
}

function parseDerivedAmountFromSuffix(suffix) {
  const normalized = cleanMojibake(suffix);

  const simpleEqual = normalized.match(/equal to ([^.\n]+?)(?:[.,]| and\b| until\b|$)/i);
  if (simpleEqual) {
    const raw = simpleEqual[1].trim().replace(/^your /i, '');
    if (/^a rolling of the ([a-z -]+)$/i.test(raw)) {
      return `${raw.match(/^a rolling of the ([a-z -]+)$/i)[1]} roll`;
    }
    if (/^the total of (?:their|its|the) volatile dice$/i.test(raw)) {
      return 'volatile dice total';
    }
    if (/^5 x the number of d6s that exploded$/i.test(raw)) {
      return '5 x exploded d6s';
    }
    return raw;
  }

  return null;
}

function deriveDamageInfo(description) {
  const base = getBaseDescription(description);

  if (/Roll a d4 to determine the attack's damage type/i.test(base)) {
    return {
      damage: 'spellcasting modifier',
      damageType: { type: 'prismaticBlast', injuring: false },
    };
  }

  const directResistMatch = base.match(/saving throw[^.\n]*?resist(?: [^*\n.]+)?\s+\*\*([^*]+?)\*\*/i);
  if (directResistMatch) {
    const parsed = parseDamagePhrase(directResistMatch[1], '');
    if (parsed) {
      return {
        damage: parsed.amount,
        damageType: parsed.type ? { type: parsed.type, injuring: parsed.injuring } : null,
      };
    }
  }

  const hits = [];
  const directVerbPatterns = [
    /deals?\s+\*\*([^*]+?)\*\*/gi,
    /dealt\s+\*\*([^*]+?)\*\*/gi,
    /takes?\s+\*\*([^*]+?)\*\*/gi,
  ];

  for (const pattern of directVerbPatterns) {
    for (const match of base.matchAll(pattern)) {
      const prefix = base.slice(Math.max(0, match.index - 160), match.index);
      const suffix = base.slice(match.index + match[0].length, match.index + match[0].length + 200);
      const lowerPrefix = prefix.toLowerCase();

      if (/converted to\s*$/i.test(lowerPrefix)) continue;
      if (/against\s*$/i.test(lowerPrefix) && !/equal to/i.test(suffix)) continue;
      if (/\bST\b/i.test(match[1])) continue;

      const parsed = parseDamagePhrase(match[1], suffix);
      if (!parsed) continue;

      let score = 0;
      if (/saving throw[^.\n]*resist/i.test(`${prefix}${match[0]}${suffix}`)) score += 100;
      if (/\bself\b|yourself/i.test(prefix) || /\bself\b|yourself/i.test(suffix)) score -= 40;
      if (/additional/i.test(lowerPrefix)) score -= 5;
      if (/at the start of your next turn|on each of your future turns|once per turn/i.test(lowerPrefix)) score -= 10;

      hits.push({ ...parsed, score, index: match.index });
    }
  }

  const fallbackPattern = /\*\*([^*]*damage[^*]*)\*\*/gi;
  for (const match of base.matchAll(fallbackPattern)) {
    const inner = match[1];
    if (/\bST\b/i.test(inner)) continue;

    const prefix = base.slice(Math.max(0, match.index - 160), match.index);
    const suffix = base.slice(match.index + match[0].length, match.index + match[0].length + 200);
    const lowerPrefix = prefix.toLowerCase();

    if (/converted to\s*$/i.test(lowerPrefix)) continue;
    if (/against\s*$/i.test(lowerPrefix) && !/equal to/i.test(suffix)) continue;

    const parsed = parseDamagePhrase(inner, suffix);
    if (!parsed) continue;

    let score = -20;
    if (/saving throw[^.\n]*resist/i.test(`${prefix}${match[0]}${suffix}`)) score += 100;
    if (/\bself\b|yourself/i.test(prefix) || /\bself\b|yourself/i.test(suffix)) score -= 40;
    if (/additional/i.test(lowerPrefix)) score -= 5;
    if (/at the start of your next turn|on each of your future turns|once per turn/i.test(lowerPrefix)) score -= 10;

    hits.push({ ...parsed, score, index: match.index });
  }

  if (hits.length === 0) {
    return { damage: null, damageType: null };
  }

  hits.sort((a, b) => (b.score - a.score) || (a.index - b.index));

  const chosen = hits[0];
  const sameAmountHits = hits.filter((hit) => hit.amount === chosen.amount);
  const uniqueTypes = [...new Set(sameAmountHits.map((hit) => hit.type).filter(Boolean))];
  const uniqueInjuring = [...new Set(sameAmountHits.map((hit) => hit.injuring))];

  let damageType = null;
  if (uniqueTypes.length === 1) {
    damageType = {
      type: uniqueTypes[0],
      injuring: uniqueInjuring.length === 1 ? uniqueInjuring[0] : false,
    };
  }

  return { damage: chosen.amount, damageType };
}

function flattenMarkdownSentence(text) {
  return cleanMojibake(text)
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\n\s*\n\* /g, ' ')
    .replace(/\n\s*\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveDischarge(description) {
  const match = description.match(/\*\*Discharge\.\*\*\s*(.+)$/s);
  if (!match) return null;

  const dischargeText = `Discharge. ${flattenMarkdownSentence(match[1])}`;
  const damageMatch = dischargeText.match(/\b(\d+d\d+|Xd\d+)\b/);
  return {
    discharge_description: dischargeText,
    discharge_damage: damageMatch ? damageMatch[1] : null,
  };
}

function deriveExplicitShape(range, description) {
  const base = getBaseDescription(description);

  const directPatterns = [
    { regex: /(\d+ feet|Variable) radius sphere/i, shape: 'sphere' },
    { regex: /(\d+ feet|Variable) square/i, shape: 'square' },
    { regex: /(\d+ feet|Variable) cube/i, shape: 'cube' },
    { regex: /(\d+ feet|Variable) radius circle/i, shape: 'circle' },
    { regex: /(\d+ feet|Variable) diameter,?\s+\d+ feet tall cylinder/i, shape: 'cylinder' },
    { regex: /(\d+ feet|Variable) radius,?\s+\d+ feet tall cylinder/i, shape: 'cylinder' },
    { regex: /(\d+ feet|Variable) foot diameter,?\s+\d+ foot tall cylinder/i, shape: 'cylinder', captureFootNumber: true },
    { regex: /(\d+ feet|Variable) foot radius,?\s+\d+ foot tall cylinder/i, shape: 'cylinder', captureFootNumber: true },
  ];

  for (const entry of directPatterns) {
    const match = base.match(entry.regex);
    if (match) {
      return { shape: entry.shape, shapeSize: match[1] };
    }
  }

  const footPatterns = [
    { regex: /(\d+) foot radius sphere/i, shape: 'sphere' },
    { regex: /(\d+) foot square/i, shape: 'square' },
    { regex: /(\d+) foot cube/i, shape: 'cube' },
    { regex: /(\d+) foot radius circle/i, shape: 'circle' },
    { regex: /(\d+) foot (?:radius|diameter),?\s+\d+ foot tall cylinder/i, shape: 'cylinder' },
    { regex: /(\d+) foot wide line/i, shape: 'line', useRangeIfMentioned: true },
    { regex: /(\d+) foot long line/i, shape: 'line' },
    { regex: /(\d+) foot cone/i, shape: 'cone' },
  ];

  for (const entry of footPatterns) {
    const match = base.match(entry.regex);
    if (!match) continue;
    let shapeSize = `${match[1]} feet`;
    if (entry.useRangeIfMentioned && /whose length is the range of this spell/i.test(base)) {
      shapeSize = range;
    }
    return { shape: entry.shape, shapeSize };
  }

  if (/cone in front of you whose length is the range of this spell/i.test(base)) {
    return { shape: 'cone', shapeSize: range };
  }

  if (/line whose length is the range of this spell/i.test(base)) {
    return { shape: 'line', shapeSize: range };
  }

  return { shape: null, shapeSize: null };
}

function parseSpellBlock(block) {
  const { flavor, description } = extractFlavorAndDescription(block.rawBlock);
  const damageInfo = deriveDamageInfo(description);
  const targeting = deriveExplicitShape(extractRequiredField(block.rawBlock, 'Range'), description);

  return {
    name: block.rawName,
    level: formatLevel(block.rawLevel),
    lists: extractRequiredField(block.rawBlock, 'Spell Lists').split(',').map((part) => cleanMojibake(part).trim()),
    castingTime: extractRequiredField(block.rawBlock, 'Casting Time'),
    range: extractRequiredField(block.rawBlock, 'Range'),
    shape: targeting.shape,
    duration: extractRequiredField(block.rawBlock, 'Duration'),
    concentration: extractRequiredField(block.rawBlock, 'Concentration') === 'Yes',
    flavor,
    description,
    attackType: deriveAttackType(description),
    savingThrowType: deriveSavingThrowType(description),
    basicSavingThrow: deriveBasicSavingThrow(description),
    damage: damageInfo.damage,
    damageType: damageInfo.damageType,
    conditionsApplied: [],
    healing: null,
    summons: null,
    shapeSize: targeting.shapeSize,
    iconPath: null,
    discharge: deriveDischarge(description),
  };
}

function buildReferenceLookup(referenceRecords) {
  const byKey = new Map();
  referenceRecords.forEach((record, index) => {
    const key = normalizeKey(record.name ?? `index-${index}`);
    if (!byKey.has(key)) {
      byKey.set(key, []);
    }
    byKey.get(key).push({ index, record });
  });
  return byKey;
}

function mergeReferenceData(generatedRecords, referenceRecords) {
  const lookup = buildReferenceLookup(referenceRecords);

  return generatedRecords.map((record, index) => {
    let reference = null;
    const matches = lookup.get(normalizeKey(record.name));
    if (matches && matches.length > 0) {
      reference = matches.shift().record;
    } else if (referenceRecords[index]) {
      reference = referenceRecords[index];
    }

    if (!reference) return record;

    const merged = { ...record };

    // These are either curated or not fully present in the markdown source.
    merged.iconPath = reference.iconPath ?? null;
    merged.shape = record.shape ?? null;
    merged.shapeSize = record.shapeSize ?? null;

    // Keep schema-complete defaults stable.
    merged.conditionsApplied = Array.isArray(reference.conditionsApplied) ? reference.conditionsApplied : [];
    merged.healing = reference.healing ?? null;
    merged.summons = reference.summons ?? null;

    return merged;
  });
}

function summarizeValue(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function validateAgainstReference(generatedRecords, referenceRecords) {
  const report = {
    generatedCount: generatedRecords.length,
    referenceCount: referenceRecords.length,
    fieldMismatchCounts: {},
    mismatches: [],
  };

  const fields = [
    'name',
    'level',
    'lists',
    'castingTime',
    'range',
    'shape',
    'duration',
    'concentration',
    'flavor',
    'description',
    'attackType',
    'savingThrowType',
    'basicSavingThrow',
    'damage',
    'damageType',
    'conditionsApplied',
    'healing',
    'summons',
    'shapeSize',
    'iconPath',
    'discharge',
  ];

  const pairCount = Math.min(generatedRecords.length, referenceRecords.length);
  for (let i = 0; i < pairCount; i += 1) {
    const generated = generatedRecords[i];
    const reference = referenceRecords[i];

    for (const field of fields) {
      if (JSON.stringify(generated[field]) === JSON.stringify(reference[field])) {
        continue;
      }

      report.fieldMismatchCounts[field] = (report.fieldMismatchCounts[field] ?? 0) + 1;
      report.mismatches.push({
        index: i,
        spell: generated.name,
        field,
        generated: summarizeValue(generated[field]),
        reference: summarizeValue(reference[field]),
      });
    }
  }

  return report;
}

function renderValidationReport(validation) {
  const lines = [];
  lines.push(`Generated records: ${validation.generatedCount}`);
  lines.push(`Reference records: ${validation.referenceCount}`);
  lines.push('');
  lines.push('Field mismatch counts:');

  const fieldEntries = Object.entries(validation.fieldMismatchCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (fieldEntries.length === 0) {
    lines.push('  none');
  } else {
    for (const [field, count] of fieldEntries) {
      lines.push(`  ${field}: ${count}`);
    }
  }

  lines.push('');
  lines.push('First 40 mismatches:');
  for (const mismatch of validation.mismatches.slice(0, 40)) {
    lines.push(`- [${mismatch.index}] ${mismatch.spell} :: ${mismatch.field}`);
    lines.push(`  generated: ${mismatch.generated}`);
    lines.push(`  reference: ${mismatch.reference}`);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const markdownText = await readText(args.input);
  const cleanedMarkdown = cleanMojibake(markdownText);
  const blocks = splitSpellBlocks(cleanedMarkdown);
  const parsed = blocks.map(parseSpellBlock);

  let outputRecords = parsed;
  let validation = null;

  if (args.reference) {
    const referenceText = await readText(args.reference);
    const referenceRecords = JSON.parse(referenceText);
    outputRecords = mergeReferenceData(parsed, referenceRecords);
    validation = validateAgainstReference(outputRecords, referenceRecords);

    if (args.report) {
      await fs.writeFile(args.report, renderValidationReport(validation), 'utf8');
    }

    if (args.strict && validation.mismatches.length > 0) {
      throw new Error(`Validation failed with ${validation.mismatches.length} mismatches.`);
    }
  }

  await fs.writeFile(args.output, `${JSON.stringify(outputRecords, null, 4)}\n`, 'utf8');

  const summary = {
    parsedSpells: parsed.length,
    output: path.resolve(args.output),
    reference: args.reference ? path.resolve(args.reference) : null,
    report: args.report ? path.resolve(args.report) : null,
    mismatchFields: validation ? validation.fieldMismatchCounts : null,
    mismatchCount: validation ? validation.mismatches.length : 0,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});