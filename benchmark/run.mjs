// Scores the scanner alone. It does not measure an agent using the skill.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scan } from '../skills/citation-needed/scripts/scan.mjs';

const dir = new URL('.', import.meta.url);
const seeds = JSON.parse(readFileSync(new URL('seeds.json', dir), 'utf8'));
const results = {};
const missed = [];

for (const [name, { fake, clean }] of Object.entries(seeds)) {
  const root = fileURLToPath(new URL(`fixtures/${name}/`, dir));
  const findings = scan(root);
  const lineOf = ({ file, match }) => {
    const text = readFileSync(`${root}${file}`, 'utf8');
    const index = text.indexOf(match);
    if (index < 0) throw new Error(`seed not found: ${file}: ${match}`);
    return text.slice(0, index).split('\n').length;
  };
  const hit = (seed) => findings.some((f) => f.file === seed.file && f.line === lineOf(seed));

  const planted = fake.filter((seed) => !seed.needsAgent);
  const semantic = fake.filter((seed) => seed.needsAgent);
  const known = new Set(fake.map((seed) => `${seed.file}:${lineOf(seed)}`));
  missed.push(...planted.filter((seed) => !hit(seed)).map((seed) => `${name}: ${seed.match}`));

  results[name] = {
    pattern_seeds: planted.length,
    pattern_caught: planted.filter(hit).length,
    semantic_seeds: semantic.length,
    semantic_caught: semantic.filter(hit).length,
    clean_decoys: clean.length,
    false_alarms: clean.filter(hit).length,
    unseeded_findings: findings.filter((f) => !known.has(`${f.file}:${f.line}`)).length,
  };
}

const total = {};
for (const row of Object.values(results)) {
  for (const [key, value] of Object.entries(row)) total[key] = (total[key] ?? 0) + value;
}
results.total = total;

console.table(results);
if (missed.length) console.log('Missed pattern seeds:\n ' + missed.join('\n '));
writeFileSync(new URL('results.json', dir), `${JSON.stringify(results, null, 2)}\n`);
