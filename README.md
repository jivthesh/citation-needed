# citation-needed

**Your agent says it's done. [citation needed]**

Coding agents don't only write bugs. They fill gaps with things that look real: a 4.8 rating nobody gave, a `catch {}` that turns a failed payment into a success, a screen nothing links to. Tests pass and the demo looks great.

`citation-needed` treats every value a user can see, and every claim of "done", as a Wikipedia edit: no source, no entry.

```tsx
const rating = product.rating ?? 4.8;
```

```
[citation needed] src/ProductCard.tsx:4  FABRICATED
  `product.rating ?? 4.8` shows 4.8 stars on any product without reviews.
  Fix: hide the rating when it is missing.
```

## Install

Always on in Claude Code (recommended):

```
/plugin marketplace add jivthesh/citation-needed
/plugin install citation-needed@citation-needed
```

Any agent, on demand:

```bash
npx skills add jivthesh/citation-needed
```

Then ask your agent to run `citation-needed` on a path or diff.

A skill on its own may never trigger. The plugin uses a `SessionStart` hook, so the rules are loaded in every session.

## What it does

- **While the agent works:** a short ruleset tells it not to invent data, and to write `[citation needed]` next to anything it can't source.
- **When you ask for an audit:** a zero-dependency scanner finds suspects. The agent then traces each one and gives a verdict: `FABRICATED`, `UNSOURCED`, `DEAD`, or `UNPROVEN`.

| Scanner rule | Example |
| ---------------------- | ----------------------------------- |
| `fallback-number` | `total \|\| 48200` |
| `fallback-status` | `status ?? 'verified'` |
| `placeholder-identity` | `name ?? 'Jane Doe'` |
| `invented-stat` | `10,000+ happy customers` |
| `random-data` | `stock = Math.random() * 5` |
| `simulated-latency` | `setTimeout(resolve, 800)` as a save |
| `mock-in-prod` | `import { x } from '../mockProducts'` |
| `silent-catch` | `.catch(() => {})`, `except: pass` |
| `stub-success` | `{ return { success: true }; }` |
| `admitted-fake` | `// hardcoded for now` |
| `hardcoded-flag` | `verified: true` |

Run the scanner by itself:

```bash
node skills/citation-needed/scripts/scan.mjs ./src
```

It covers JS, TS, Vue, Svelte, and Python. It skips tests, dot-folders, and build output.

## Benchmark

Each test ran Claude Sonnet headless with the same prompt, with and without this plugin, and with no other plugins or hooks loaded. Raw totals are in [`benchmark/results`](benchmark/results).

**Short version:** on small apps it adds little, because a plain agent already finds most fakes. On one large real app it caught 37 known bugs where a plain agent caught 5, though the answer key favours the skill.

### Large private app (1 app, 8 runs per arm)

About 1,400 TypeScript files and 364,000 lines. The answer key is 9 confirmed bug groups, so 8 runs give 72 chances. Code and bug details stay private.

| | Plain agent | With citation-needed |
| ----------------------- | ------------ | -------------------- |
| Known bugs caught | 5 of 72 | 37 of 72 |
| Caught per run, out of 9 | 0, 0, 1, 0, 1, 0, 2, 1 | 4, 1, 7, 5, 2, 5, 6, 7 |
| Total findings | 147 | 231 |
| Total cost | $2.06 | $1.46 |

### Small synthetic apps (3 apps, 9 runs per arm)

| | Plain agent | With citation-needed |
| ------------------------- | ------------ | -------------------- |
| Planted fakes caught | 63 of 69 | 66 of 69 |
| Clean decoys wrongly flagged | 6 of 27 | 4 of 27 |
| Total cost | $0.48 | $0.66 |

### Prevention (3 tempting build tasks, 9 runs per arm)

| | Plain agent | With the hook |
| ----------------------------- | ----------- | ------------- |
| Runs with scanner suspects | 4 of 9 | 2 of 9 |
| Scanner suspects in new code | 7 | 2 |
| Replies using `[citation needed]` | 0 of 9 | 9 of 9 |

### Scanner alone

| | Result |
| ------------------------- | ------- |
| Pattern fakes caught | 19 of 19 |
| Clean decoys wrongly flagged | 0 of 9 |
| Meaning-based fakes caught | 0 of 4 |

### Read this with care

- **The large-app answer key is biased.** Its bugs were found using this scanner plus manual tracing, which favours the skill. The app, its answer key, and the skill have one author.
- **One app is a small sample.** Skill runs ranged from 1 to 7 of 9, so don't read 37 vs 5 as a precise ratio.
- **Only known bugs are scored.** The extra findings on the large app were not reviewed, so some may be false alarms.
- **The skill was changed twice after testing.** It now says to trace every `high` suspect, and to run the scanner as one command, because `cd` plus `node` was blocked in some runs. Earlier rounds, including ones that caught 0 of 9, are not in these tables.
- **The scorer was changed after testing.** It now accepts paths relative to `src/`, for both arms. Saved findings were rescored, and no run was repeated for this.
- **Long scanner output is a known limit.** On the large app the output was 36.7 KB, so the agent got a short preview and a saved file. Some runs may not have read all of it.
- **The synthetic apps are not independent.** The same person wrote the fixtures and the rules. The scanner table reflects rules tuned against those fixtures.
- **Prevention is weak evidence.** The plain model rarely invented data here, and the scanner only sees part of what could be fake. Most suspects came from one task about a backend that wasn't ready.
- **The scanner is noisy on real code.** It lists suspects, many of them legitimate defaults, which is why the agent has to trace them.

Reproduce the public tests. `--out` must be outside this repo:

```bash
npm run benchmark
npm run benchmark:agent -- --out /tmp/cn-demo
npm run benchmark:prevent -- --out /tmp/cn-prevent
```

## License

MIT
