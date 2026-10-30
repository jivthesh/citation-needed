import { readFileSync } from 'node:fs';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: readFileSync(new URL('rules.md', import.meta.url), 'utf8'),
  },
}));
