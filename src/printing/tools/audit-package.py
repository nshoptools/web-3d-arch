"""Check the actual unified production surfaces for internal profile data."""
import pathlib,os,json,hashlib
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
package=pathlib.Path(__file__).resolve().parent.parent
def confined(path):
 if not path.resolve().is_relative_to(run):raise RuntimeError('Audit output escaped own run')
 return path
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
surfaces=sorted(p for p in (package/'src').rglob('*') if p.is_file())
bundle=run/'work/unified-production/printing.mjs'
surfaces += [bundle,run/'work/unified-module/arch-kernel.mjs',run/'work/unified-module/arch-kernel.wasm',
 run/'work/rust-unified-native/release/examples/unified_printing.exe']
for path in surfaces:confined(path)
needles={b'MAU3MF_',b'u1-inconsistent-slots.3mf',b'fixtures/slicer-profiles/'}
gcode_count=0
for name in ['bambu','u1']:
 snapshot=json.loads((run/'inputs/printing'/(name+'-profile.json')).read_text())
 for key,value in snapshot['payload']['settings'].items():
  if 'gcode' not in key.lower():continue
  for literal in (value if isinstance(value,list) else [value]):
   if isinstance(literal,str) and len(literal)>80:
    gcode_count+=1
    needles.add(literal.encode());needles.add(json.dumps(literal,ensure_ascii=False)[1:-1].encode())
 assert snapshot['sha256'].encode() not in bundle.read_bytes()
assert gcode_count>0
# The printing JS is injected into the existing module; it contains no WASM loader.
for needle in [b'WebAssembly.instantiate',b'new WebAssembly.Instance',b'arch-kernel.mjs',b'arch3mf.mjs']:
 assert needle not in bundle.read_bytes(),needle
records=[]
for path in surfaces:
 data=path.read_bytes()
 if any(needle in data for needle in needles):raise RuntimeError('Internal fixture content in production surface: '+str(path))
 records.append({'path':path.relative_to(run).as_posix(),'bytes':len(data),'sha256':digest(path)})
result={'verdict':'pass','scope':'source, production JS bundle, unified WASM and native executable; not a rights clearance',
 'internalProfileGcodeStringsChecked':gcode_count,'fixtureMarkersAbsent':True,'printingBundleHasNoWasmLoader':True,'productionSurfaces':records}
confined(run/'evidence/package-audit.json').write_text(json.dumps(result,indent=2))
print('Production fixture audit passed:',len(records),'surfaces;',gcode_count,'internal profile G-code strings checked')
