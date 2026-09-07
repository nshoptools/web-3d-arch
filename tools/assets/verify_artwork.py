"""Independently render every source SVG and decode every PNG, entirely offline."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from importlib.metadata import version
from io import BytesIO
import json
import os

from PIL import Image, ImageDraw
import resvg_py
from sync_assets import local, write, digest, json_bytes
from build_catalogs import check

BASE = 'src/assets/emoji/color/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Update durable audit instead of comparing it')
    args = parser.parse_args()
    run = local(os.environ['PROJECT_REVIEW_RUN'])
    lock = json.loads(local(BASE + 'assets-lock.json').read_text(encoding='utf-8'))
    records = [record for record in lock['files'] if record['role'] in ('svg', 'png')]
    evidence = run / 'evidence/artwork'
    evidence.mkdir(parents=True, exist_ok=True)
    # Create/resolve output directories before parallel native rendering starts.
    for folder in sorted({str((evidence / record['path']).parent) for record in records if record['role'] == 'svg'}):
        local(folder).mkdir(parents=True, exist_ok=True)

    def inspect(record):
        source = local(BASE + record['path'])
        data = source.read_bytes()
        check(digest(data) == record['sha256'], f'Changed source: {record["path"]}')
        if record['role'] == 'svg':
            encoded = resvg_py.svg_to_bytes(svg_path=str(source), width=128, dpi=96, skip_system_fonts=True,
                                            resources_dir=str(source.parent))
        else:
            encoded = data
        with Image.open(BytesIO(encoded)) as image:
            image.load()  # Full pixel decode, separate from the CRC/deflate checker.
            rgba = image.convert('RGBA')
            bbox = rgba.getchannel('A').getbbox()
            check(bbox is not None, f'Blank artwork: {record["path"]}')
            row = {'path': record['path'], 'sha256': record['sha256'], 'role': record['role'],
                   'width': rgba.width, 'height': rgba.height, 'alphaBounds': list(bbox),
                   'decodedRgbaSha256': digest(rgba.tobytes())}
            if record['role'] == 'svg':
                output = local(evidence / (record['path'] + '.png'))
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(encoded)
        return row

    rows = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for row in pool.map(inspect, records):
            rows.append(row)
            if len(rows) % 2000 == 0:
                print(f'Rendered/decoded {len(rows)}/{len(records)} original artwork files', flush=True)
    rows.sort(key=lambda row: row['path'])
    write(run / 'reports/artwork-render-details.json', json_bytes(rows))
    svg_rows = [row for row in rows if row['role'] == 'svg']
    png_rows = [row for row in rows if row['role'] == 'png']
    report = {'schemaVersion': 1, 'status': 'pass', 'sourceCommit': lock['commit'],
              'tools': {'resvg-py': version('resvg-py'), 'pillow': version('pillow')},
              'renderConfig': {'width': 128, 'dpi': 96, 'skipSystemFonts': True},
              'svgRendered': len(svg_rows), 'pngFullyDecoded': len(png_rows), 'blankImages': 0,
              'pngDimensions': dict(sorted(Counter(f'{r["width"]}x{r["height"]}' for r in png_rows).items())),
              'resultDigest': digest(json_bytes(rows)),
              'scope': 'All SVG rendered by resvg and all PNG decoded by Pillow with nonempty alpha. '
                       'This does not assert pixel equality between different upstream formats or printable mesh validity.'}
    target = 'docs/assets/artwork-render-audit.json'
    if args.write:
        write(target, json_bytes(report))
    else:
        check(local(target).read_bytes() == json_bytes(report), 'Stale artwork render audit')

    # Representative references plus original sources known to have mixed content.
    names = ['svg/emoji_u1f600.svg', 'svg/emoji_u2764.svg', 'svg/emoji_u1f44d_1f3fd.svg',
             'svg/emoji_u1f468_200d_1f469_200d_1f467_200d_1f466.svg',
             'svg/emoji_u0031_20e3.svg', 'svg/emoji_u1faea.svg',
             'third_party/region-flags/waved-svg/emoji_u1f1fb_1f1f3.svg',
             'third_party/region-flags/svg/VN.svg', 'third_party/region-flags/svg/AS.svg',
             'third_party/region-flags/svg/MX-MIC.svg', 'third_party/region-flags/svg/MX-NAY.svg']
    art = json.loads(local(BASE + 'artwork-cat.json').read_text(encoding='utf-8'))
    names += [item['path'] for item in art['items'] if item['hasRasterImages']]
    names = list(dict.fromkeys(names))
    sheet = Image.new('RGB', (800, ((len(names) + 3) // 4) * 182), '#e8e8ec')
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(names):
        preview = local(evidence / (name + '.png'))
        check(preview.exists(), f'Missing visual sample: {name}')
        with Image.open(preview) as image:
            image.thumbnail((154, 128))
            x, y = (index % 4) * 200, (index // 4) * 182
            sheet.paste(image, (x + (200 - image.width) // 2, y + 6), image)
            label = name.split('/')[-1]
            draw.text((x + 6, y + 140), label[:30], fill='black')
            draw.text((x + 6, y + 155), '/'.join(name.split('/')[:-1])[-30:], fill='black')
    sheet.save(local(evidence / 'contact-sheet.png'))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
