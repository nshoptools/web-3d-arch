"""Cross-check catalogs, licenses, integrity, repository rules and durable evidence."""
import argparse
import json
import os
import subprocess

from sync_assets import ROOT, local, digest, json_bytes, write
from build_catalogs import check


def read_json(relative):
    return json.loads(local(relative).read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    locks = [('src/assets/', read_json('src/assets/assets-lock.json')),
             ('src/assets/emoji/color/', read_json('src/assets/emoji/color/assets-lock.json')),
             ('src/assets/harfbuzz/', read_json('src/assets/harfbuzz/assets-lock.json'))]
    originals = {}
    for base, lock in locks:
        for record in lock['files']:
            relative = record['path'] if record['path'].startswith('src/') else base + record['path']
            check(relative not in originals, f'Duplicate source path {relative}')
            data = local(relative).read_bytes()
            check(digest(data) == record['sha256'] and len(data) == record['bytes'], f'Changed source {relative}')
            originals[relative] = record
    text = read_json('src/assets/fonts/fonts-cat.json')
    mono_fonts = read_json('src/assets/emoji/fonts-cat.json')
    color_fonts = read_json('src/assets/emoji/color/fonts-cat.json')
    fonts = [('fonts', entry) for entry in text] + [('emoji', entry) for entry in mono_fonts] + [
        ('emoji/color', entry) for entry in color_fonts]
    check(len(fonts) == 62 and len({entry['id'] for _, entry in fonts}) == 62, 'Unexpected font inventory')
    for base, font in fonts:
        relative = f'src/assets/{base}/' + font['path']
        check(originals[relative]['sha256'] == font['sha256'], 'Font/catalog hash mismatch')
        check(local(f'src/assets/{base}/' + font['license']['path']).is_file(), 'Missing font license')
        check(font['name'] and font['family'], 'Empty font UI label')
    initial = read_json('docs/assets/initial-font-audit.json')
    by_id = {entry['id']: entry for entry in text}
    check(all(by_id[item['id']]['sha256'] == item['after']['sha256'] for item in initial['fonts']),
          'A previously restored font changed without a source review')

    collections = read_json('src/assets/emoji/collections.json')
    check(collections['defaultCollection'] == 'noto-color-emoji', 'Color default was lost')
    for collection in collections['collections']:
        font_catalog = read_json('src/assets/emoji/' + collection['fontCatalog'])
        emoji_catalog = read_json('src/assets/emoji/' + collection['emojiCatalog'])
        check(collection['count'] == emoji_catalog['count'] == len(emoji_catalog['items']), 'Invalid collection count')
        check(collection['defaultFontId'] in {f['id'] for f in font_catalog}, 'Invalid default font')
    color = read_json('src/assets/emoji/color/emoji-cat.json')
    aliases = read_json('src/assets/emoji/' + collections['inputAliases'])
    components = read_json('src/assets/emoji/' + collections['componentCatalog'])
    artwork = read_json('src/assets/emoji/' + collections['artworkCatalog'])
    for catalog in (color, aliases, components, artwork):
        check(catalog['count'] == len(catalog['items']) == len({item['id'] for item in catalog['items']}), 'Invalid IDs/count')
    all_emoji = color['items'] + components['items']
    for item in all_emoji:
        check(item['name'] and item['group'] and item['subgroup'], 'Missing emoji UI metadata')
        check(item['emoji'] == ''.join(chr(int(cp, 16)) for cp in item['codepoints']), 'Invalid emoji string')
        for representation in item['vectors'] + item['rasters']:
            record = originals['src/assets/emoji/color/' + representation['path']]
            check(record['sha256'] == representation['sha256'], 'Artwork hash mismatch')
        if item['preferredVectorPath']:
            vector = next(v for v in item['vectors'] if v['path'] == item['preferredVectorPath'])
            check(not any(vector[k] for k in ('hasRasterImages', 'hasForeignObject', 'externalReferences')), 'Invalid vector preference')
        check(item['preferredRasterPath'] in {r['path'] for r in item['rasters']}, 'Missing preview image')
    for item in artwork['items']:
        check(item['name'] and originals['src/assets/emoji/color/' + item['path']]['sha256'] == item['sha256'], 'Invalid artwork label/hash')
        check(local('src/assets/emoji/color/' + item['licensePath']).is_file(), 'Missing artwork license')
    mono = read_json('src/assets/emoji/emoji-cat.json')
    excluded = read_json('docs/assets/emoji-excluded.json')
    check({item['id'] for item in mono['items']} | {item['id'] for item in excluded['items']} ==
          {item['id'] for item in color['items']}, 'Mono support/exclusions do not partition the standard corpus')

    evidence_names = ['font-audit.json', 'opentype-audit.json', 'color-emoji-audit.json',
                      'input-runtime-audit.json', 'artwork-render-audit.json']
    evidence = {name: read_json('docs/assets/' + name) for name in evidence_names}
    check(evidence['font-audit.json']['textFontCount'] == len(text), 'Stale font evidence')
    check(evidence['color-emoji-audit.json']['originalFilesHashed'] == len(locks[1][1]['files']), 'Stale color evidence')
    check(evidence['input-runtime-audit.json']['sourceModuleSha256'] == digest(local('src/input/font-source.mjs').read_bytes()), 'Untested runtime source')
    check(evidence['artwork-render-audit.json']['svgRendered'] == artwork['count'], 'Stale render evidence')
    env_report = read_json(local(os.environ['PROJECT_REVIEW_RUN']) / 'reports/project-env-audit.json')
    check(env_report['status'] == 'pass', 'Environment check did not pass')

    frame = ['AGENTS.md', 'CLAUDE.md', 'GROK.md', 'tmp/reviews/README.md', 'docs/reviews/REVIEW-TEMPLATE.md']
    for seat in ('grok', 'opus', 'codex'):
        frame += [f'tmp/reviews/{seat}/README.md', f'tmp/reviews/{seat}/runs/.gitkeep']
    check(all(local(name).is_file() for name in frame), 'Missing rules/review room')
    check(all('AGENTS.md' in local(name).read_text(encoding='utf-8') for name in ('CLAUDE.md', 'GROK.md')), 'Missing seat rule entry')
    git_input = ('\0'.join([*originals, *frame, 'src/input/font-source.mjs', 'docs/assets/readiness-audit.json']) + '\0').encode('utf-8')
    ignored = subprocess.run(['git', 'check-ignore', '--no-index', '-z', '--stdin'], input=git_input,
                             cwd=ROOT, capture_output=True)
    check(ignored.returncode == 1 and not ignored.stdout, f'Assets/rules would be ignored: {ignored.stdout}')
    check(subprocess.run(['git', 'check-ignore', '--no-index', 'tmp/reviews/codex/runs/audit-fixture/evidence/log.txt'],
                         cwd=ROOT, capture_output=True).returncode == 0, 'Run output is not ignored')
    attributes = subprocess.run(['git', 'check-attr', '-z', '--stdin', 'text'], cwd=ROOT,
                                input='\0'.join(originals).encode() + b'\0', capture_output=True, check=True).stdout.split(b'\0')
    check(all(attributes[i] == b'unset' for i in range(2, len(attributes) - 1, 3)), 'Git would transform original asset bytes')

    report = {'schemaVersion': 1, 'status': 'ready-for-input-integration',
              'originalFilesVerified': len(originals), 'originalBytes': sum(r['bytes'] for r in originals.values()),
              'textFamilies': 30, 'textFonts': len(text), 'totalFontFiles': len(fonts),
              'legacyFontIdsAndOriginalHashesPreserved': len(initial['fonts']),
              'colorEmoji': color['count'], 'monoEmoji': mono['count'], 'monoUnsupported': excluded['count'],
              'alternateInputForms': aliases['count'], 'standaloneComponents': components['count'],
              'svgArtwork': artwork['count'], 'artworkOutsideStandardPicker': sum(not i['emojiIds'] for i in artwork['items']),
              'pngOriginals': evidence['artwork-render-audit.json']['pngFullyDecoded'],
              'reviewRooms': ['grok', 'opus', 'codex'], 'environmentCheck': env_report,
              'gitOriginalBytesPreserved': True, 'assetAndRuleFilesNotIgnored': True,
              'sourcePins': {'googleFonts': locks[0][1]['googleFonts']['commit'], 'notoColorEmoji': locks[1][1]['commit'],
                             'opentypejs': locks[0][1]['opentype']['version'], 'harfbuzzjs': locks[2][1]['version']},
              'evidenceSha256': {name: digest(local('docs/assets/' + name).read_bytes()) for name in evidence_names},
              'catalogSha256': {str(p.relative_to(ROOT)).replace('\\', '/'): digest(p.read_bytes())
                                for p in sorted(set((ROOT / 'src/assets').rglob('*cat.json')) |
                                                {local('src/assets/emoji/collections.json'),
                                                 local('src/assets/emoji/color/input-aliases.json')})},
              'meshValidated': False, 'physicalPrintTested': False,
              'scope': 'Original assets, complete selected family variants, UI catalogs and JavaScript input extraction. '
                       '3D conversion, printer profiles, material mapping, slicer validation and physical prints remain application work.'}
    target = 'docs/assets/readiness-audit.json'
    if args.write:
        write(target, json_bytes(report))
    else:
        check(local(target).read_bytes() == json_bytes(report), 'Stale readiness report')
    print(json.dumps({k: report[k] for k in ('status', 'originalFilesVerified', 'totalFontFiles', 'colorEmoji',
                                          'alternateInputForms', 'standaloneComponents', 'svgArtwork', 'pngOriginals')}))


if __name__ == '__main__':
    main()
