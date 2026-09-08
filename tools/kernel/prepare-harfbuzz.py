"""Prepare and byte-verify the pinned original HB tree. Requires project env."""
import hashlib, json, os, pathlib, tarfile, urllib.request

root = pathlib.Path(os.environ['PROJECT_ROOT']).resolve(strict=True)
run = pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve(strict=True)
assert run.is_relative_to(root) and run != root
pin = json.loads((root/'docs/development/toolchain-lock.json').read_text())['harfbuzz']
archive = root/'.toolchain/archives'/('harfbuzz-'+pin['revision']+'.tar.gz')
tree = root/'.toolchain/harfbuzz-original'
def confined(path):
    assert path.resolve().is_relative_to(root) and path.resolve() != root
    for ancestor in [path, *path.parents]:
        if ancestor == root: break
        assert not ancestor.is_symlink() and not (ancestor.exists() and ancestor.is_junction())
    return path
for target in [archive, tree]: confined(target)
if not archive.exists():
    archive.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(pin['source'], archive)
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest().lower() == pin['archiveSha256'].lower(), 'HarfBuzz archive SHA mismatch'
inventory=[]
with tarfile.open(archive, 'r:gz') as source:
    prefix='harfbuzz-'+pin['revision']
    accepted=[]
    for member in source.getmembers():
        path=pathlib.PurePosixPath(member.name)
        assert path.parts and path.parts[0]==prefix and '..' not in path.parts and ':' not in member.name and '\\' not in member.name
        relative=pathlib.PurePosixPath(*path.parts[1:])
        if str(relative)=='.':
            assert member.isdir(); continue
        if member.issym():
            assert str(relative)=='CLAUDE.md' and member.linkname=='AGENTS.md', 'Unexpected source symlink'
            continue
        assert member.isfile() or member.isdir(), 'Unsupported archive member'
        dest=confined(tree/relative)
        accepted.append((member,dest,relative))
    create=not tree.exists()
    if create: tree.mkdir(parents=True)
    for member,dest,relative in accepted:
        if member.isdir():
            if create: dest.mkdir(parents=True,exist_ok=True)
            continue
        payload=source.extractfile(member).read()
        if create:
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(payload)
        assert dest.is_file() and dest.read_bytes()==payload, 'Original source changed: '+str(relative)
        inventory.append({'path':str(relative),'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload)})
    expected={record['path'] for record in inventory}
    for actual in tree.rglob('*'):
        confined(actual)
        if actual.is_file(): assert actual.relative_to(tree).as_posix() in expected, 'Unpinned source file'
report={'revision':pin['revision'],'archiveSha256':pin['archiveSha256'],'omittedSymlink':'CLAUDE.md -> AGENTS.md','compiledSourcesModified':False,'files':inventory}
(run/'evidence/harfbuzz-original.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('Verified HarfBuzz original source:',len(inventory),'files')
