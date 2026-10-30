import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runPortfolio, toCsv, toExecutiveSummary } from './pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'data/synthetic/extractions.json');
const rulesPath = path.join(root, 'data/synthetic/rules.json');
const outputDir = path.join(root, 'outputs');
const [extractions, rules] = await Promise.all([
  readFile(inputPath, 'utf8').then(JSON.parse),
  readFile(rulesPath, 'utf8').then(JSON.parse)
]);
const result = runPortfolio(extractions, rules);
if (result.audit.status !== 'passed') throw new Error(`Audit failed: ${result.audit.errors.join('; ')}`);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, 'synthetic_cases.csv'), toCsv(result.cases)),
  writeFile(path.join(outputDir, 'synthetic_summary.md'), toExecutiveSummary(result)),
  writeFile(path.join(outputDir, 'synthetic_audit.json'), JSON.stringify(result.audit, null, 2) + '\n')
]);
process.stdout.write(JSON.stringify({ summary: result.summary, audit: result.audit }, null, 2) + '\n');
