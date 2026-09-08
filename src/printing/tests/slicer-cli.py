# Exact official Windows portable Bambu CLI; every invocation uses fresh own-run paths.
# Snapmaker 2.2.1 is not invoked: its launcher initializes an unconfined Sentry path.
import os,pathlib,subprocess,json,hashlib,zipfile,ctypes as ct,datetime,uuid
r=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
def confined(path):
 path=pathlib.Path(path)
 for ancestor in [path,*path.parents]:
  if ancestor==r:break
  if ancestor.is_symlink() or (ancestor.exists() and ancestor.is_junction()):raise RuntimeError('Output path contains a link')
 resolved=path.resolve()
 if not resolved.is_relative_to(r):raise RuntimeError('Path escapes own run')
 return resolved
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
root=confined(r/'work/deps/bambu-portable');exe=confined(root/'bambu-studio.exe')
archive=confined(r/'work/deps/Bambu_Studio_win-v02.08.02.60-20260814163036.zip')
if archive.stat().st_size!=473014652 or digest(archive)!='85844d64a927ab36e3fd9bbef16da22adde1d25b3dcba4e8f58cef89db0c1291':
 raise RuntimeError('Official portable archive pin mismatch')
binary_hash=digest(exe)
with zipfile.ZipFile(archive) as z:
 names=[n for n in z.namelist() if pathlib.PurePosixPath(n).name.lower()=='bambu-studio.exe']
 if len(names)!=1:raise RuntimeError('Ambiguous portable executable')
 with z.open(names[0]) as f:
  if hashlib.file_digest(f,'sha256').hexdigest()!=binary_hash:raise RuntimeError('Executable differs from pinned portable')
# Read the PE VERSIONINFO through the Windows API without launching the program.
version=ct.WinDLL('version',use_last_error=True)
version.GetFileVersionInfoSizeW.argtypes=[ct.c_wchar_p,ct.POINTER(ct.c_uint32)]
version.GetFileVersionInfoSizeW.restype=ct.c_uint32
version.GetFileVersionInfoW.argtypes=[ct.c_wchar_p,ct.c_uint32,ct.c_uint32,ct.c_void_p]
version.VerQueryValueW.argtypes=[ct.c_void_p,ct.c_wchar_p,ct.POINTER(ct.c_void_p),ct.POINTER(ct.c_uint32)]
unused=ct.c_uint32();size=version.GetFileVersionInfoSizeW(str(exe),ct.byref(unused))
if not size:raise RuntimeError('PE version unavailable')
buffer=ct.create_string_buffer(size)
if not version.GetFileVersionInfoW(str(exe),0,size,buffer):raise RuntimeError('PE version read failed')
value=ct.c_void_p();length=ct.c_uint32()
if not version.VerQueryValueW(buffer,'\\',ct.byref(value),ct.byref(length)) or length.value<52:raise RuntimeError('PE fixed version unavailable')
fixed=ct.cast(value,ct.POINTER(ct.c_uint32))
actual=(fixed[2]>>16,fixed[2]&65535,fixed[3]>>16,fixed[3]&65535)
if fixed[0]!=0xfeef04bd or actual!=(2,8,2,60):raise RuntimeError('Requires Bambu Studio 02.08.02.60')
invocation=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
base=confined(r/'evidence/bambu-dryslice'/invocation);base.mkdir(parents=True,exist_ok=False)
data=confined(r/'cache/bambu-cli'/invocation);data.mkdir(parents=True,exist_ok=False)
records=[]
for shape in ['adjacent','cube']:
 out=confined(base/shape);out.mkdir()
 source=confined(r/'evidence/slicer-inputs'/('centered-'+shape+'.3mf'))
 artifact=out/('sliced-'+shape+'.3mf')
 args=[str(exe),'--datadir',str(data),'--outputdir',str(out),'--slice','0','--export-3mf',artifact.name,str(source)]
 with (out/'stdout-stderr.log').open('wb') as log:
  try:code=subprocess.run(args,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=60,creationflags=subprocess.CREATE_NO_WINDOW).returncode
  except subprocess.TimeoutExpired:code='timeout'
 result=json.loads((out/'result.json').read_text()) if (out/'result.json').exists() else None
 ok=code==0 and result is not None and result.get('return_code')==0 and artifact.is_file()
 record={'invocation':invocation,'shape':shape,'command':args,'exitCode':code,'verdict':'pass' if ok else 'fail','result':result,
  'outputDirectory':str(out),'inputFile':str(source),'outputFile':str(artifact),'inputSha256':digest(source),
  'outputSha256':digest(artifact) if artifact.exists() else None,'binarySha256':binary_hash,'peVersion':list(actual),
  'archiveSha256':'85844d64a927ab36e3fd9bbef16da22adde1d25b3dcba4e8f58cef89db0c1291',
  'scope':'local dry slice only; no physical qualification'}
 (out/'execution.json').write_text(json.dumps(record,indent=2))
 records.append(record);print(shape,code,record['verdict'],flush=True)
(r/'evidence/bambu-dryslice-records.json').write_text(json.dumps(records,indent=2))
if any(x['verdict']!='pass' for x in records):raise RuntimeError('Selected Bambu dry slice failed; inspect fresh invocation evidence')
