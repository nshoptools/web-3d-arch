"""Offline private-copy preparation. Never edits main or .toolchain.
Use --main-input with the frozen source capture when main has advanced.
Existing files must equal the expected bytes; no overwrite of changed work.
"""
import pathlib,os,json,hashlib,shutil,sys,re,subprocess,argparse
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
repo=pathlib.Path(os.environ['PROJECT_ROOT']).resolve()
package=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--main-input',type=pathlib.Path,default=repo)
parser.add_argument('--oracle-source',type=pathlib.Path)
args=parser.parse_args()
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def path_ok(p,root):
 p=p.absolute()
 if not p.resolve().is_relative_to(root):raise RuntimeError('Path outside allowed root: '+str(p))
 for a in [p,*p.parents]:
  if a==root:break
  if a.is_symlink() or (a.exists() and a.is_junction()):raise RuntimeError('Link refused: '+str(a))
 return p
def put(dest,data):
 dest=path_ok(dest,run)
 if dest.exists():
  if dest.read_bytes()!=data:
   try:equal=dest.suffix=='.json' and json.loads(dest.read_bytes())==json.loads(data)
   except ValueError:equal=False
   if not equal:raise RuntimeError('Refusing changed file: '+str(dest))
  return
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
def copy_tree(source,dest):
 path_ok(source,repo);path_ok(dest,run);records=[]
 for current,dirs,names in os.walk(source,followlinks=False):
  dirs[:]=sorted(d for d in dirs if d!='.git')
  for d in dirs:path_ok(pathlib.Path(current)/d,repo)
  for name in sorted(names):
   src=path_ok(pathlib.Path(current)/name,repo);relative=src.relative_to(source).as_posix()
   put(dest/relative,src.read_bytes())
   records.append({'path':relative,'sha256':sha(src),'bytes':src.stat().st_size})
 return sorted(records,key=lambda x:x['path'])
def patch_text(original,patch):
 lines=original.splitlines(True);out=[];cursor=0;diff=patch.splitlines(True);i=2
 while i<len(diff):
  m=re.match(r'@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@',diff[i])
  if not m:raise RuntimeError('Unsupported patch')
  start=int(m.group(1))-1
  if start<cursor:raise RuntimeError('Overlapping patch')
  out.extend(lines[cursor:start]);cursor=start;i+=1
  while i<len(diff) and not diff[i].startswith('@@ '):
   line=diff[i];i+=1
   if line[0] in ' -':
    if cursor>=len(lines) or lines[cursor]!=line[1:]:raise RuntimeError('Patch preimage changed')
    cursor+=1
   if line[0] in ' +':out.append(line[1:])
 out.extend(lines[cursor:]);return ''.join(out)
manifest=json.loads((package/'integration/main-preimage.json').read_text())
patches={'src/kernel/native/CMakeLists.txt':'kernel-native-CMakeLists.txt.patch','src/kernel/build.rs':'kernel-build.rs.patch'}
for entry in manifest:
 relative=entry['path'];src=path_ok(args.main_input/relative,repo)
 if sha(src)!=entry['sha256']:raise RuntimeError('Main preimage mismatch: '+relative)
 put(run/'inputs/main'/relative,src.read_bytes())
 data=src.read_bytes()
 if relative in patches:
  data=patch_text(data.decode().replace('\r\n','\n'),(package/'integration'/patches[relative]).read_text()).encode()
 put(run/'work/private-main'/relative,data)
put(run/'inputs/main-source-manifest.json',(package/'integration/main-preimage.json').read_bytes())
put(run/'work/private-main/src/kernel/examples/unified_printing.rs',(package/'tests/unified-native.rs').read_bytes())
all_records=[]
for name in ['manifold','clipper2-derived','harfbuzz-original']:
 all_records.append({'name':name,'files':copy_tree(repo/'.toolchain'/name,run/'work/deps'/name)})
# Cargo verifies locked crate checksums; all later Cargo calls are --offline --locked.
copy_tree(repo/'.toolchain/cargo/registry',run/'cache/cargo/registry')
receipt=run/'inputs/dependency-source-files.json'
if receipt.exists():
 prior=json.loads(receipt.read_text())
 for source in prior:source['files'].sort(key=lambda x:x['path'])
 if prior!=all_records:raise RuntimeError('Prepared source receipt changed')
else:put(receipt,json.dumps(all_records,indent=2).encode())
font=path_ok(repo/'src/assets/fonts/ttf/Inter.ttf',repo)
if sha(font)!='29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031':raise RuntimeError('Test font pin')
put(run/'inputs/Inter.ttf',font.read_bytes())
schema=run/'inputs/xml.xsd'
if sha(schema)!='61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c':raise RuntimeError('Place pinned W3C xml.xsd in own inputs first')
if args.oracle_source:copy_tree(args.oracle_source,run/'work/deps/python')
subprocess.run([sys.executable,'-B',str(package/'tools/prepare-lib3mf.py'),str(run/'work/deps/lib3mf-2.5.0-source-with-submodules.zip'),str(run/'work/deps/lib3mf-src')],check=True)
subprocess.run([sys.executable,'-B',str(package/'tools/verify-unified-inputs.py')],check=True)
print('Offline sources prepared; seed npm from pinned local tarballs as documented.')
