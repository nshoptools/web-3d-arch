"""Prepare pinned dependencies for the integrated kernel, without a frozen
application preimage or a private copy of product source. No network access.
Run after tools/development/env.ps1; --archive selects original lib3MF ZIP.
"""
import pathlib,os,json,hashlib,subprocess,sys,argparse
repo=pathlib.Path(os.environ['PROJECT_ROOT']).resolve()
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
package=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--archive',type=pathlib.Path,required=True);args=parser.parse_args()
pins=json.loads((package/'docs/unified-pins.json').read_text(encoding='utf-8-sig'))
def checked(path,root):
 path=path.absolute()
 if not path.resolve().is_relative_to(root):raise RuntimeError('Path outside allowed root')
 for ancestor in [path,*path.parents]:
  if ancestor==root:break
  if ancestor.is_symlink() or (ancestor.exists() and ancestor.is_junction()):raise RuntimeError('Link refused')
 return path
def sha(path):
 with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def put(path,data):
 checked(path,run)
 if path.exists():
  if path.read_bytes()!=data:raise RuntimeError('Refusing changed output: '+str(path))
 else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
records=[]
for name in ['manifold','clipper2-derived','harfbuzz-original']:
 source=checked(repo/'.toolchain'/name,repo);files=[]
 for current,dirs,names in os.walk(source,followlinks=False):
  dirs[:]=sorted(d for d in dirs if d!='.git')
  for directory in dirs:checked(pathlib.Path(current)/directory,repo)
  for filename in sorted(names):
   path=checked(pathlib.Path(current)/filename,repo)
   files.append({'path':path.relative_to(source).as_posix(),'sha256':sha(path),'bytes':path.stat().st_size})
 files.sort(key=lambda item:item['path'])
 tree=hashlib.sha256(''.join(item['path']+':'+item['sha256'].upper()+'\n' for item in files).encode()).hexdigest()
 pin=next(p for p in pins['preparedTrees'] if p['name']==name)
 if tree!=pin['treeSha256'] or len(files)!=pin['fileCount']:raise RuntimeError('Original/derived source pin mismatch '+name)
 for item in files:put(run/'work/deps'/name/item['path'],(source/item['path']).read_bytes())
 records.append({'name':name,'files':files})
put(run/'inputs/dependency-source-files.json',json.dumps(records,indent=2).encode())
archive=checked(args.archive,repo)
if sha(archive)!=pins['lib3mf']['archiveSha256'] or archive.stat().st_size!=pins['lib3mf']['archiveBytes']:raise RuntimeError('lib3MF original archive pin mismatch')
local=run/'work/deps/lib3mf-2.5.0-source-with-submodules.zip';put(local,archive.read_bytes())
subprocess.run([sys.executable,'-B',str(package/'tools/prepare-lib3mf.py'),str(local),str(run/'work/deps/lib3mf-src')],check=True)
subprocess.run([sys.executable,'-B',str(package/'tools/verify-unified-inputs.py')],check=True)
print('Integrated-kernel printing dependencies prepared inside current run.')
