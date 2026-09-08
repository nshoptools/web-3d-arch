import pathlib,os,json,hashlib,re
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
commands=json.loads((run/'work/unified-wasm/compile_commands.json').read_text())
printing=[x for x in commands if '/printing/' in x['directory'].replace('\\','/') or '/lib3mf-src/' in x['file'].replace('\\','/') or '/printing/src/native/' in x['file'].replace('\\','/')]
assert printing
for entry in printing:
 command=entry.get('command',' '.join(entry.get('arguments',[])))
 assert '-pthread' in command,(entry['file'],'pthread missing')
 if entry['file'].endswith(('.cpp','.cxx','.cc')):assert '-fexceptions' in command,(entry['file'],'exceptions missing')
archives=[]
for name in ['work/unified-wasm/printing/libarch3mf_static.a','work/unified-wasm/printing/lib3mf/lib3mf.a']:
 data=(run/name).read_bytes();assert data[:8]==b'!<arch>\n'
 offset=8;members=0;dates=set()
 while offset<len(data):
  header=data[offset:offset+60];assert len(header)==60 and header[58:60]==b'`\n'
  size=int(header[48:58]);dates.add(header[16:28].decode().strip());members+=1;offset+=60+size+(size%2)
 assert offset==len(data) and dates<={'','0'},dates
 archives.append({'path':name,'members':members,'deterministicArchiveTimestamps':sorted(dates),'sha256':hashlib.sha256(data).hexdigest()})
imports=(run/'evidence/native-static-imports.txt').read_text()
assert 'lib3mf.dll' not in imports.lower()
cache=(run/'work/unified-wasm/CMakeCache.txt').read_text()
for setting in ['MANIFOLD_DOWNLOADS:BOOL=OFF','FETCHCONTENT_FULLY_DISCONNECTED:BOOL=ON','LIB3MF_BUILD_SHARED:BOOL=OFF','LIB3MF_TESTS:BOOL=OFF']:
 assert setting in cache,setting
result={'verdict':'pass','printingCompileCommands':len(printing),'pthreadEveryPrintingObject':True,'exceptionsEveryPrintingCppObject':True,
 'archives':archives,'nativeLib3mfDllImported':False,'limitation':'Archive headers are deterministic; bit-identical clean MSVC/Rust builds across hosts are not claimed.'}
(run/'evidence/static-integration-audit.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
