// Runs a headless agent with and without citation-needed on the same code and prompt.
// Raw output can quote the target's code, so --out must stay outside this repo.
import { spawn } from 'node:child_process';
import { cpSync, createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '..');
const SLACK = 1;

const { values: opts } = parseArgs({
  options: {
    out: { type: 'string' },
    model: { type: 'string', default: 'sonnet' },
    runs: { type: 'string', default: '3' },
    budget: { type: 'string', default: '1' },
    jobs: { type: 'string', default: '3' },
    target: { type: 'string' },
    seeds: { type: 'string' },
    timeout: { type: 'string', default: '600' },
  },
});
if (!opts.out || resolve(opts.out).startsWith(`${repo}/`) || resolve(opts.out) === repo) {
  throw new Error('--out is required and must be outside this repo');
}

const PROMPT = `Audit this codebase for things that look real but are not: invented data, fallback values shown as real, mock data in production, swallowed errors, stubs that only report success, features nothing reaches, and comments or docs that claim something the code does not do.

Do not change any files. Be selective: report problems, not legitimate defaults.

End your reply with a JSON array in a \`\`\`json fence. Each item must be {"file": "path relative to the current directory", "line": number, "problem": "short"}.`;

const TOOLS = 'Read,Grep,Glob,Skill,Bash(node *),Bash(ls *),Bash(find *),Bash(grep *),Bash(wc *)';

// Seeds name a line by matching text, or list file and line pairs when any one of them counts.
function resolveSeed(root, seed) {
  if (seed.any) return seed.any;
  const text = readFileSync(join(root, seed.file), 'utf8');
  const index = text.indexOf(seed.match);
  if (index < 0) throw new Error(`seed not found: ${seed.file}: ${seed.match}`);
  return [{ file: seed.file, line: text.slice(0, index).split('\n').length }];
}

// An agent that scans src/ may report paths relative to src/, so accept a path suffix.
const samePath = (reported, seeded) => reported === seeded || seeded.endsWith(`/${reported}`);
const near = (item, spot, slack) => samePath(item.file, spot.file) && Math.abs(item.line - spot.line) <= slack;

