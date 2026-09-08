"""Verify already prepared local inputs. No fetching, installing or source mutation."""
import pathlib,os,json,hashlib,zipfile
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve();repo=pathlib.Path(os.environ['PROJECT_ROOT']).resolve()
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
source_records=json.loads((run/'inputs/dependency-source-files.json').read_text())
summary=[]
for source in source_records:
 root=run/'work/deps'/source['name']
 for member in source['files']:
  path=root/member['path']
  if not path.resolve().is_relative_to(run) or sha(path)!=member['sha256']:raise RuntimeError('Prepared source changed: '+str(path))
 tree=hashlib.sha256(''.join(x['path']+':'+x['sha256'].upper()+'\n' for x in sorted(source['files'],key=lambda x:x['path'])).encode()).hexdigest()
 pins={'manifold':'3f1ee0cb9a5281422b6691eac8d1aac798ae7a409b569a0bb6ed343254df19fc',
       'clipper2-derived':'6316dc4c346683b329f362b78d9d2c324ad628175716f1ccd280c12d305a62cb',
       'harfbuzz-original':'f83e0b89e8a075adfcf338ab875bb71304f7c12143f1867f63024a213e0a31bf'}
 if tree!=pins[source['name']]:raise RuntimeError('Dependency tree pin mismatch: '+source['name'])
 summary.append({'name':source['name'],'fileCount':len(source['files']),'treeSha256':tree})
root=run/'work/deps/lib3mf-src';archive=run/'work/deps/lib3mf-2.5.0-source-with-submodules.zip'
if sha(archive)!='46914f7c7a82ee0839fdd09b339daf621540d5c8d8904b2a0449fd67353dd7cb':raise RuntimeError('lib3MF archive pin')
derived=json.loads((root/'.arch-printing-prepared.json').read_text())
if derived['derivedCmakeSha256']!='2dabcae25d0a5e89c78a4af44d9450f8101d80ff0deb65692864cf04b8a08993':raise RuntimeError('lib3MF patch pin')
records=[]
with zipfile.ZipFile(archive) as z:
 for entry in z.infolist():
  if entry.is_dir():continue
  expected=hashlib.sha256(z.read(entry)).hexdigest()
  if entry.filename=='CMakeLists.txt':expected=derived['derivedCmakeSha256']
  if sha(root/entry.filename)!=expected:raise RuntimeError('lib3MF source mutation '+entry.filename)
  records.append({'path':entry.filename,'sha256':expected})
tree=hashlib.sha256(''.join(x['path']+':'+x['sha256']+'\n' for x in sorted(records,key=lambda x:x['path'])).encode()).hexdigest()
summary.append({'name':'lib3mf-derived','fileCount':len(records),'treeSha256':tree,'archiveSha256':sha(archive)})
result={'verdict':'pass','configureDownloads':False,'scope':'all prepared dependency source bytes and pinned archive/patch; no network operation','sources':summary}
(run/'evidence/source-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
