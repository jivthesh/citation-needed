import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scan, scanText } from '../skills/citation-needed/scripts/scan.mjs';

const rules = (text) => scanText(text).map((f) => f.rule);

test('flags invented fallbacks but not neutral defaults', () => {
  assert.deepEqual(rules('const r = product.rating ?? 4.8;'), ['fallback-number']);
  assert.deepEqual(rules('const r = product.rating ?? 0;'), []);
  assert.deepEqual(rules('const p = query.page ?? 1;'), []);
  assert.deepEqual(rules("const s = user.status ?? 'verified';"), ['fallback-status']);
  assert.deepEqual(rules("const s = user.status ?? 'unknown';"), []);
});

test('flags swallowed errors but not handled ones', () => {
  assert.deepEqual(rules('pay().catch(() => {});'), ['silent-catch']);
  assert.deepEqual(rules('try { a() } catch (e) {}'), ['silent-catch']);
  assert.deepEqual(rules('try:\n    a()\nexcept Exception:\n    pass\n'), ['silent-catch']);
  assert.deepEqual(rules('pay().catch((e) => { log(e); throw e; });'), []);
});

test('flags a stub but not success after real work', () => {
  assert.deepEqual(rules('function send() { return { success: true }; }'), ['stub-success']);
  assert.deepEqual(rules('function send() { await post(); return { success: true }; }'), []);
});

test('ignores random ids and variable backoff', () => {
  assert.deepEqual(rules('const id = Math.random().toString(36);'), []);
  assert.deepEqual(rules('await new Promise((r) => setTimeout(r, delayMs));'), []);
  assert.deepEqual(rules('await new Promise((r) => setTimeout(r, 800));'), ['simulated-latency']);
});

test('flags marketing stats but not ordinary counts or form hints', () => {
  assert.deepEqual(rules('<h1>10,000+ happy customers</h1>'), ['invented-stat']);
  assert.deepEqual(rules('<p>Rated 4.9 stars</p>'), ['invented-stat']);
  assert.deepEqual(rules('You can add up to 3 trusted contacts'), []);
  assert.deepEqual(rules("if (filter === '5star') return;"), []);
  assert.deepEqual(rules('<Input placeholder="e.g. John Doe" />'), []);
  assert.deepEqual(rules("name ?? 'John Doe'"), ['placeholder-identity']);
});

test('reports the first line of a multi-line match', () => {
  const found = scanText('import os\n\n\ndef send(order):\n    return True\n');
  assert.equal(found[0].rule, 'stub-success');
  assert.equal(found[0].line, 4);
});

test('reports the line of a match and skips tests and node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'citation-needed-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  const fake = 'const r = x.rating ?? 4.8;';
  writeFileSync(join(root, 'src/a.ts'), `\n\n${fake}\n`);
  writeFileSync(join(root, 'src/a.test.ts'), fake);
  writeFileSync(join(root, 'node_modules/b.ts'), fake);
  const found = scan(root);
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'src/a.ts');
  assert.equal(found[0].line, 3);
});