function parseFindings(reply) {
  const block = [...reply.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1);
  if (!block) return null;
  try {
    return JSON.parse(block[1]).map((item) => ({
      file: String(item.file).replace(/^\.\//, ''),
      line: Number(item.line),
    }));
  } catch {
    return null;
  }
}

function score(root, seeds, findings) {
  const fake = seeds.fake.map((seed) => ({ seed, spots: resolveSeed(root, seed) }));
  const caught = fake.filter(({ spots }) => findings.some((f) => spots.some((s) => near(f, s, SLACK))));
  const clean = (seeds.clean ?? []).flatMap((seed) => resolveSeed(root, seed));
  const allSpots = fake.flatMap(({ spots }) => spots);
  return {
    fake_seeds: fake.length,
    fake_caught: caught.length,
    pattern_seeds: fake.filter(({ seed }) => !seed.needsAgent).length,
    pattern_caught: caught.filter(({ seed }) => !seed.needsAgent).length,
    semantic_seeds: fake.filter(({ seed }) => seed.needsAgent).length,
    semantic_caught: caught.filter(({ seed }) => seed.needsAgent).length,
    clean_decoys: clean.length,
    false_alarms: clean.filter((spot) => findings.some((f) => near(f, spot, 0))).length,
    findings: findings.length,
    other_findings: findings.filter(
      (f) => !allSpots.some((s) => near(f, s, SLACK)) && !clean.some((s) => near(f, s, 0))
    ).length,
  };
}

function runOnce({ arm, name, run, source, seeds }) {
  const id = `${name}-${arm}-${run}`;
  const work = join(opts.out, 'work', id);
  rmSync(work, { recursive: true, force: true });
  cpSync(source, work, { recursive: true });

  const args = [
    '-p', PROMPT,
    '--model', opts.model,
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
    '--max-budget-usd', opts.budget,
    '--allowedTools', TOOLS,
    '--disallowedTools', 'Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent',
  ];
  if (arm === 'skill') args.push('--plugin-dir', repo);

  return new Promise((done) => {
    const started = Date.now();
    const log = createWriteStream(join(opts.out, `${id}.jsonl`));
    const child = spawn('claude', args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), Number(opts.timeout) * 1000);
    let raw = '';
    child.stdout.on('data', (chunk) => { raw += chunk; log.write(chunk); });
    child.stderr.on('data', (chunk) => log.write(chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      log.end();
      const events = raw.split('\n').flatMap((line) => {
        try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; }
      });
      const result = events.find((event) => event.type === 'result');
      const uses = events.flatMap((event) =>
        event.type === 'assistant' ? event.message.content.filter((c) => c.type === 'tool_use') : []
      );
      const findings = parseFindings(result?.result ?? '');
      const scannerIds = new Set(
        uses.filter((u) => u.name === 'Bash' && String(u.input.command).includes('scan.mjs')).map((u) => u.id)
      );
      // A blocked command still appears as a tool call, so count only a successful result.
      const scannerRan = events.some((event) =>
        event.type === 'user' && Array.isArray(event.message?.content) &&
        event.message.content.some((c) =>
          c.type === 'tool_result' && scannerIds.has(c.tool_use_id) && !c.is_error &&
          /suspects\. Trace|Output too large/.test(JSON.stringify(c.content))
        )
      );
      const row = {
        id, arm, name, run, exit: code,
        status: result?.subtype ?? 'no_result',
        cost_usd: result?.total_cost_usd ?? null,
        seconds: Math.round((Date.now() - started) / 1000),
        turns: result?.num_turns ?? null,
        // A skill-arm run that never loaded the skill must not count as a skill result.
        used_skill: uses.some((u) => u.name === 'Skill' && JSON.stringify(u.input).includes('citation-needed')),
        ran_scanner: scannerRan,
        parsed: findings !== null,
        ...(findings ? score(source, seeds, findings) : {}),
      };
      console.log(JSON.stringify(row));
      rmSync(work, { recursive: true, force: true });
      done(row);
    });
  });
}

const seedFile = opts.seeds ?? join(here, 'seeds.json');
const targets = Object.entries(JSON.parse(readFileSync(seedFile, 'utf8'))).map(([name, seeds]) => ({
  name, seeds, source: opts.target ? resolve(opts.target) : join(here, 'fixtures', name),
}));

mkdirSync(opts.out, { recursive: true });
const queue = [];
for (const target of targets) {
  for (let run = 1; run <= Number(opts.runs); run++) {
    for (const arm of ['baseline', 'skill']) queue.push({ arm, run, ...target });
  }
}

const rows = [];
await Promise.all(
  Array.from({ length: Number(opts.jobs) }, async () => {
    while (queue.length) rows.push(await runOnce(queue.shift()));
  })
);

const SUM = ['fake_seeds', 'fake_caught', 'pattern_seeds', 'pattern_caught', 'semantic_seeds', 'semantic_caught',
  'clean_decoys', 'false_alarms', 'findings', 'other_findings', 'cost_usd', 'seconds'];
const arms = {};
for (const arm of ['baseline', 'skill']) {
  const mine = rows.filter((row) => row.arm === arm);
  const total = {
    runs: mine.length,
    parsed: mine.filter((row) => row.parsed).length,
    used_skill: mine.filter((row) => row.used_skill).length,
    ran_scanner: mine.filter((row) => row.ran_scanner).length,
  };
  for (const key of SUM) {
    total[key] = Math.round(mine.reduce((sum, row) => sum + (row[key] ?? 0), 0) * 100) / 100;
  }
  arms[arm] = total;
}
writeFileSync(join(opts.out, 'summary.json'), `${JSON.stringify({ model: opts.model, arms, rows }, null, 2)}\n`);
console.table(arms);
