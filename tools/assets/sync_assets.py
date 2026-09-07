"""Fetch official, pinned assets. Default: restore using the existing hash lock.

Use --refresh-lock only when intentionally changing the source pins below.
All writes are constrained to this repository; font bytes are never converted.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / 'src/assets/assets-lock.json'
GF_REV = '5e35378e6bda803962ee6fd257e444a7d459660d'
OPENTYPE_VERSION = '2.0.0'
UNICODE_VERSION = '17.0'
# Preserve legacy UI labels/filenames and include every style in each selected family.
FAMILIES = [
    ('Alfa Slab One', 'AlfaSlabOne', 'alfaslabone'),
    ('Anton', 'Anton', 'anton'),
    ('Arizonia', 'Arizonia', 'arizonia'),
    ('Baloo 2', 'Baloo2', 'baloo2'),
    ('Bangers', 'Bangers', 'bangers'),
    ('Be Vietnam Pro', 'BeVietnamPro', 'bevietnampro'),
    ('Be Vietnam Pro Đậm', 'BeVietnamProBold', 'bevietnampro'),
    ('Bungee', 'Bungee', 'bungee'),
    ('Carattere', 'Carattere', 'carattere'),
    ('Cherry Bomb One', 'CherryBombOne', 'cherrybombone'),
    ('Coiny', 'Coiny', 'coiny'),
    ('Comfortaa', 'Comfortaa', 'comfortaa'),
    ('Dancing Script', 'DancingScript', 'dancingscript'),
    ('Fruktur', 'Fruktur', 'fruktur'),
    ('Great Vibes', 'GreatVibes', 'greatvibes'),
    ('Inter', 'Inter', 'inter'),
    ('Lobster', 'Lobster', 'lobster'),
    ('Merriweather', 'Merriweather', 'merriweather'),
    ('Montserrat', 'Montserrat', 'montserrat'),
    ('Nunito', 'Nunito', 'nunito'),
    ('Oswald', 'Oswald', 'oswald'),
    ('Pacifico', 'Pacifico', 'pacifico'),
    ('Patrick Hand', 'PatrickHand', 'patrickhand'),
    ('Pattaya', 'Pattaya', 'pattaya'),
    ('Playfair Display', 'PlayfairDisplay', 'playfairdisplay'),
    ('Praise', 'Praise', 'praise'),
    ('Protest Riot', 'ProtestRiot', 'protestriot'),
    ('Quicksand', 'Quicksand', 'quicksand'),
    ('Story Script', 'StoryScript', 'storyscript'),
    ('Vina Sans', 'VinaSans', 'vinasans'),
    ('Yeseva One', 'YesevaOne', 'yesevaone'),
    ('Noto Emoji', 'NotoEmoji', 'notoemoji'),
]


def local(relative):
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT) or path == ROOT:
        raise ValueError(f'Path escapes project: {relative}; resolved={path!s}; root={ROOT!s}')
    return path


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'web-3d-arch-assets/1'}), timeout=90) as response:
        return response.read()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(relative, data):
    path = local(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def field(block, name):
    match = re.search(r'^\s*' + name + r': ("(?:\\.|[^"\\])*"|\S+)', block, re.M)
    if not match:
        raise ValueError(f'Missing {name} in metadata')
    raw = match.group(1)
    return json.loads(raw) if raw.startswith('"') else raw


def google_url(slug, filename):
    return f'https://raw.githubusercontent.com/google/fonts/{GF_REV}/ofl/{slug}/{quote(filename)}'


def unpack_package(data, integrity):
    algorithm, expected = integrity.split('-', 1)
    actual = base64.b64encode(hashlib.new(algorithm, data).digest()).decode('ascii')
    if actual != expected:
        raise ValueError('npm package integrity mismatch')
    result = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive.getmembers():
            if member.isdir():
                continue
            if not member.isfile() or not member.name.startswith('package/'):
                raise ValueError(f'Unexpected package member: {member.name}')
            relative = member.name.removeprefix('package/')
            if '..' in Path(relative).parts or '\\' in relative or ':' in relative:
                raise ValueError(f'Unsafe package member: {relative}')
            result[member.name] = archive.extractfile(member).read()
    return result


def refresh():
    files = []

    def save(path, url, data, **extra):
        write(path, data)
        return dict(path=path, url=url, bytes=len(data), sha256=digest(data), **extra)

    def get_family(slug):
        base = 'emoji' if slug == 'notoemoji' else 'fonts'
        result = []
        metadata_url = google_url(slug, 'METADATA.pb')
        metadata_bytes = fetch(metadata_url)
        result.append(save(f'src/assets/{base}/upstream/{slug}/METADATA.pb', metadata_url, metadata_bytes, role='metadata'))
        metadata = metadata_bytes.decode('utf-8')
        license_path = f'src/assets/{base}/licenses/{slug}/OFL.txt'
        license_url = google_url(slug, 'OFL.txt')
        result.append(save(license_path, license_url, fetch(license_url), role='license'))
        blocks = re.findall(r'^fonts \{\n(.*?)^\}', metadata, re.M | re.S)
        for selected in blocks:
            style = field(selected, 'style')
            weight = int(field(selected, 'weight'))
            filename = field(selected, 'filename')
            family = field(selected, 'name')
            legacy = [row for row in FAMILIES if row[2] == slug and style == 'normal'
                      and weight == (700 if row[1] == 'BeVietnamProBold' else 400)]
            if len(legacy) > 1:
                raise ValueError(f'Ambiguous legacy font: {filename}')
            if legacy:
                label, basename, _ = legacy[0]
                font_id = basename.lower()
            else:
                basename = filename.removesuffix('.ttf')
                label = f'{family} {weight}' + (' Nghiêng' if style == 'italic' else '')
                font_id = f'{slug}-{style}-{weight}'
            url = google_url(slug, filename)
            data = fetch(url)
            if data[:4] != b'\x00\x01\x00\x00':
                raise ValueError(f'{slug}: expected an original TrueType sfnt')
            result.append(save(
                f'src/assets/{base}/ttf/{basename}.ttf', url, data, role='font',
                id=font_id, name=label, family=family, style=style, familyId=slug,
                weight=weight, category=field(metadata, 'category').lower(),
                sourceFilename=filename, license=license_path,
                assetType='emoji' if slug == 'notoemoji' else 'text',
            ))
        return result

    with ThreadPoolExecutor(max_workers=6) as pool:
        for result in pool.map(get_family, sorted({row[2] for row in FAMILIES})):
            files.extend(result)
    package_url = f'https://registry.npmjs.org/opentype.js/{OPENTYPE_VERSION}'
    package = json.loads(fetch(package_url))
    distribution = package['dist']
    archive = fetch(distribution['tarball'])
    for member, data in unpack_package(archive, distribution['integrity']).items():
        files.append(save('src/assets/opentype/' + member.removeprefix('package/'),
                          distribution['tarball'], data, role='library', archiveMember=member))
    unicode_sources = [
        ('src/assets/emoji/upstream/unicode/emoji-test.txt',
         'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt', 'emoji-data'),
        ('src/assets/emoji/licenses/unicode/LICENSE.txt',
         'https://www.unicode.org/license.txt', 'license'),
    ]
    for path, url, role in unicode_sources:
        files.append(save(path, url, fetch(url), role=role))
    lock = {
        'schemaVersion': 1,
        'googleFonts': {'repository': 'https://github.com/google/fonts', 'commit': GF_REV},
        'opentype': {'package': 'opentype.js', 'version': OPENTYPE_VERSION,
                     'registry': package_url, 'tarball': distribution['tarball'],
                     'integrity': distribution['integrity'], 'archiveSha256': digest(archive)},
        'unicode': {'version': UNICODE_VERSION},
        'files': sorted(files, key=lambda record: record['path']),
    }
    write(LOCK.relative_to(ROOT), json_bytes(lock))
    print(f'Pinned and downloaded {len(files)} original files.', flush=True)


def restore():
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    package = lock['opentype']
    archive_members = None
    for record in lock['files']:
        path = local(record['path'])
        if path.exists() and digest(path.read_bytes()) == record['sha256']:
            continue
        if 'archiveMember' in record:
            if archive_members is None:
                archive = fetch(package['tarball'])
                if digest(archive) != package['archiveSha256']:
                    raise ValueError('Locked package archive hash mismatch')
                archive_members = unpack_package(archive, package['integrity'])
            data = archive_members[record['archiveMember']]
        else:
            data = fetch(record['url'])
        if digest(data) != record['sha256'] or len(data) != record['bytes']:
            raise ValueError(f'Locked hash/size mismatch: {record["path"]}')
        write(record['path'], data)
        print(f'Restored {record["path"]}', flush=True)
    print('All locked files match.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-lock', action='store_true')
    arguments = parser.parse_args()
    refresh() if arguments.refresh_lock else restore()
