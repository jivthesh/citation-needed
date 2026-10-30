#!/usr/bin/env node
// Finds suspects, not verdicts: the agent traces each one back to a source.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.py']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.expo', '.venv', 'venv',
  '__pycache__', 'coverage', 'vendor', '_generated', 'target',
]);
const NOT_PROD =
  /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|fixtures|mocks?|stories|seeds?|scripts)\/|[._-](test|spec|stories|mock)\.[^/]+$|\.config\.|(^|\/)(test_[^/]+|conftest)\.py$/;
const MAX_BYTES = 1_000_000;

const DATA =
  'rating|rent|price|amount|total|count|score|balance|fee|revenue|salary|stars?|reviews?|users?|customers?|sales|views|followers|deposit|discount|tax|bookings?|occupancy|distance|percent|stock|inventory';
// Zero is left out: `count ?? 0` is usually a sane default, `count ?? 128` is not.
const NUM = '(?:[1-9][\\d_,]*(?:\\.\\d+)?|0\\.\\d*[1-9]\\d*)';

const RULES = [
  ['fallback-number', 'high', 'made-up number shown when the real value is missing', [
    new RegExp(`(?:${DATA})\\w*['"\\]]?\\)?\\s*(?:\\?\\?|\\|\\|)\\s*${NUM}\\b`, 'gi'),
    new RegExp(`\\.get\\(\\s*['"]\\w*(?:${DATA})\\w*['"]\\s*,\\s*${NUM}\\b`, 'gi'),
    new RegExp(`(?:${DATA})\\w*\\s+or\\s+${NUM}\\b`, 'gi'),
  ]],
  ['fallback-status', 'high', 'missing status defaults to a good-looking one', [
    /(?:\?\?|\|\||\bor)\s*['"`](?:verified|approved|paid|active|success(?:ful)?|completed?|confirmed|available)['"`]/gi,
  ]],
  ['placeholder-identity', 'high', 'placeholder person or text', [
    /(?<!placeholder=["'][^"'\n]*)(?:\b(?:john|jane) (?:doe|smith)\b|lorem ipsum|\bacme (?:corp|inc)\b)/gi,
  ]],
  ['invented-stat', 'high', 'marketing stat with no source in code', [
    /\b(?:\d[\d,.]*(?:[km]\+?|\+)|\d{1,3}(?:,\d{3})+)\s+(?:happy|satisfied|active|verified|trusted|paying|monthly)\s+\w+/gi,
    /\b\d\.\d\s*(?:★|⭐|stars?\b)/gi,
    /\b\d{2}(?:\.\d+)?%\s+(?:uptime|satisfaction|success|accuracy)/gi,
  ]],
  ['random-data', 'high', 'random value shown as data', [
    new RegExp(`(?:${DATA})\\w*\\s*[:=][^\\n]*(?:Math\\.random\\(|random\\.(?:randint|random|uniform)\\()`, 'gi'),
  ]],
  ['simulated-latency', 'high', 'fixed delay stands in for real work', [
    /new Promise\(\s*\(?\w+\)?\s*=>\s*setTimeout\(\s*\w+\s*,\s*\d+\s*\)/g,
  ]],
  ['mock-in-prod', 'high', 'production code imports mock data', [
    /(?:from\s+['"]|require\(\s*['"]|^[ \t]*(?:from|import)\s+)[^'"\n]*(?:mock|fake|dummy|fixture|sample)[^'"\n]*/gim,
  ]],
  ['silent-catch', 'high', 'error swallowed, so failure looks like success', [
    /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\s*)*\}/g,
    /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+(?:\[\]|\{\}|null|true|mock\w*|fallback\w*)\s*;?\s*\}/gi,
    /\.catch\(\s*\(?[^)]*\)?\s*=>\s*(?:\{\s*\}|\[\s*\]|null|undefined|\(\s*\{\s*\}\s*\))\s*\)/g,
    /except[^\n]*:\s*\n\s*(?:pass|return\s+(?:None|\[\]|\{\}|True))\b/g,
  ]],
  ['stub-success', 'high', 'function only reports success', [
    /\{\s*return\s*\{\s*(?:success|ok)\s*:\s*true\s*\}\s*;?\s*\}/g,
    /^[ \t]*def [^\n]*:\s*\n\s*return\s+(?:True\b|\{['"](?:success|ok)['"]:\s*True\})/gm,
  ]],
  ['admitted-fake', 'medium', 'comment admits this is not real', [
    /(?:\/\/|#|\/\*)[^\n]*\b(?:(?:todo|fixme)\b[^\n]*\b(?:real|replace|wire|hook up|implement)|for now|placeholder|stubbed?|simulat\w*|hard-?coded|fake|mock(?:ed)?|dummy)\b[^\n]*/gi,
  ]],
  ['hardcoded-flag', 'medium', 'trust flag set to a literal', [
    /\b(?:is)?(?:verified|paid|approved|kyc\w*)\s*[:=]\s*(?:true\b|True\b|['"]verified['"])|\bverified=\{true\}/gi,
  ]],
];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) yield* files(path);
    } else if (entry.isFile() && CODE.has(extname(entry.name))) {
      yield path;
    }
  }
}

export function scanText(text) {
  const findings = [];
  const seen = new Set();
  for (const [rule, severity, why, patterns] of RULES) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length;
        const key = `${rule}:${line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({ rule, severity, why, line, code: text.split('\n')[line - 1].trim().slice(0, 120) });
      }
    }
  }
  return findings;
}

export function scan(root) {
  const findings = [];
  for (const path of statSync(root).isFile() ? [root] : files(root)) {
    const file = relative(root, path).split(sep).join('/') || path;
    if (NOT_PROD.test(file) || statSync(path).size > MAX_BYTES) continue;
    for (const finding of scanText(readFileSync(path, 'utf8'))) findings.push({ file, ...finding });
  }
  return findings.sort((a, b) => a.severity.localeCompare(b.severity) || a.file.localeCompare(b.file) || a.line - b.line);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const root = args.find((arg) => !arg.startsWith('--')) ?? '.';
  const findings = scan(root);
  if (json) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const f of findings) console.log(`[${f.severity}] ${f.file}:${f.line}  ${f.rule}: ${f.why}\n    ${f.code}`);
    console.log(`\n${findings.length} suspects. Trace each one before calling it fake.`);
  }
}
