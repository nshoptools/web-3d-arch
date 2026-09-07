"""Build (--write) or verify color catalogs, original art, fonts and shaping offline."""
import argparse
from collections import Counter
import json
import math
import posixpath
import re
import struct
import xml.etree.ElementTree as ET
import zlib

import fontTools
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.otTables import PaintFormat
import uharfbuzz as hb

from sync_assets import digest, json_bytes, local, write
from sync_color_assets import BASE, LOCK, blob_hash
from build_catalogs import check, sfnt_checksum


def unicode_items(qualifications=('fully-qualified',)):
    data = local('src/assets/emoji/upstream/unicode/emoji-test.txt').read_text(encoding='utf-8')
    version = re.search(r'^# Version: (.+)$', data, re.M).group(1)
    group = subgroup = None
    result = []
    for line in data.splitlines():
        if line.startswith('# group: '):
            group = line.removeprefix('# group: ')
        elif line.startswith('# subgroup: '):
            subgroup = line.removeprefix('# subgroup: ')
        else:
            match = re.match(r'^([0-9A-F ]+)\s*;\s*([a-z-]+)\s*#\s*(\S+)\s+E([0-9.]+)\s+(.+)$', line)
            if match:
                codes, qualification, text, emoji_version, name = match.groups()
                if qualifications is not None and qualification not in qualifications:
                    continue
                cps = codes.strip().split()
                check(text == ''.join(chr(int(cp, 16)) for cp in cps), 'Unicode mismatch')
                result.append({'id': '-'.join(cp.lower() for cp in cps), 'emoji': text,
                               'name': name, 'codepoints': cps, 'group': group,
                               'subgroup': subgroup, 'emojiVersion': emoji_version,
                               'qualification': qualification})
    return version, result


def inspect_png(data):
    check(data[:8] == b'\x89PNG\r\n\x1a\n', 'Invalid PNG signature')
    offset, chunks, compressed = 8, [], []
    header = None
    while offset < len(data):
        check(offset + 12 <= len(data), 'Truncated PNG chunk')
        size, tag = struct.unpack_from('>I4s', data, offset)
        end = offset + size + 12
        check(end <= len(data), 'PNG chunk outside file')
        body = data[offset + 8:offset + 8 + size]
        crc = struct.unpack_from('>I', data, offset + size + 8)[0]
        check(zlib.crc32(tag + body) & 0xFFFFFFFF == crc, 'PNG CRC mismatch')
        if tag == b'IHDR':
            check(header is None and size == 13, 'Invalid PNG header')
            header = struct.unpack('>IIBBBBB', body)
        elif tag == b'IDAT':
            compressed.append(body)
        elif tag == b'IEND':
            check(size == 0 and end == len(data), 'Invalid PNG end')
        chunks.append(tag)
        offset = end
    check(header and chunks[0] == b'IHDR' and chunks[-1] == b'IEND' and compressed, 'Incomplete PNG')
    check(header[0] > 0 and header[1] > 0, 'Empty PNG')
    inflater = zlib.decompressobj()
    decoded = inflater.decompress(b''.join(compressed)) + inflater.flush()
    check(decoded and inflater.eof and not inflater.unused_data, 'Invalid PNG compressed pixels')
    return {'width': header[0], 'height': header[1]}


def inspect_svg(data):
    root = ET.fromstring(data)
    check(root.tag == '{http://www.w3.org/2000/svg}svg', 'Invalid SVG root')
    tags = Counter(element.tag.rsplit('}', 1)[-1] for element in root.iter())
    check(not tags['script'], 'Unexpected script in original SVG')
    external = []
    for element in root.iter():
        for attribute, value in element.attrib.items():
            if attribute.rsplit('}', 1)[-1] == 'href' and not value.startswith(('#', 'data:')):
                external.append(value)
    return {'viewBox': root.get('viewBox'), 'intrinsicWidth': root.get('width'), 'intrinsicHeight': root.get('height'),
            'shapeElements': sum(tags[tag] for tag in ('path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line')),
            'hasGradients': bool(tags['linearGradient'] or tags['radialGradient']),
            'hasClipping': bool(tags['clipPath'] or tags['mask']),
            'hasFilters': bool(tags['filter']), 'hasRasterImages': bool(tags['image']),
            'hasForeignObject': bool(tags['foreignObject']),
            'externalReferences': sorted(set(external))}


