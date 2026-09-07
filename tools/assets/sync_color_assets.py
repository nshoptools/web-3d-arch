"""Fetch the complete published color font set and original color artwork.

Default restores files from the color hash lock. --refresh-lock reads the
pinned Git tree and downloads its archive inside the current project run.
Only selected original assets are written to src; no font/image is converted.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import PurePosixPath
import tarfile
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

from sync_assets import ROOT, digest, fetch, json_bytes, local, write

REVISION = '8998f5dd683424a73e2314a8c1f1e359c19e8742'
REPOSITORY = 'https://github.com/googlefonts/noto-emoji'
BASE = 'src/assets/emoji/color/'
LOCK = BASE + 'assets-lock.json'
PREFIXES = ('fonts/', 'svg/', 'png/', 'third_party/region-flags/svg/',
            'third_party/region-flags/waved-svg/', 'third_party/region-flags/png/')
METADATA = ('LICENSE', 'README.md', 'emoji_aliases.txt', 'unknown_flag_aliases.txt',
            'third_party/region-flags/LICENSE', 'third_party/region-flags/README.md',
            'third_party/region-flags/README.third_party', 'third_party/region-flags/AUTHORS')
EXTERNAL = [('licenses/Apache-2.0.txt', 'https://www.apache.org/licenses/LICENSE-2.0.txt')]


def blob_hash(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()


def refresh(source_archive=None):
    run = os.environ.get('PROJECT_REVIEW_RUN')
    if not run:
        raise ValueError('Dot-source tools/project-env.ps1 before downloading')
    run_path = local(run)
    tree_url = f'https://api.github.com/repos/googlefonts/noto-emoji/git/trees/{REVISION}?recursive=1'
    tree = json.loads(fetch(tree_url))
    if tree.get('truncated') or tree['sha'] != REVISION:
        raise ValueError('Incomplete or wrong Git tree')
    selected = {row['path']: row for row in tree['tree'] if row['type'] == 'blob' and
                (row['path'].startswith(PREFIXES) or row['path'] in METADATA)}
    archive_url = f'https://codeload.github.com/googlefonts/noto-emoji/tar.gz/{REVISION}'
    archive_path = local(source_archive) if source_archive else run_path / 'work' / f'noto-emoji-{REVISION}.tar.gz'
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    archive_hasher = hashlib.sha256()
    byte_count = 0
    last_notice = time.monotonic()
    if source_archive:
        with archive_path.open('rb') as archive_input:
            while chunk := archive_input.read(1024 * 1024):
                archive_hasher.update(chunk)
                byte_count += len(chunk)
    else:
        with urlopen(Request(archive_url, headers={'User-Agent': 'web-3d-arch-assets/1'}), timeout=90) as response:
            with archive_path.open('wb') as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    archive_hasher.update(chunk)
                    byte_count += len(chunk)
                    if time.monotonic() - last_notice > 15:
                        print(f'Archive: {byte_count // (1024 * 1024)} MiB received', flush=True)
                        last_notice = time.monotonic()
    records = []
    for_archive_prefix = f'noto-emoji-{REVISION}/'
    with tarfile.open(archive_path, mode='r:gz') as archive:
        for member in archive:
            if not member.name.startswith(for_archive_prefix):
                continue
            name = member.name.removeprefix(for_archive_prefix)
            if name not in selected:
                continue
            row = selected[name]
            relative = PurePosixPath(name)
            if relative.is_absolute() or '..' in relative.parts or '\\' in name:
                raise ValueError(f'Unsafe archive member: {name}')
            if row['mode'] == '120000':
                if not member.issym():
                    raise ValueError(f'Expected source symlink: {name}')
                data = member.linkname.encode('utf-8')
                # Keep original link bytes as metadata, never install symlinks.
                destination = 'upstream/links/' + name + '.txt'
                role = 'source-link'
            else:
                if not member.isfile():
                    raise ValueError(f'Expected original file: {name}')
                data = archive.extractfile(member).read()
                destination = name
                role = 'color-font' if name.endswith('.ttf') else 'svg' if name.endswith('.svg') else 'png' if name.endswith('.png') else 'upstream-document'
            if len(data) != row['size'] or blob_hash(data) != row['sha']:
                raise ValueError(f'Git blob mismatch: {name}')
            write(BASE + destination, data)
            record = {'path': destination, 'sourcePath': name,
                      'url': f'https://raw.githubusercontent.com/googlefonts/noto-emoji/{REVISION}/{quote(name)}',
                      'role': role, 'bytes': len(data), 'sha256': digest(data), 'gitBlobSha1': row['sha']}
            if role == 'source-link':
                record['linkTarget'] = member.linkname
            records.append(record)
    if {record['sourcePath'] for record in records} != set(selected):
        raise ValueError('Some selected assets were not in the archive')
    for destination, url in EXTERNAL:
        data = fetch(url)
        write(BASE + destination, data)
        records.append({'path': destination, 'url': url, 'role': 'license',
                        'bytes': len(data), 'sha256': digest(data)})
    lock = {'schemaVersion': 1, 'repository': REPOSITORY, 'commit': REVISION,
            'archive': {'url': archive_url, 'sha256': archive_hasher.hexdigest(), 'bytes': byte_count},
            'selection': {'prefixes': list(PREFIXES), 'metadata': list(METADATA),
                          'scope': 'Every published color font, all original SVG artwork, every published PNG resolution and original region flag SVG/PNG variants.'},
            'sourceTree': {'url': tree_url, 'selectedCount': len(selected), 'truncated': False},
            'files': sorted(records, key=lambda record: record['path'])}
    write(LOCK, json_bytes(lock))
    print(json.dumps(dict(Counter(record['role'] for record in records))), flush=True)


def restore():
    lock = json.loads(local(LOCK).read_text(encoding='utf-8'))
    restored = 0
    for record in lock['files']:
        path = local(BASE + record['path'])
        if path.exists() and digest(path.read_bytes()) == record['sha256']:
            continue
        data = fetch(record['url'])
        if len(data) != record['bytes'] or digest(data) != record['sha256'] or (
                'gitBlobSha1' in record and blob_hash(data) != record['gitBlobSha1']):
            raise ValueError(f'Locked original changed: {record["path"]}')
        write(BASE + record['path'], data)
        restored += 1
    print(f'Color assets match the lock; {restored} restored.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-lock', action='store_true')
    parser.add_argument('--archive', help='Reuse a repository-local original archive, still verified against every selected Git blob')
    args = parser.parse_args()
    if args.archive and not args.refresh_lock:
        parser.error('--archive requires --refresh-lock')
    refresh(args.archive) if args.refresh_lock else restore()
