/** Actual JavaScript/WASM shaping, closed outlines and complete color-paint extraction. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createFontSource, createEmojiLookup} from '../../src/input/font-source.mjs';
import {versionString} from '../../src/assets/harfbuzz/dist/index.mjs';

const root = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const local = relative => {
  const target = path.resolve(root, relative);
  const existing = fs.existsSync(target) ? target : path.dirname(target);
  const rel = path.relative(root, fs.realpathSync(existing));
  assert(!rel.startsWith('..') && !path.isAbsolute(rel), `Path escapes project: ${relative}`);
  return target;
};
const read = relative => fs.readFileSync(local(relative));
const json = relative => JSON.parse(read(relative));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hbLock = json('src/assets/harfbuzz/assets-lock.json');
for (const record of hbLock.files) {
  const bytes = read('src/assets/harfbuzz/' + record.path);
  assert.equal(bytes.length, record.bytes);
  assert.equal(sha256(bytes), record.sha256);
}
const textFonts = json('src/assets/fonts/fonts-cat.json');
const families = json('src/assets/fonts/families-cat.json');
assert.equal(families.count, 30);
assert.equal(new Set(families.families.flatMap(f => f.fontIds)).size, textFonts.length);
for (const family of families.families) {
  assert(family.fontIds.includes(family.defaultFontId));
  assert(family.fontIds.every(id => textFonts.some(f => f.id === id && f.family === family.name)));
}
// Independent coverage check against each original upstream METADATA, not the generated lock count.
for (const family of families.families) {
  const metadata = read(`src/assets/fonts/upstream/${family.id}/METADATA.pb`).toString('utf8');
  const filenames = [...metadata.matchAll(/^\s*filename: "([^"]+)"/gm)].map(m => m[1]).sort();
  const actual = textFonts.filter(f => f.family === family.name).map(f => f.source.filename).sort();
  assert.deepEqual(actual, filenames, `${family.name}: incomplete official styles`);
}
const reference = json('docs/assets/shaping-samples.json');
assert.equal(reference.shaper.version, versionString());
const viUpper = 'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ';
const alphabet = [...new Set(viUpper + viUpper.toLowerCase() + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')];
let variationRuns = 0;
let vietnameseOutlines = 0;
const summarized = run => run.glyphs.map(({glyphId, xAdvance, yAdvance, xOffset, yOffset}) =>
  ({glyphId, xAdvance, yAdvance, xOffset, yOffset}));
for (const entry of textFonts) {
  const source = await createFontSource(read('src/assets/fonts/' + entry.path), entry);
  const sample = reference.samples.find(s => s.fontId === entry.id);
  const run = source.shapeRun(sample.text);
  assert.deepEqual(summarized(run), sample.glyphs, `${entry.id}: native HarfBuzz reference mismatch`);
  assert.deepEqual(source.shapeRun(sample.text.normalize('NFD')).glyphs, run.glyphs, `${entry.id}: decomposed Vietnamese`);
  for (const letter of alphabet) {
    assert(source.shapeRun(letter).glyphs.some(g => g.outline.length), `${entry.id}: blank Vietnamese letter ${letter}`);
    vietnameseOutlines++;
  }
  let corners = [{}];
  for (const [tag, axis] of Object.entries(entry.axes)) {
    corners = corners.flatMap(corner => [axis.min, axis.max].map(value => ({...corner, [tag]: value})));
  }
  if (entry.variable) {
    for (const variations of corners) {
      assert(source.shapeRun(sample.text, {variations}).glyphs.some(g => g.outline.length));
      variationRuns++;
    }
    const [tag, axis] = Object.entries(entry.axes)[0];
    assert.throws(() => source.shapeRun('A', {variations: {[tag]: axis.max + 1}}), /Invalid variation/);
  }
  assert.throws(() => source.shapeRun('\u{10ffff}'), /Missing glyph/);
  assert.throws(() => source.shapeRun('\ud800'), /surrogate/);
  assert.throws(() => source.shapeRun('a\nb'), /itemized/);
  assert.throws(() => source.colorPaint(1), /COLRv1/);
}
await assert.rejects(createFontSource(read('src/assets/fonts/' + textFonts[0].path),
  {...textFonts[0], sha256: '0'.repeat(64)}), /integrity/);
const colorBase = 'src/assets/emoji/color/';
const colorFonts = json(colorBase + 'fonts-cat.json');
const color = json(colorBase + 'emoji-cat.json');
const aliases = json(colorBase + 'input-aliases.json');
const components = json(colorBase + 'components-cat.json');
const corpus = [...color.items, ...aliases.items, ...components.items];
assert.equal(corpus.length, 5225);
const lookup = createEmojiLookup(color, aliases, components);
assert.equal(lookup('❤').canonicalText, '❤️');
assert.equal(lookup('❤\ufe0e'), null, 'Explicit text presentation must not be rewritten as emoji');
assert.equal(lookup('text 😀'), null, 'Token lookup must not alter arbitrary text');
for (const item of corpus) assert(lookup(item.emoji), `Missing input token ${item.id}`);
let colorShaped = 0, colorPaints = 0, bitmapImages = 0, monoShaped = 0;
const operations = {};
for (const id of ['noto-colrv1', 'notocoloremoji']) {
  const entry = colorFonts.find(f => f.id === id);
  assert.equal(color.fontHashes[id], entry.sha256);
  const source = await createFontSource(read(colorBase + entry.path), entry);
  for (const item of corpus) {
    const run = source.shapeRun(item.emoji, {language: 'und'});
    assert(run.glyphs.some(g => g.glyphId === item.glyphs[id]), `${id}/${item.id}: wrong shaped color glyph`);
    assert(run.glyphs.filter(g => g.xAdvance || g.yAdvance).every(g => g.glyphId === item.glyphs[id]), 'Advancing emoji leftovers');
    assert(run.glyphs.every(g => !('outline' in g)), 'Color base glyph must not masquerade as monochrome geometry');
    colorShaped++;
  }
  for (const item of [...color.items, ...components.items]) {
    if (id === 'noto-colrv1') {
      const paint = source.colorPaint(item.glyphs[id]);
      for (const op of paint.operations) operations[op.op] = (operations[op.op] ?? 0) + 1;
      assert(paint.operations.some(op => op.op === 'pushClipOutline' && op.outline.length), `${item.id}: no color outline`);
      colorPaints++;
    } else {
      const bitmap = source.bitmap(item.glyphs[id]);
      assert.deepEqual([...bitmap.bytes.slice(0, 8)], [137,80,78,71,13,10,26,10]);
      bitmapImages++;
    }
  }
  const two = source.shapeRun('😀😀', {language: 'und'});
  assert.deepEqual(two.glyphs.map(g => g.cluster), [0, 2]);
  assert.equal(two.clusterUnit, 'utf16-code-unit');
  console.log(`Checked ${id}: ${corpus.length} input spellings and ${color.count + components.count} paint/image sources`);
}
const mono = json('src/assets/emoji/emoji-cat.json');
const [monoFont] = json('src/assets/emoji/fonts-cat.json');
const monoSource = await createFontSource(read('src/assets/emoji/' + monoFont.path), monoFont);
for (const item of mono.items) {
  const run = monoSource.shapeRun(item.emoji, {language: 'und'});
  const visible = run.glyphs.filter(g => g.outline.length);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].glyphId, item.glyphId);
  monoShaped++;
}
const report = {schemaVersion: 1, status: 'pass', harfbuzzjs: hbLock.version, harfbuzz: versionString(),
  vendorFilesHashed: hbLock.files.length, textFamilies: families.count, textFonts: textFonts.length,
  officialFamilyStylesComplete: true, nativeReferenceRunsMatched: textFonts.length,
  decomposedVietnameseRunsMatched: textFonts.length, vietnameseLetterOutlines: vietnameseOutlines,
  variationCornerRuns: variationRuns, colorInputRuns: colorShaped, colorPaints, bitmapImages,
  monoInputRuns: monoShaped, emojiInputForms: corpus.length,
  colorPaintOperationCounts: Object.fromEntries(Object.entries(operations).sort()),
  negativeChecks: ['wrong font hash', 'missing glyph', 'unpaired surrogate', 'multiline run',
    'out of range axis', 'monochrome as color', 'text-selector preservation', 'UTF-16 cluster offsets'],
  sourceModuleSha256: sha256(read('src/input/font-source.mjs')), meshValidated: false,
  scope: 'Vendored JS/WASM with native HarfBuzz reference comparison, closed source curves and color paint extraction. This audit does not qualify browser UI, color rasterization or mesh export.'};
const target = local('docs/assets/input-runtime-audit.json');
const serialized = JSON.stringify(report, null, 2) + '\n';
if (process.argv.includes('--write')) fs.writeFileSync(target, serialized);
else assert.equal(fs.readFileSync(target, 'utf8'), serialized, 'Stale input runtime audit');
console.log(JSON.stringify(report));