def inspect_font(record, lock, corpus):
    data = local(BASE + record['path']).read_bytes()
    check(data[:4] == b'\x00\x01\x00\x00', 'Not sfnt TrueType')
    check(sfnt_checksum(data) == 0xB1B0AFBA, f'{record["path"]}: font checksum')
    font = TTFont(local(BASE + record['path']), checkChecksums=2, lazy=False)
    for tag, entry in font.reader.tables.items():
        check(entry.offset % 4 == 0 and entry.offset + entry.length <= len(data), 'Table bounds/alignment')
        check(len(font.reader[tag]) == entry.length, f'{record["path"]}: {tag} checksum/length')
    font.ensureDecompiled()
    order = font.getGlyphOrder()
    names = set(order)
    cmap = font.getBestCmap()
    check(len(order) == font['maxp'].numGlyphs and set(cmap.values()) <= names, 'Invalid glyphs/cmap')
    color_details = {}
    if 'COLR' in font:
        check(font['COLR'].version == 1 and 'CPAL' in font and 'glyf' in font, 'Expected COLRv1 + CPAL + glyf')
        color_format = 'COLRv1'
        colr = font['COLR'].table
        roots = {record.BaseGlyph: record.Paint for record in colr.BaseGlyphList.BaseGlyphPaintRecord}
        check(set(roots) <= names, 'Unknown COLR base glyph')
        palette_size = len(font['CPAL'].palettes[0])
        check(all(len(palette) == palette_size for palette in font['CPAL'].palettes), 'Inconsistent palettes')
        paint_formats, seen, active = Counter(), set(), set()
        drawable = set()
        for name in order:
            coords, ends, flags = font['glyf'][name].getCoordinates(font['glyf'])
            check(len(coords) == len(flags) and (not ends or ends[-1] == len(coords) - 1), 'Invalid glyph contours')
            check(all(math.isfinite(v) for point in coords for v in point), 'Nonfinite outline')
            if coords:
                drawable.add(name)

        def walk(paint):
            key = id(paint)
            check(key not in active, 'Cyclic COLR paint graph')
            if key in seen:
                return
            active.add(key)
            paint_formats[PaintFormat(paint.Format).name] += 1
            if paint.Format == PaintFormat.PaintGlyph:
                check(paint.Glyph in names, 'Invalid paint glyph reference')
            if paint.Format == PaintFormat.PaintColrLayers:
                check(colr.LayerList and paint.FirstLayerIndex + paint.NumLayers <= len(colr.LayerList.Paint), 'Invalid COLR layer range')
            palette_indices = [paint.PaletteIndex] if hasattr(paint, 'PaletteIndex') else []
            if hasattr(paint, 'ColorLine'):
                palette_indices += [stop.PaletteIndex for stop in paint.ColorLine.ColorStop]
            check(all(index == 0xFFFF or 0 <= index < palette_size for index in palette_indices), 'Invalid palette index')
            check(all(math.isfinite(v) for v in vars(paint).values() if isinstance(v, (float, int))), 'Invalid paint numeric field')
            for child in paint.iterPaintSubTables(colr):
                walk(child.value)
            active.remove(key)
            seen.add(key)

        for paint in roots.values():
            walk(paint)
        colored = {font.getGlyphID(name) for name in roots}
        color_details = {'colorGlyphCount': len(colored), 'paletteCount': len(font['CPAL'].palettes),
                         'colorsPerPalette': palette_size, 'paintFormats': dict(sorted(paint_formats.items())),
                         'outlineGlyphsChecked': len(order), 'nonemptyOutlineGlyphs': len(drawable)}
    else:
        check('CBDT' in font and 'CBLC' in font, 'Expected bitmap color tables')
        color_format = 'CBDT/CBLC'
        colored = set()
        bitmap_count = 0
        for strike in font['CBDT'].strikeData:
            for name, bitmap in strike.items():
                check(name in names, 'Unknown bitmap glyph')
                inspect_png(bitmap.imageData)
                colored.add(font.getGlyphID(name))
                bitmap_count += 1
        color_details = {'colorGlyphCount': len(colored), 'bitmapStrikes': len(font['CBDT'].strikeData),
                         'bitmapImagesChecked': bitmap_count}
    face = hb.Face(data)
    hb_font = hb.Font(face)
    hb_font.scale = (face.upem, face.upem)
    mappings = {}
    for item in corpus:
        buffer = hb.Buffer()
        buffer.add_str(item['emoji'])
        buffer.guess_segment_properties()
        hb.shape(hb_font, buffer)
        infos, positions = buffer.glyph_infos, buffer.glyph_positions
        visible = [info.codepoint for info in infos if info.codepoint in colored]
        leftovers = any(info.codepoint not in colored and (pos.x_advance or pos.y_advance)
                        for info, pos in zip(infos, positions))
        if len(visible) == 1 and all(info.codepoint != 0 for info in infos) and not leftovers:
            mappings[item['id']] = visible[0]
    filename = record['path'].split('/')[-1]
    font_id = filename.removesuffix('.ttf').lower().replace('_', '-')
    variant = 'full'
    for marker in ('emojicompat', 'noflags', 'flagsonly', 'WindowsCompatible'):
        if marker in filename:
            variant = marker.lower()
    fully_qualified_count = sum(item['id'] in mappings and item['qualification'] == 'fully-qualified' for item in corpus)
    result = {'id': font_id, 'name': filename.removesuffix('.ttf'),
              'family': font['name'].getBestFamilyName(), 'path': record['path'], 'file': filename,
              'style': 'normal', 'weight': font['OS/2'].usWeightClass, 'variable': 'fvar' in font,
              'color': True, 'colorFormat': color_format, 'variant': variant,
              'outlineFormat': 'glyf+COLRv1-paint-graph' if color_format == 'COLRv1' else None,
              'internalVersion': font['name'].getDebugName(5), 'unitsPerEm': font['head'].unitsPerEm,
              'glyphCount': len(order), 'coverage': {'unicodeCodepoints': len(cmap),
                                                  'fullyQualifiedEmoji': fully_qualified_count,
                                                  'unicodeTestForms': len(mappings)},
              'geometry': {'source': 'color-vector' if color_format == 'COLRv1' else 'bitmap',
                           'requiresConversion': True, 'meshValidated': False},
              'bytes': len(data), 'sha256': record['sha256'],
              'license': {'spdx': 'OFL-1.1', 'path': 'fonts/LICENSE'},
              'source': {'url': record['url'], 'repository': lock['repository'],
                         'commit': lock['commit'], 'modified': False}}
    audit = {'id': font_id, 'sfntAndTableChecksums': 'pass', 'colorTables': 'pass',
             'tables': sorted(font.reader.keys()), 'fullyQualifiedEmojiShaped': fully_qualified_count,
             'unicodeTestFormsShaped': len(mappings), **color_details}
    font.close()
    return result, audit, mappings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    lock = json.loads(local(LOCK).read_text(encoding='utf-8'))
    records = lock['files']
    check(len({record['path'] for record in records}) == len(records), 'Duplicate locked path')
    sources = {r['sourcePath']: r for r in records if 'sourcePath' in r}
    check(len(sources) == lock['sourceTree']['selectedCount'] and not lock['sourceTree']['truncated'], 'Incomplete selected tree')
    svg_stats, png_stats = {}, {}
    for record in records:
        data = local(BASE + record['path']).read_bytes()
        check(digest(data) == record['sha256'] and len(data) == record['bytes'], f'Changed asset: {record["path"]}')
        if 'gitBlobSha1' in record:
            check(blob_hash(data) == record['gitBlobSha1'], 'Git blob mismatch')
        try:
            if record['role'] == 'svg':
                svg_stats[record['path']] = inspect_svg(data)
            elif record['role'] == 'png':
                png_stats[record['path']] = inspect_png(data)
        except Exception as error:
            raise ValueError(f'{record["path"]}: {error}') from error
    expected = {record['path'] for record in records}
    color_root = local(BASE)
    actual = {p.relative_to(color_root).as_posix() for p in color_root.rglob('*') if p.is_file() and
              p.suffix.lower() in ('.ttf', '.svg', '.png')}
    check(actual == {p for p in expected if p.endswith(('.ttf', '.svg', '.png'))}, 'Missing/extra color assets')
    print(f'Checked {len(svg_stats)} SVGs and {len(png_stats)} PNGs; checking fonts next.', flush=True)

    def resolve_source(name, active=()):
        record = sources.get(name)
        if not record:
            return None
        check(name not in active, 'Cyclic source alias')
        if record['role'] == 'source-link':
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), record['linkTarget']))
            check(not target.startswith('../') and target in sources, 'Missing/escaping source alias')
            return resolve_source(target, (*active, name))
        return record

    for record in records:
        if record['role'] == 'source-link':
            resolve_source(record['sourcePath'])
    version, all_corpus = unicode_items(qualifications=None)
    corpus = [item for item in all_corpus if item['qualification'] == 'fully-qualified']
    components = [item for item in all_corpus if item['qualification'] == 'component']
    fonts, font_audits, mappings = [], [], {}
    for record in records:
        if record['role'] == 'color-font':
            entry, audit, mapping = inspect_font(record, lock, all_corpus)
            fonts.append(entry)
            font_audits.append(audit)
            mappings[entry['id']] = mapping
            print(f'Checked {entry["file"]}: {len(mapping)} emoji sequences', flush=True)
    check(len(fonts) == 8, 'Published font inventory changed; review source selection')
    main_colr, main_bitmap = 'noto-colrv1', 'notocoloremoji'
    aliases = {}
    for line in local(BASE + 'emoji_aliases.txt').read_text(encoding='utf-8').splitlines():
        line = line.split('#', 1)[0].strip()
        if line:
            a, b = line.split(';')
            aliases[a] = b
    items, unavailable = [], []
    for original in corpus + components:
        item = dict(original)
        key = '_'.join(f'{int(cp, 16):04x}' for cp in item['codepoints'] if cp != 'FE0F')
        keys = [key]
        if key in aliases:
            keys.append(aliases[key])
        vector_names, raster_names = [], []
        for source_key in keys:
            vector_names += ['svg/emoji_u' + source_key + '.svg',
                             'third_party/region-flags/waved-svg/emoji_u' + source_key + '.svg']
            raster_names += [f'png/{size}/emoji_u{source_key}.png' for size in (512, 128, 72, 32)]
        cps = [int(cp, 16) for cp in item['codepoints']]
        if len(cps) == 2 and all(0x1F1E6 <= cp <= 0x1F1FF for cp in cps):
            region = ''.join(chr(65 + cp - 0x1F1E6) for cp in cps)
            vector_names.append('third_party/region-flags/svg/' + region + '.svg')
            raster_names.append('third_party/region-flags/png/' + region + '.png')
        if cps[0] == 0x1F3F4 and cps[-1] == 0xE007F and all(0xE0020 <= cp <= 0xE007E for cp in cps[1:-1]):
            tag = ''.join(chr(cp - 0xE0000) for cp in cps[1:-1]).upper()
            region = tag[:2] + '-' + tag[2:]
            vector_names.append('third_party/region-flags/svg/' + region + '.svg')
            raster_names.append('third_party/region-flags/png/' + region + '.png')
        vectors, rasters = [], []
        for candidates, out, stats in ((vector_names, vectors, svg_stats), (raster_names, rasters, png_stats)):
            for name in candidates:
                record = resolve_source(name)
                if record and record['path'] not in {entry['path'] for entry in out}:
                    out.append({'path': record['path'], 'sha256': record['sha256'], **stats[record['path']]})
        glyphs = {font_id: mappings[font_id][item['id']] for font_id in (main_colr, main_bitmap)
                  if item['id'] in mappings[font_id]}
        geometry_vectors = [v for v in vectors if not (v['hasRasterImages'] or v['externalReferences'] or v['hasForeignObject'])]
        preview = next((r for r in rasters if r['width'] == 128 and r['height'] == 128), rasters[0] if rasters else None)
        item.update({'glyphs': glyphs, 'vectors': vectors, 'rasters': rasters,
                     'preferredRasterPath': preview['path'] if preview else None,
                     'preferredGeometrySource': 'svg' if geometry_vectors else 'colrv1' if main_colr in glyphs else None,
                     'preferredVectorPath': geometry_vectors[0]['path'] if geometry_vectors else None})
        if vectors or glyphs or rasters:
            items.append(item)
        else:
            unavailable.append(item)
    check(len({item['id'] for item in items}) == len(items), 'Duplicate color emoji IDs')
    for example in ('😀', '❤️', '🇻🇳', '1️⃣', '👍🏽', '👨‍👩‍👧‍👦', '🫪'):
        check(any(item['emoji'] == example and item['preferredGeometrySource'] for item in items), f'Missing color/vector emoji {example}')
    component_items = [item for item in items if item['qualification'] == 'component']
    items = [item for item in items if item['qualification'] == 'fully-qualified']
    canonical = {tuple(cp for cp in item['codepoints'] if cp != 'FE0F'): item for item in items}
    check(len(canonical) == len(items), 'Ambiguous canonical emoji spelling')
    input_aliases = []
    for item in all_corpus:
        if item['qualification'] in ('fully-qualified', 'component'):
            continue
        target = canonical[tuple(cp for cp in item['codepoints'] if cp != 'FE0F')]
        glyphs = {font_id: mappings[font_id].get(item['id']) for font_id in (main_colr, main_bitmap)}
        check(glyphs == target['glyphs'], f'Alternate input shapes differently: {item["id"]}')
        input_aliases.append({**item, 'canonicalId': target['id'], 'glyphs': glyphs})
    groups = Counter(item['group'] for item in items)
    catalog = {'schemaVersion': 1, 'style': 'color', 'unicodeVersion': version, 'nameLanguage': 'en',
               'qualification': 'fully-qualified', 'sourceCommit': lock['commit'],
               'fontHashes': {font['id']: font['sha256'] for font in fonts if font['variant'] == 'full'},
               'groups': [{'name': name, 'count': count} for name, count in groups.items()],
               'count': len(items), 'unavailableCount': len(unavailable), 'items': items}
    mono = json.loads(local('src/assets/emoji/emoji-cat.json').read_text(encoding='utf-8'))
    collections = {'schemaVersion': 1, 'defaultCollection': 'noto-color-emoji',
                   'inputAliases': 'color/input-aliases.json', 'componentCatalog': 'color/components-cat.json',
                   'artworkCatalog': 'color/artwork-cat.json', 'collections': [
        {'id': 'noto-color-emoji', 'name': 'Noto Emoji màu', 'style': 'color',
         'fontCatalog': 'color/fonts-cat.json', 'emojiCatalog': 'color/emoji-cat.json',
         'defaultFontId': main_colr, 'count': len(items)},
        {'id': 'noto-emoji-monochrome', 'name': 'Noto Emoji đơn sắc', 'style': 'monochrome',
         'fontCatalog': 'fonts-cat.json', 'emojiCatalog': 'emoji-cat.json',
         'defaultFontId': 'notoemoji', 'count': mono['count']}]}
    audit = {'schemaVersion': 1, 'status': 'source-and-color-data-pass', 'sourceCommit': lock['commit'],
             'tools': {'fonttools': fontTools.__version__, 'uharfbuzz': hb.__version__, 'harfbuzz': hb.version_string()},
             'originalFilesHashed': len(records), 'colorFonts': len(fonts),
             'svgFilesParsed': len(svg_stats), 'pngFilesChecked': len(png_stats),
             'sourceLinksResolved': sum(r['role'] == 'source-link' for r in records),
             'emojiCatalogCount': len(items), 'unavailableEmoji': len(unavailable),
             'inputAliasesShaped': len(input_aliases), 'standaloneComponents': len(component_items),
             'emojiWithSvg': sum(bool(item['vectors']) for item in items),
             'emojiWithColorVectorFont': sum(main_colr in item['glyphs'] for item in items),
             'svgWithGradients': sum(s['hasGradients'] for s in svg_stats.values()),
             'svgWithRasterImages': sum(s['hasRasterImages'] for s in svg_stats.values()),
             'svgWithForeignObject': [p for p, s in svg_stats.items() if s['hasForeignObject']],
             'svgWithExternalReferences': [p for p, s in svg_stats.items() if s['externalReferences']],
             'fonts': font_audits, 'meshValidated': False,
             'scope': 'Original byte hashes, sfnt/table checksums, COLRv1 paint references/palettes/outlines, bitmap PNG CRC/deflate, SVG XML/features and full Unicode emoji shaping. No rendered color fidelity or 3D mesh validation.'}
    artwork = []
    records_by_path = {r['path']: r for r in records}
    emoji_by_id = {item['id']: item for item in items + component_items}
    emoji_ids_by_svg = {}
    for item in items + component_items:
        for vector in item['vectors']:
            emoji_ids_by_svg.setdefault(vector['path'], []).append(item['id'])
    for svg_path, stats in sorted(svg_stats.items()):
        record = records_by_path[svg_path]
        linked_ids = emoji_ids_by_svg.get(svg_path, [])
        source_name = svg_path.split('/')[-1].removesuffix('.svg')
        artwork.append({'id': svg_path.removesuffix('.svg').replace('/', ':'),
                        'name': emoji_by_id[linked_ids[0]]['name'] if linked_ids else source_name,
                        'nameLanguage': 'en' if linked_ids else None,
                        'path': svg_path, 'sha256': record['sha256'], **stats,
                        'emojiIds': linked_ids,
                        'licensePath': 'third_party/region-flags/LICENSE' if svg_path.startswith('third_party/') else 'svg/LICENSE',
                        'requiresRasterTracing': stats['hasRasterImages']})
    outputs = {BASE + 'fonts-cat.json': fonts, BASE + 'emoji-cat.json': catalog,
               BASE + 'input-aliases.json': {'schemaVersion': 1, 'unicodeVersion': version,
                                            'count': len(input_aliases), 'items': input_aliases},
               BASE + 'components-cat.json': {'schemaVersion': 1, 'unicodeVersion': version,
                                             'count': len(component_items), 'items': component_items},
               BASE + 'artwork-cat.json': {'schemaVersion': 1, 'nameLanguage': None,
                                          'count': len(artwork), 'items': artwork},
               'src/assets/emoji/collections.json': collections,
               'docs/assets/color-emoji-audit.json': audit,
               'docs/assets/color-emoji-unavailable.json': {'count': len(unavailable), 'items': unavailable}}
    for name, value in outputs.items():
        expected = json_bytes(value)
        if args.write:
            write(name, expected)
        else:
            check(local(name).read_bytes() == expected, f'Stale color catalog/evidence: {name}')
    print(json.dumps({key: audit[key] for key in ('colorFonts', 'svgFilesParsed', 'pngFilesChecked', 'emojiCatalogCount', 'unavailableEmoji', 'emojiWithSvg', 'emojiWithColorVectorFont')}))
    print('Color catalogs ' + ('written.' if args.write else 'verified offline; no files changed.'))


if __name__ == '__main__':
    main()
