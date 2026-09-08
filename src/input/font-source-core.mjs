/** Verified font input for one script/direction run; coordinates stay in font units, Y up.
 * This module extracts source geometry/paint instructions. It does not create a mesh.
 */
// HarfBuzz namespace is injected; importing this module creates no WASM instance.

const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const finite = values => requireValue(values.every(Number.isFinite), 'Nonfinite geometry/position');
const copy = value => structuredClone(value);

function closedOutline(font, glyphId) {
  const commands = font.glyphToJson(glyphId);
  let open = false;
  const arity = {M: 2, L: 2, Q: 4, C: 6, Z: 0};
  for (const command of commands) {
    requireValue(command.type in arity && command.values.length === arity[command.type], 'Invalid outline command');
    finite(command.values);
    if (command.type === 'M') {
      requireValue(!open, 'Unclosed contour');
      open = true;
    } else {
      requireValue(open, 'Contour command without move');
      if (command.type === 'Z') open = false;
    }
  }
  requireValue(!open, 'Unclosed contour');
  return commands;
}

export async function createFontSourceWithHarfBuzz(inputBytes, catalogEntry, hb) {
  // Own the bytes so a caller cannot change a font after its hash was verified.
  const bytes = inputBytes instanceof ArrayBuffer ? new Uint8Array(inputBytes.slice(0)) : Uint8Array.from(inputBytes);
  const entry = copy(catalogEntry);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  requireValue(hash === entry.sha256 && bytes.length === entry.bytes, `Font integrity mismatch: ${entry.id}`);
  const blob = new hb.Blob(bytes);
  const face = new hb.Face(blob);
  requireValue(face.upem === entry.unitsPerEm, 'Font scale does not match catalog');
  const axes = face.getAxisInfos();
  const metadata = Object.freeze({id: entry.id, sha256: hash, unitsPerEm: face.upem,
    coordinates: 'font-units-y-up', shaper: `HarfBuzz ${hb.versionString()}`});

  function prepare(variation = {}) {
    const values = {...entry.defaultVariation, ...variation};
    for (const [tag, value] of Object.entries(values)) {
      const axis = axes[tag];
      requireValue(axis && Number.isFinite(value) && value >= axis.min && value <= axis.max,
        `Invalid variation ${tag}=${value}`);
    }
    for (const [tag, axis] of Object.entries(axes)) values[tag] ??= axis.default;
    const font = new hb.Font(face);
    font.setScale(face.upem, face.upem);
    font.setVariations(Object.entries(values).map(([tag, value]) => new hb.Variation(tag, value)));
    return {font, values};
  }

  function shapeRun(originalText, {language = 'vi', script, direction = 'ltr', variations} = {}) {
    requireValue(typeof originalText === 'string', 'Text must be a string');
    // Multiline layout, tabs and Unicode bidi itemization belong to the application.
    requireValue(!/[\r\n\t\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(originalText),
      'Pass one already itemized text run; layout controls require application handling');
    const text = originalText.normalize('NFC');
    for (const character of text) {
      const point = character.codePointAt(0);
      requireValue(point < 0xd800 || point > 0xdfff, 'Unpaired UTF-16 surrogate');
    }
    const {font, values} = prepare(variations);
    const buffer = new hb.Buffer();
    buffer.addText(text);
    if (script) buffer.setScript(script);
    if (direction) {
      requireValue(['ltr', 'rtl', 'ttb', 'btt'].includes(direction), 'Invalid text direction');
      buffer.setDirection(hb.Direction[direction.toUpperCase()]);
    }
    buffer.guessSegmentProperties();
    buffer.setLanguage(language);
    hb.shape(font, buffer);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    let x = 0, y = 0;
    const glyphs = infos.map((info, index) => {
      requireValue(info.codepoint !== 0, `Missing glyph in ${entry.id} at cluster ${info.cluster}`);
      const position = positions[index];
      finite(Object.values(position));
      const glyph = {glyphId: info.codepoint, cluster: info.cluster, flags: info.flags,
        ...position, x: x + position.xOffset, y: y + position.yOffset};
      if (!entry.color) glyph.outline = closedOutline(font, info.codepoint);
      x += position.xAdvance;
      y += position.yAdvance;
      return glyph;
    });
    return {...metadata, originalText, text, normalization: 'NFC', clusterUnit: 'utf16-code-unit',
      language, direction, variations: values, glyphs, advanceX: x, advanceY: y,
      geometryKind: entry.color ? entry.colorFormat : 'outline'};
  }

  function colorPaint(glyphId, {variations, paletteIndex = 0,
    foreground = {red: 0, green: 0, blue: 0, alpha: 255}} = {}) {
    requireValue(entry.colorFormat === 'COLRv1', 'A COLRv1 font is required for color vector geometry');
    requireValue(Number.isInteger(glyphId) && glyphId > 0 && glyphId < entry.glyphCount, 'Invalid glyph id');
    requireValue(Number.isInteger(paletteIndex) && paletteIndex >= 0 && paletteIndex < face.getColorPalettes().length,
      'Invalid color palette');
    requireValue(['red', 'green', 'blue', 'alpha'].every(key => Number.isInteger(foreground[key]) && foreground[key] >= 0 && foreground[key] <= 255),
      'Foreground must contain four 8-bit channels');
    const {font, values} = prepare(variations);
    const operations = [];
    const stack = [];
    const funcs = new hb.PaintFuncs();
    const push = (type, operation) => { stack.push(type); operations.push(operation); };
    const pop = (type, operation) => {
      requireValue(stack.pop() === type, 'Unbalanced color paint stack');
      operations.push(operation);
    };
    const line = value => {
      const result = copy(value);
      result.colorStops.sort((a, b) => a.offset - b.offset);
      return result;
    };
    funcs.setPushTransformFunc((xx, yx, xy, yy, dx, dy) => {
      finite([xx, yx, xy, yy, dx, dy]);
      push('transform', {op: 'pushTransform', matrix: [xx, yx, xy, yy, dx, dy]});
    });
    funcs.setPopTransformFunc(() => pop('transform', {op: 'popTransform'}));
    funcs.setPushClipGlyphFunc((id, currentFont) =>
      push('clip', {op: 'pushClipOutline', glyphId: id, outline: closedOutline(currentFont, id)}));
    funcs.setPushClipRectangleFunc((xmin, ymin, xmax, ymax) => {
      finite([xmin, ymin, xmax, ymax]);
      push('clip', {op: 'pushClipRectangle', rectangle: [xmin, ymin, xmax, ymax]});
    });
    funcs.setPopClipFunc(() => pop('clip', {op: 'popClip'}));
    funcs.setColorFunc((isForeground, color) => operations.push({op: 'solid', isForeground, color: copy(color)}));
    funcs.setLinearGradientFunc((colorLine, x0, y0, x1, y1, x2, y2) =>
      operations.push({op: 'linearGradient', colorLine: line(colorLine), points: [x0, y0, x1, y1, x2, y2]}));
    funcs.setRadialGradientFunc((colorLine, x0, y0, r0, x1, y1, r1) =>
      operations.push({op: 'radialGradient', colorLine: line(colorLine), circles: [x0, y0, r0, x1, y1, r1]}));
    funcs.setSweepGradientFunc((colorLine, x0, y0, startAngle, endAngle) =>
      operations.push({op: 'sweepGradient', colorLine: line(colorLine), center: [x0, y0], angles: [startAngle, endAngle]}));
    funcs.setPushGroupFunc(() => push('group', {op: 'pushGroup'}));
    funcs.setPopGroupFunc(mode => pop('group', {op: 'popGroup', mode}));
    // Do not return a partially converted vector when a paint graph needs an image.
    funcs.setImageFunc(() => { throw new Error('Embedded image needs a separate raster conversion step'); });
    requireValue(font.paintGlyphOrFail(glyphId, funcs, undefined, paletteIndex, foreground), 'Glyph has no supported color paint');
    requireValue(!stack.length && operations.some(op => /^(solid|.*Gradient)$/.test(op.op)), 'Empty or unbalanced color paint');
    function checkNumbers(value) {
      if (typeof value === 'number') finite([value]);
      else if (value && typeof value === 'object') Object.values(value).forEach(checkNumbers);
    }
    checkNumbers(operations);
    return {...metadata, glyphId, variations: values, paletteIndex, foreground: copy(foreground),
      geometryKind: 'COLRv1-paint-operations', operations};
  }

  function bitmap(glyphId) {
    requireValue(entry.colorFormat === 'CBDT/CBLC', 'A bitmap color font is required');
    requireValue(Number.isInteger(glyphId) && glyphId > 0 && glyphId < entry.glyphCount, 'Invalid glyph id');
    const {font} = prepare();
    const png = font.getGlyphColorPng(glyphId);
    requireValue(png?.length > 8, 'Glyph has no color PNG');
    return {...metadata, glyphId, geometryKind: 'bitmap', mimeType: 'image/png', bytes: Uint8Array.from(png),
      extents: font.glyphExtents(glyphId)};
  }
  return Object.freeze({metadata, shapeRun, colorPaint, bitmap});
}

/** Exact emoji-token lookup; never strip selectors from arbitrary user text. */
export function createEmojiLookup(catalog, aliases, components) {
  const canonical = new Map(catalog.items.map(item => [item.id, item]));
  const forms = new Map(catalog.items.map(item => [item.emoji, item]));
  for (const alias of aliases.items) {
    const target = canonical.get(alias.canonicalId);
    if (target) forms.set(alias.emoji, target);
  }
  for (const item of components?.items ?? []) forms.set(item.emoji, item);
  return input => {
    const item = forms.get(input);
    return item ? {originalText: input, canonicalText: item.emoji, item} : null;
  };
}
