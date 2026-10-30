---
name: citation-needed
description: Audits code for things a coding agent made up or never finished, such as invented ratings and stats, fallback values shown as real data, mock data in production paths, swallowed errors, stubbed success responses, and unreachable features. Use when the user asks to audit agent-written code, check whether work is really done, find fake or placeholder data, or review a change before launch.
---

# citation-needed

Treat every value a user can see, and every claim that work is done, as a Wikipedia edit: no source, no entry.

## Audit

1. Set the scope: the path the user named, otherwise the current diff, otherwise the repo.
2. Run the scanner as a single command, using the full path to this skill's directory. Do not `cd` first or chain commands, because that can trigger a permission block.

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" <path>
   ```

   If `${CLAUDE_SKILL_DIR}` was not filled in, replace it with this skill's directory.

   If the scanner still cannot run, tell the user and try the exact command again before reading any code. If it stays blocked, say the audit is partial.

   It prints suspects, not verdicts. Regex cannot see meaning, so never stop at its output.

3. Trace every `high` suspect to where the value comes from: database, API, config, or nowhere. Do not sample. Start with money, status, and success messages. If you run out of room, say how many you did not trace.
4. Then look for what the scanner cannot see:
   - Hardcoded arrays of people, testimonials, or metrics.
   - Screens or routes nothing links to.
   - Buttons whose handler does nothing.
   - Comments or docs that claim a check the code does not do.
   - Tests that assert on mocks instead of behaviour.
   - Claims in the conversation that something works, with no command output behind them.
5. Report using the format below.

## Verdicts

- **SOURCED**: traced to a real source. Leave it out of the report and count it.
- **FABRICATED**: invented value shown as real.
- **UNSOURCED**: looks real, but you could not find where it comes from.
- **DEAD**: built, but no path reaches it.
- **UNPROVEN**: claimed to work, with no test or run behind it.

## Report

One row per finding, worst first. Quote the evidence.

```
[citation needed] src/ProductCard.tsx:7  FABRICATED
  `product.rating ?? 4.8` shows 4.8 stars on any product without reviews.
  Trace: rating is optional in the API, so the fallback is live.
  Fix: hide the rating when it is missing.
```

End with counts per verdict and how many suspects turned out SOURCED.

## Fix rules

- Do not change code during an audit unless the user asks.
- Never replace one invented value with another.
- Missing data gets an empty state, an error, or a wired-up source.
- Mark a finding fixed only after running something that proves it.
- If nothing is wrong, say so. Do not pad the report.
