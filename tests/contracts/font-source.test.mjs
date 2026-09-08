import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFontSource } from '../../src/input/font-source.mjs';

const catalogUrl = new URL('../../src/assets/fonts/fonts-cat.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const originalEntry = catalog.find(entry => entry.id === 'inter');
assert.ok(originalEntry, 'Fixture refers to the catalog stable ID, not a system font');
const bytes = () => new Uint8Array(readFileSync(new URL(originalEntry.path, catalogUrl)));

// SRC-04 / VEC-01: caller mutations must not alter an accepted source or its identity.
test('accepted source owns bytes and catalog even when callers mutate both', async () => {
  const input = bytes();
  const entry = structuredClone(originalEntry);
  const source = await createFontSource(input, entry);
  const before = source.shapeRun('Tiếng Việt');
  input.fill(0);
  entry.id = 'changed-by-caller';
  entry.defaultVariation.wght = 999999;
  assert.deepEqual(source.shapeRun('Tiếng Việt'), before);
  assert.equal(source.metadata.id, originalEntry.id);
});

// DAT-01/SRC-04: a typed-array view must identify its own bytes, not its backing allocation.
test('a font byte view with an offset is accepted without reading adjacent garbage', async () => {
  const file = bytes();
  const padded = new Uint8Array(file.length + 32).fill(0xa5);
  padded.set(file, 16);
  const source = await createFontSource(padded.subarray(16, 16 + file.length), originalEntry);
  const plain = await createFontSource(file, originalEntry);
  assert.deepEqual(source.shapeRun('Đặng'), plain.shapeRun('Đặng'));
});

// SRC-04: keep original user text while shaping the canonical run; do not conflate the two.
test('normalization preserves original text and stable glyph placement', async () => {
  const source = await createFontSource(bytes(), originalEntry);
  const input = 'Tiếng Việt'.normalize('NFD');
  const run = source.shapeRun(input);
  assert.equal(run.originalText, input);
  assert.equal(run.text, input.normalize('NFC'));
  assert.deepEqual(run.glyphs, source.shapeRun('Tiếng Việt').glyphs);
  assert.ok(run.glyphs.every(g => Number.isInteger(g.cluster) && g.cluster >= 0 && g.cluster < run.text.length));
});
