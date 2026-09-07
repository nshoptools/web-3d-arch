"""Build (--write) or verify (default) catalogs from locked original assets.

Requires the pinned packages in requirements.txt. No network access is used.
Checks sfnt/table checksums, all default glyph outlines and emoji shaping.
"""
import argparse
import json
import math
from pathlib import Path
import re
import struct

import fontTools
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
import uharfbuzz as hb

from sync_assets import ROOT, LOCK, digest, json_bytes, local, write

VI_UPPER = 'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ'
VI_CODEPOINTS = sorted(set(map(ord, VI_UPPER + VI_UPPER.lower() +
                              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')))
TEXT_SAMPLE = 'Tiếng Việt: Đặng Thái Sơn — Ắ ầ ễ ộ ớ ự ỹ'
LOCK_DATA = json.loads(LOCK.read_text(encoding='utf-8'))


def check(condition, message):
    if not condition:
        raise ValueError(message)


def check_locked_files():
    records = LOCK_DATA['files']
    check(len({r['path'] for r in records}) == len(records), 'Duplicate paths in lock')
    for record in records:
        data = local(record['path']).read_bytes()
        check(len(data) == record['bytes'] and digest(data) == record['sha256'],
              f'Locked asset changed: {record["path"]}')
    expected = {r['path'] for r in records if r['role'] == 'font'}
    actual = {p.relative_to(ROOT).as_posix() for folder in ('fonts', 'emoji')
              for p in (ROOT / 'src/assets' / folder).rglob('*.ttf')
              if not p.is_relative_to(ROOT / 'src/assets/emoji/color')}
    # Color font formats and their separate lock are verified by build_color_catalogs.py.
    check(actual == expected, 'Extra or missing font files outside lock')


def sfnt_checksum(data):
    padded = data + b'\0' * (-len(data) % 4)
    return sum(value[0] for value in struct.iter_unpack('>I', padded)) & 0xFFFFFFFF


def inspect_font(record):
    path = local(record['path'])
    data = path.read_bytes()
    check(data[:4] == b'\x00\x01\x00\x00', f'{path.name}: not TrueType sfnt')
    check(sfnt_checksum(data) == 0xB1B0AFBA, f'{path.name}: invalid whole-font checksum')
    font = TTFont(path, checkChecksums=2, lazy=False)
    for tag, entry in font.reader.tables.items():
        check(entry.offset % 4 == 0 and entry.offset + entry.length <= len(data),
              f'{path.name}: invalid {tag} bounds/alignment')
        table_data = font.reader[tag]  # checkChecksums=2 asserts on mismatch.
        check(len(table_data) == entry.length, f'{path.name}: truncated {tag}')
    font.ensureDecompiled()
    check('glyf' in font and 'loca' in font, f'{path.name}: no TrueType outlines')
    check(not any(tag in font for tag in ('CBDT', 'CBLC', 'sbix', 'COLR', 'SVG ')),
          f'{path.name}: expected monochrome outline source')
    cmap = font.getBestCmap()
    glyph_order = font.getGlyphOrder()
    check(cmap and all(name in glyph_order for name in cmap.values()), f'{path.name}: invalid cmap')
    check(len(glyph_order) == font['maxp'].numGlyphs, f'{path.name}: invalid glyph count')
    axes = {axis.axisTag: {'min': axis.minValue, 'default': axis.defaultValue, 'max': axis.maxValue}
            for axis in font['fvar'].axes} if 'fvar' in font else {}
    defaults = {tag: values['default'] for tag, values in axes.items()}
    if 'wght' in axes:
        check(axes['wght']['min'] <= record['weight'] <= axes['wght']['max'], 'Weight out of range')
        defaults['wght'] = record['weight']
    else:
        check(font['OS/2'].usWeightClass == record['weight'], f'{path.name}: wrong static weight')
    glyph_set = font.getGlyphSet()
    nonempty = set()
    for name in glyph_order:
        pen = RecordingPen()
        glyph_set[name].draw(pen)
        for operation, points in pen.value:
            if operation == 'addComponent':
                check(points[0] in glyph_set, f'{path.name}: missing component')
                check(all(math.isfinite(v) for v in points[1]), f'{path.name}: invalid component transform')
            else:
                for point in points:
                    if point is not None:
                        check(all(math.isfinite(v) for v in point), f'{path.name}: invalid coordinates')
        # Resolve composite contours, including glyphs whose components are blank.
        coords, ends, flags = font['glyf'][name].getCoordinates(font['glyf'])
        check(len(coords) == len(flags), f'{path.name}: coordinate/flag mismatch')
        check(not ends or ends[-1] == len(coords) - 1, f'{path.name}: invalid contour endpoints')
        if len(coords):
            nonempty.add(font.getGlyphID(name))
    missing = [chr(cp) for cp in VI_CODEPOINTS if cp not in cmap or font.getGlyphID(cmap[cp]) not in nonempty]
    parent = path.parent.parent
    result = {
        'id': record['id'], 'name': record['name'], 'family': record['family'],
        'file': path.name, 'path': path.relative_to(parent).as_posix(),
        'style': record.get('style', 'normal'), 'weight': record['weight'], 'category': record['category'],
        'format': 'truetype', 'outlineFormat': 'glyf',
        'variable': bool(axes), 'axes': axes, 'defaultVariation': defaults,
        'unitsPerEm': font['head'].unitsPerEm, 'glyphCount': len(glyph_order),
        'fontRevision': font['head'].fontRevision,
        'internalVersion': font['name'].getDebugName(5),
        'coverage': {'unicodeCodepoints': len(cmap),
                     'vietnamese': not missing, 'missingVietnamese': missing},
        'sampleText': '😀 ❤️ 🇻🇳 👨‍👩‍👧‍👦' if record['assetType'] == 'emoji' else
                      (TEXT_SAMPLE if not missing else 'Design 3D: ' + record['family']),
        'bytes': len(data), 'sha256': digest(data),
        'license': {'spdx': 'OFL-1.1', 'path': local(record['license']).relative_to(parent).as_posix()},
        'source': {'url': record['url'], 'filename': record['sourceFilename'],
                   'repository': LOCK_DATA['googleFonts']['repository'],
                   'commit': LOCK_DATA['googleFonts']['commit'], 'modified': False},
    }
    if record['assetType'] == 'emoji':
        result['weightPresets'] = [300, 400, 500, 600, 700]
        # Vietnamese support is not a property of an emoji-only font.
        result['coverage'] = {'unicodeCodepoints': len(cmap)}
    audit = {'id': record['id'], 'path': record['path'], 'sha256': digest(data),
             'tables': sorted(font.reader.keys()), 'glyphs': len(glyph_order),
             'nonemptyGlyphs': len(nonempty), 'codepoints': len(cmap),
             'sfntChecksum': 'pass', 'tableChecksums': 'pass',
             'allDefaultOutlines': 'pass'}
    return result, audit, font, nonempty


def shape_text_sample(entry):
    data = local('src/assets/fonts/' + entry['path']).read_bytes()
    face = hb.Face(data)
    font = hb.Font(face)
    font.scale = (face.upem, face.upem)
    font.set_variations(entry['defaultVariation'])
    text = 'Tiếng Việt Đặng Ắ ầ ễ ộ ớ ự ỹ 3D'
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    buffer.language = 'vi'
    hb.shape(font, buffer)
    check(all(info.codepoint != 0 for info in buffer.glyph_infos), f'{entry["id"]}: missing text glyph')
    return {'fontId': entry['id'], 'fontSha256': entry['sha256'], 'text': text,
            'language': 'vi', 'unitsPerEm': face.upem,
            'variation': entry['defaultVariation'],
            'glyphs': [{'glyphId': info.codepoint, 'xAdvance': pos.x_advance,
                        'yAdvance': pos.y_advance, 'xOffset': pos.x_offset, 'yOffset': pos.y_offset}
                       for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions)]}


def build_emoji(font_entry, ttfont, nonempty):
    data = local('src/assets/emoji/' + font_entry['path']).read_bytes()
    face = hb.Face(data)
    font = hb.Font(face)
    font.scale = (face.upem, face.upem)
    font.set_variations(font_entry['defaultVariation'])
    corpus = local('src/assets/emoji/upstream/unicode/emoji-test.txt').read_text(encoding='utf-8')
    version = re.search(r'^# Version: (.+)$', corpus, re.M).group(1)
    check(version == LOCK_DATA['unicode']['version'], 'Wrong Unicode corpus version')
    groups = {}
    entries = []
    unsupported = []
    group = subgroup = None
    for line in corpus.splitlines():
        if line.startswith('# group: '):
            group = line.removeprefix('# group: ')
        elif line.startswith('# subgroup: '):
            subgroup = line.removeprefix('# subgroup: ')
        elif line and not line.startswith('#'):
            match = re.match(r'^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E([0-9.]+)\s+(.+)$', line)
            if not match:
                continue
            codes, text, emoji_version, name = match.groups()
            codepoints = codes.strip().split()
            check(text == ''.join(chr(int(cp, 16)) for cp in codepoints), 'Unicode text mismatch')
            buffer = hb.Buffer()
            buffer.add_str(text)
            buffer.guess_segment_properties()
            hb.shape(font, buffer)
            infos = buffer.glyph_infos
            positions = buffer.glyph_positions
            visible = [info for info in infos if info.codepoint in nonempty]
            # One RGI emoji must resolve to one nonempty glyph, with no .notdef
            # or unconsumed modifier/ZWJ/VS/tag glyphs. Invisible zero-advance
            # default ignorables (typically VS16) may remain after shaping.
            bad_invisible = any(info.codepoint not in nonempty and
                                (pos.x_advance or pos.y_advance) for info, pos in zip(infos, positions))
            supported = len(visible) == 1 and all(info.codepoint != 0 for info in infos) and not bad_invisible
            item = {'id': '-'.join(cp.lower() for cp in codepoints), 'emoji': text,
                    'name': name, 'codepoints': codepoints, 'group': group,
                    'subgroup': subgroup, 'emojiVersion': emoji_version}
            if supported:
                item['glyphId'] = visible[0].codepoint
                entries.append(item)
                groups[group] = groups.get(group, 0) + 1
            else:
                unsupported.append({**item, 'shapedGlyphIds': [i.codepoint for i in infos]})
    check(len({e['id'] for e in entries}) == len(entries), 'Duplicate emoji IDs')
    for sequence in ('😀', '❤️', '🇻🇳', '1️⃣', '👍🏽', '👨‍👩‍👧‍👦'):
        check(any(e['emoji'] == sequence for e in entries), f'Missing essential emoji: {sequence}')
    catalog = {
        'schemaVersion': 1, 'fontId': font_entry['id'], 'fontSha256': font_entry['sha256'],
        'unicodeVersion': version, 'nameLanguage': 'en',
        'qualification': 'fully-qualified', 'shaper': {'name': 'HarfBuzz', 'version': hb.version_string()},
        'groups': [{'id': name.lower().replace(' & ', '-').replace(' ', '-'), 'name': name, 'count': count}
                   for name, count in groups.items()],
        'count': len(entries), 'excludedCount': len(unsupported), 'items': entries,
    }
    excluded = {'unicodeVersion': version, 'fontSha256': font_entry['sha256'],
                'reason': 'Does not shape to one nonempty glyph without missing/advancing leftover glyphs.',
                'count': len(unsupported), 'items': unsupported}
    return catalog, excluded


def compare_before(before, entries):
    path = local(before)
    old_catalog = json.loads((path / 'fonts-cat.json').read_text(encoding='utf-8-sig'))
    rows = []
    for entry in entries:
        old_data = (path / 'ttf' / entry['file']).read_bytes()
        old_font = TTFont(path / 'ttf' / entry['file'])
        rows.append({'id': entry['id'], 'file': entry['file'],
                     'before': {'bytes': len(old_data), 'sha256': digest(old_data),
                                'glyphs': old_font['maxp'].numGlyphs,
                                'codepoints': len(old_font.getBestCmap())},
                     'after': {'bytes': entry['bytes'], 'sha256': entry['sha256'],
                               'glyphs': entry['glyphCount'], 'codepoints': entry['coverage']['unicodeCodepoints']},
                     'replaced': digest(old_data) != entry['sha256']})
        old_font.close()
    return {'originalCatalogEntries': len(old_catalog),
            'originalCatalogKeys': sorted(old_catalog[0]),
            'originalLicenseDeclaredSubset': 'subset' in (path / 'LICENSE-ofl.txt').read_text(encoding='utf-8'),
            'replacedCount': sum(row['replaced'] for row in rows), 'fonts': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--before', help='Optional repository-relative original backup; used only with --write')
    args = parser.parse_args()
    check_locked_files()
    text_fonts, emoji_fonts, audits = [], [], []
    for record in LOCK_DATA['files']:
        if record['role'] != 'font':
            continue
        entry, audit, font, nonempty = inspect_font(record)
        (emoji_fonts if record['assetType'] == 'emoji' else text_fonts).append(entry)
        audits.append(audit)
        if record['assetType'] == 'emoji':
            emoji_catalog, excluded = build_emoji(entry, font, nonempty)
        font.close()
    text_fonts.sort(key=lambda item: item['name'].casefold())
    check(len({entry['id'] for entry in text_fonts + emoji_fonts}) == len(audits), 'Duplicate font IDs')
    audit = {'schemaVersion': 1, 'googleFontsCommit': LOCK_DATA['googleFonts']['commit'],
             'tools': {'fonttools': fontTools.__version__, 'uharfbuzz': hb.__version__, 'harfbuzz': hb.version_string()},
             'originalFileHashes': 'pass', 'fontCount': len(audits),
             'textFontCount': len(text_fonts),
             'vietnameseAlphabetCodepointsTested': len(VI_CODEPOINTS),
             'vietnameseCompleteCount': sum(e['coverage']['vietnamese'] for e in text_fonts),
             'emojiSupported': emoji_catalog['count'], 'emojiExcluded': excluded['count'],
             'scope': 'Original bytes, sfnt/table checksums, default contours, cmap and HarfBuzz emoji shaping. No 3D mesh validation.',
             'fonts': audits}
    families = []
    for family in sorted({entry['family'] for entry in text_fonts}):
        variants = [entry for entry in text_fonts if entry['family'] == family]
        family_id = next(record['familyId'] for record in LOCK_DATA['files']
                         if record.get('family') == family and record['role'] == 'font')
        default = next(entry for entry in variants if entry['style'] == 'normal' and entry['weight'] == 400)
        families.append({'id': family_id, 'name': family, 'defaultFontId': default['id'],
                         'fontIds': [entry['id'] for entry in variants]})
    outputs = {'src/assets/fonts/fonts-cat.json': text_fonts,
               'src/assets/fonts/families-cat.json': {'schemaVersion': 1, 'count': len(families), 'families': families},
               'src/assets/emoji/fonts-cat.json': emoji_fonts,
               'src/assets/emoji/emoji-cat.json': emoji_catalog,
               'docs/assets/emoji-excluded.json': excluded,
               'docs/assets/font-audit.json': audit,
               'docs/assets/shaping-samples.json': {
                   'shaper': {'name': 'HarfBuzz', 'version': hb.version_string()},
                   'samples': [shape_text_sample(entry) for entry in text_fonts]}}
    if args.before:
        check(args.write, '--before requires --write')
        outputs['docs/assets/initial-font-audit.json'] = compare_before(args.before, text_fonts)
    for path, value in outputs.items():
        expected = json_bytes(value)
        if args.write:
            write(path, expected)
        else:
            check(local(path).read_bytes() == expected, f'Stale generated file: {path}; run with --write')
    print(json.dumps({key: audit[key] for key in ('fontCount', 'vietnameseCompleteCount', 'emojiSupported', 'emojiExcluded')}))
    print('Catalogs ' + ('written.' if args.write else 'verified offline; no files changed.'))


if __name__ == '__main__':
    main()
