/** Offline integration check using the exact vendored opentype.js browser module. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as opentype from '../../src/assets/opentype/dist/opentype.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const resolveLocal = relative => {
  const absolute = path.resolve(root, relative);
  const real = fs.realpathSync(absolute);
  const rel = path.relative(fs.realpathSync(root), real);
  assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `Path escapes repo: ${relative}`);
  return real;
};
const read = relative => fs.readFileSync(resolveLocal(relative));
const json = relative => JSON.parse(read(relative).toString('utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const lock = json('src/assets/assets-lock.json');
const locked = new Map(lock.files.map(record => [record.path, record]));
assert.equal(locked.size, lock.files.length, 'Duplicate asset paths');
for (const record of lock.files) {
  const bytes = read(record.path);
  assert.equal(bytes.length, record.bytes, `${record.path}: size`);
  assert.equal(sha256(bytes), record.sha256, `${record.path}: hash`);
}
const checkPath = (glyphPath, label, allowEmpty = false) => {
  let open = false;
  let closed = 0;
  let start;
  let endpoint;
  const closeGeometricContour = () => {
    assert(endpoint && start && Math.abs(endpoint.x - start.x) < 1e-7 &&
      Math.abs(endpoint.y - start.y) < 1e-7, `${label}: geometrically open contour`);
    open = false;
    closed++;
  };
  for (const command of glyphPath.commands) {
    assert(['M', 'L', 'Q', 'C', 'Z'].includes(command.type), `${label}: unknown command`);
    for (const [key, value] of Object.entries(command)) {
      if (key !== 'type') assert(Number.isFinite(value), `${label}: invalid ${key}`);
    }
    if (command.type === 'M') {
      // opentype.js 2.0.0 omits Z for filled paths, but the final point must
      // still equal the initial point. Do not accept an arbitrary open path.
      if (open) closeGeometricContour();
      open = true;
      start = command;
    } else if (command.type === 'Z') {
      assert(open, `${label}: closing absent contour`);
      open = false;
      closed++;
    } else {
      assert(open, `${label}: drawing without a contour`);
    }
    if (command.type !== 'Z') endpoint = command;
  }
  if (open) closeGeometricContour();
  assert(allowEmpty || closed > 0, `${label}: no usable contours`);
  return closed;
};
const fontCatalogs = [
  ['fonts', json('src/assets/fonts/fonts-cat.json')],
  ['emoji', json('src/assets/emoji/fonts-cat.json')],
];
const allIds = new Set();
const parsedFonts = new Map();
const fontResults = [];
const shapeSamples = new Map(json('docs/assets/shaping-samples.json').samples.map(sample => [sample.fontId, sample]));
for (const [folder, entries] of fontCatalogs) {
  const seenPaths = new Set();
  for (const entry of entries) {
    assert(/^[a-z][a-z0-9-]*$/.test(entry.id), 'Invalid font ID');
    assert(!allIds.has(entry.id), 'Duplicate font ID');
    allIds.add(entry.id);
    assert(entry.name && entry.family && ['normal', 'italic'].includes(entry.style));
    assert.equal(entry.file, path.posix.basename(entry.path));
    assert(!entry.path.startsWith('/') && !entry.path.split('/').includes('..'));
    assert(!seenPaths.has(entry.path), 'Duplicate catalog path');
    seenPaths.add(entry.path);
    const relative = `src/assets/${folder}/${entry.path}`;
    const source = locked.get(relative);
    assert(source && source.role === 'font', 'Font is not locked');
    assert.equal(entry.sha256, source.sha256);
    assert.equal(entry.bytes, source.bytes);
    assert.equal(entry.source.url, source.url);
    assert.equal(entry.source.commit, lock.googleFonts.commit);
    assert.equal(entry.source.modified, false);
    assert.equal(entry.style, source.style ?? 'normal');
    assert.equal(entry.license.spdx, 'OFL-1.1');
    assert(read(`src/assets/${folder}/${entry.license.path}`).includes(Buffer.from('SIL OPEN FONT LICENSE')));
    const bytes = read(relative);
    const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    parsedFonts.set(entry.id, font);
    assert.equal(font.glyphs.length, entry.glyphCount, `${entry.id}: glyph count`);
    assert.equal(font.unitsPerEm, entry.unitsPerEm);
    assert.equal(Boolean(font.tables.fvar), entry.variable);
    if (entry.variable) {
      assert.equal(font.tables.fvar.axes.length, Object.keys(entry.axes).length);
      for (const axis of font.tables.fvar.axes) {
        assert.deepEqual(entry.axes[axis.tag], {min: axis.minValue, default: axis.defaultValue, max: axis.maxValue});
        const coordinate = entry.defaultVariation[axis.tag];
        assert(coordinate >= axis.minValue && coordinate <= axis.maxValue);
      }
      font.variation.set(entry.defaultVariation);
    }
    let nonemptyGlyphs = 0;
    for (let i = 0; i < font.glyphs.length; i++) {
      const glyph = font.glyphs.get(i);
      checkPath(glyph.path, `${entry.id}/${i}/raw`, true);
      const outline = glyph.getPath(0, 0, font.unitsPerEm,
        {hinting: false, variation: entry.defaultVariation}, font);
      if (checkPath(outline, `${entry.id}/${i}`, true)) nonemptyGlyphs++;
    }
    const sample = folder === 'emoji' ? '😀' : entry.sampleText;
    let directTextShaping;
    try {
      checkPath(font.getPath(sample, 0, 0, 100, {hinting: false, variation: entry.defaultVariation}), entry.id);
      directTextShaping = {status: 'sample-renders'};
    } catch (error) {
      if (!error.message.includes('not yet supported')) throw error;
      directTextShaping = {status: 'requires-external-shaper', reason: error.message};
    }
    if (folder === 'fonts') {
      const shaped = shapeSamples.get(entry.id);
      assert(shaped, `${entry.id}: missing reference shaping sample`);
      assert.equal(shaped.fontSha256, entry.sha256);
      assert.deepEqual(shaped.variation, entry.defaultVariation);
      const shapedPath = new opentype.Path();
      let cursorX = 0;
      let cursorY = 0;
      for (const glyph of shaped.glyphs) {
        assert(glyph.glyphId > 0 && glyph.glyphId < font.glyphs.length);
        shapedPath.extend(font.glyphs.get(glyph.glyphId).getPath(cursorX + glyph.xOffset,
          -cursorY - glyph.yOffset, font.unitsPerEm,
          {hinting: false, variation: entry.defaultVariation}, font));
        cursorX += glyph.xAdvance;
        cursorY += glyph.yAdvance;
      }
      checkPath(shapedPath, `${entry.id}/harfbuzz-sample`);
    }
    if (folder === 'fonts' && entry.coverage.vietnamese) {
      assert.equal(entry.coverage.missingVietnamese.length, 0);
      for (const char of 'ĐđẮắẰằỄễỘộỚớỰựỸỹ') {
        assert(font.charToGlyphIndex(char) > 0, `${entry.id}: missing Vietnamese ${char}`);
        checkPath(font.charToGlyph(char).getPath(0, 0, 100, {variation: entry.defaultVariation}, font), entry.id);
      }
    }
    let variationSamples = 0;
    const signatures = new Set();
    if (entry.variable) {
      const coordinates = [entry.defaultVariation];
      for (const [tag, axis] of Object.entries(entry.axes)) {
        coordinates.push({...entry.defaultVariation, [tag]: axis.min}, {...entry.defaultVariation, [tag]: axis.max});
      }
      coordinates.push(Object.fromEntries(Object.entries(entry.axes).map(([tag, a]) => [tag, a.min])),
        Object.fromEntries(Object.entries(entry.axes).map(([tag, a]) => [tag, a.max])));
      for (const variation of coordinates) {
        // Vary actual glyph geometry independently of the incomplete JS shaper.
        const outline = new opentype.Path();
        for (const char of sample) {
          outline.extend(font.charToGlyph(char).getPath(0, 0, 100, {hinting: false, variation}, font));
        }
        checkPath(outline, `${entry.id}/variation`);
        signatures.add(sha256(JSON.stringify(outline.commands)));
        variationSamples++;
      }
      assert(signatures.size > 1, `${entry.id}: variations have no effect`);
    }
    fontResults.push({id: entry.id, glyphsChecked: font.glyphs.length, nonemptyGlyphs, variationSamples, directTextShaping});
  }
}
assert.equal(allIds.size, lock.files.filter(record => record.role === 'font').length);
const emoji = json('src/assets/emoji/emoji-cat.json');
const emojiFont = parsedFonts.get(emoji.fontId);
const emojiEntry = fontCatalogs[1][1].find(entry => entry.id === emoji.fontId);
assert(emojiFont && emojiEntry);
assert.equal(emoji.fontSha256, emojiEntry.sha256);
assert.equal(emoji.unicodeVersion, lock.unicode.version);
assert.equal(emoji.count, emoji.items.length);
assert.equal(emoji.qualification, 'fully-qualified');
assert.equal(new Set(emoji.items.map(entry => entry.id)).size, emoji.items.length);
const groupCounts = new Map();
for (const entry of emoji.items) {
  assert.equal(entry.emoji, String.fromCodePoint(...entry.codepoints.map(cp => Number.parseInt(cp, 16))));
  assert.equal(entry.id, entry.codepoints.map(cp => cp.toLowerCase()).join('-'));
  assert(entry.name && entry.group && entry.subgroup);
  assert(Number.isInteger(entry.glyphId) && entry.glyphId > 0 && entry.glyphId < emojiFont.glyphs.length);
  // Use the HarfBuzz-resolved glyph ID, preserving ZWJ/flag/modifier shaping.
  const glyph = emojiFont.glyphs.get(entry.glyphId);
  checkPath(glyph.getPath(0, 0, 100, {hinting: false, variation: {wght: 400}}, emojiFont), entry.id);
  groupCounts.set(entry.group, (groupCounts.get(entry.group) || 0) + 1);
}
assert.equal(emoji.groups.length, groupCounts.size);
for (const group of emoji.groups) assert.equal(group.count, groupCounts.get(group.name));
for (const example of ['😀', '❤️', '🇻🇳', '1️⃣', '👍🏽', '👨‍👩‍👧‍👦']) {
  assert(emoji.items.some(item => item.emoji === example), `Missing sequence ${example}`);
}
const excluded = json('docs/assets/emoji-excluded.json');
assert.equal(emoji.excludedCount, excluded.items.length);
assert.equal(excluded.count, excluded.items.length);
assert.equal(excluded.fontSha256, emoji.fontSha256);
const visibleEmojiIds = new Set(emoji.items.map(item => item.id));
assert(excluded.items.every(item => !visibleEmojiIds.has(item.id)), 'Excluded emoji present in picker');
const require = createRequire(import.meta.url);
const umd = require('../../src/assets/opentype/dist/opentype.js');
assert.equal(typeof umd.parse, 'function', 'CommonJS/UMD entry missing');
const summary = {status: 'outline-extraction-pass', opentypeVersion: lock.opentype.version,
  originalAssetsHashed: lock.files.length, fonts: fontResults,
  emojiPathsChecked: emoji.items.length, emojiExcluded: excluded.count,
  filledPathsMayOmitZ: true, contourClosureCheckedBy: 'Z or coincident start/end',
  externalTextShapingRequired: fontResults.filter(result => result.directTextShaping.status === 'requires-external-shaper').map(result => result.id),
  meshValidated: false};
if (process.argv.length > 2) {
  assert.equal(process.argv[2], '--report', 'Usage: node tools/assets/verify-assets.mjs [--report repo/path.json]');
  assert.equal(process.argv.length, 4);
  const target = path.resolve(root, process.argv[3]);
  const parent = resolveLocal(path.relative(root, path.dirname(target)));
  const output = path.join(parent, path.basename(target));
  if (fs.existsSync(output)) resolveLocal(path.relative(root, output));
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', 'utf8');
} else {
  assert.deepEqual(json('docs/assets/opentype-audit.json'), summary, 'Stale opentype audit');
}
console.log(`PASS: ${lock.files.length} original assets, ${allIds.size} fonts, ${emoji.items.length} emoji paths; ${excluded.count} unsupported emoji excluded.`);
console.log(`Direct getPath needs external text shaping for: ${summary.externalTextShapingRequired.join(', ') || 'none in tested samples'}.`);
