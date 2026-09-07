"""Restore the pinned HarfBuzz JavaScript/WASM distribution. --refresh-lock vendors it."""
import argparse
import json
from sync_assets import fetch, digest, unpack_package, local, write, json_bytes

VERSION = '1.6.1'
JS_REVISION = '8aa047b90387790b255b118cf45ad11691a38910'
NATIVE_REVISION = '36cb489cb02ce4b92099669ba9f9bea348eff93f'
BASE = 'src/assets/harfbuzz/'
LOCK = BASE + 'assets-lock.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-lock', action='store_true')
    args = parser.parse_args()
    if args.refresh_lock:
        url = f'https://registry.npmjs.org/harfbuzzjs/{VERSION}'
        package = json.loads(fetch(url))
        if package['gitHead'] != JS_REVISION:
            raise ValueError('Unexpected HarfBuzz.js source revision')
        dist = package['dist']
        archive = fetch(dist['tarball'])
        members = unpack_package(archive, dist['integrity'])
        records = []
        for member, data in members.items():
            name = member.removeprefix('package/')
            write(BASE + name, data)
            records.append({'path': name, 'archiveMember': member, 'bytes': len(data), 'sha256': digest(data)})
        native_url = f'https://raw.githubusercontent.com/harfbuzz/harfbuzz/{NATIVE_REVISION}/COPYING'
        native_license = fetch(native_url)
        write(BASE + 'licenses/harfbuzz-COPYING', native_license)
        records.append({'path': 'licenses/harfbuzz-COPYING', 'url': native_url,
                        'bytes': len(native_license), 'sha256': digest(native_license)})
        lock = {'schemaVersion': 1, 'package': 'harfbuzzjs', 'version': VERSION,
                'sourceCommit': JS_REVISION, 'nativeSourceCommit': NATIVE_REVISION,
                'registry': url, 'tarball': dist['tarball'], 'integrity': dist['integrity'],
                'archiveSha256': digest(archive), 'files': sorted(records, key=lambda r: r['path'])}
        write(LOCK, json_bytes(lock))
    else:
        lock = json.loads(local(LOCK).read_text(encoding='utf-8'))
        members = None
        for record in lock['files']:
            path = local(BASE + record['path'])
            if path.exists() and digest(path.read_bytes()) == record['sha256']:
                continue
            if 'url' in record:
                data = fetch(record['url'])
            elif members is None:
                archive = fetch(lock['tarball'])
                if digest(archive) != lock['archiveSha256']:
                    raise ValueError('HarfBuzz archive hash mismatch')
                members = unpack_package(archive, lock['integrity'])
            if 'archiveMember' in record:
                data = members[record['archiveMember']]
            if digest(data) != record['sha256'] or len(data) != record['bytes']:
                raise ValueError('HarfBuzz member hash mismatch')
            write(BASE + record['path'], data)
    print(f'HarfBuzz {lock["version"]}: {len(lock["files"])} original distribution/license files verified.')


if __name__ == '__main__':
    main()
