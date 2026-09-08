# Run from a PowerShell process that has dot-sourced tools/development/env.ps1.
import pathlib,os,json,hashlib,urllib.request,zipfile,subprocess,sys
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
package=pathlib.Path(__file__).resolve().parent.parent
pins=json.loads((package/'docs/pins.json').read_text())
verify_only='--verify-only' in sys.argv
def confined(p):
 p=p.resolve()
 if not p.is_relative_to(run):raise RuntimeError('Path escapes own run')
 for a in [p,*p.parents]:
  if a==run:break
  if a.is_symlink() or (a.exists() and a.is_junction()):raise RuntimeError('Link in output path')
 return p
def obtain(url,path,sha,size=None):
 path=confined(path);path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():
  if verify_only:raise RuntimeError('Missing pinned file '+str(path))
  urllib.request.urlretrieve(url,path)
 if size is not None and path.stat().st_size!=size:raise RuntimeError('Length mismatch')
 if hashlib.file_digest(path.open('rb'),'sha256').hexdigest()!=sha:raise RuntimeError('SHA-256 mismatch')
 return path
for a in pins['core']['archives']:
 path=obtain(a['url'],run/'work/deps'/a['name'],a['sha256'],a['size'])
 if verify_only or a['name']=='lib3mf-wasm-2.5.0.zip':continue
 dest=confined(run/'work/deps'/('lib3mf-src' if 'source-with-submodules' in a['name'] else 'lib3mf-win'))
 marker=dest/'.archive-sha256'
 if marker.exists():
  if marker.read_text()!=a['sha256']:raise RuntimeError('Extraction pin mismatch')
  continue
 if dest.exists():raise RuntimeError('Existing unmarked extraction; use a fresh directory/run, do not overwrite work')
 dest.mkdir(parents=True)
 with zipfile.ZipFile(path) as z:
  if len(z.infolist())>30000 or sum(i.file_size for i in z.infolist())>800000000:raise RuntimeError('Archive budget')
  for i in z.infolist():
   p=pathlib.PurePosixPath(i.filename)
   if p.is_absolute() or '..' in p.parts or ':' in i.filename or '\\' in i.filename or (i.external_attr>>16)&0xf000==0xa000:raise RuntimeError('Unsafe archive path')
   confined(dest/i.filename)
  z.extractall(dest)
 marker.write_text(a['sha256'])
obtain('https://www.w3.org/2001/xml.xsd',run/'inputs/xml.xsd','61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c',8836)
if not verify_only:subprocess.run([sys.executable,'-B',str(package/'tools/patch-lib3mf.py'),str(run/'work/deps/lib3mf-src')],check=True)
print('Pinned downloads verified'+(' (no extraction)' if verify_only else ' and prepared'))
