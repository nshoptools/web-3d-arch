"""Offline pinned lib3mf source derivation; all paths inside own run."""
import pathlib,os,zipfile,hashlib,json,sys,difflib
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
archive=pathlib.Path(sys.argv[1]).resolve();dest=pathlib.Path(sys.argv[2]).resolve()
if not archive.is_relative_to(run) or not dest.is_relative_to(run):raise RuntimeError('Own run only')
pin='46914f7c7a82ee0839fdd09b339daf621540d5c8d8904b2a0449fd67353dd7cb'
with archive.open('rb') as f:
 if hashlib.file_digest(f,'sha256').hexdigest()!=pin:raise RuntimeError('Source archive pin mismatch')
with zipfile.ZipFile(archive) as z:
 original=z.read('CMakeLists.txt').decode()
 current=(dest/'CMakeLists.txt').read_text() if dest.exists() else None
 if current is None:
  for i in z.infolist():
   p=pathlib.PurePosixPath(i.filename)
   if p.is_absolute() or '..' in p.parts or ':' in i.filename or '\\' in i.filename or (i.external_attr>>16)&0xf000==0xa000:raise RuntimeError('Unsafe archive')
  z.extractall(dest)
derived=original.replace('if(NOT EXISTS ${CMAKE_BINARY_DIR}/libzip)','if(NOT EXISTS ${CMAKE_CURRENT_BINARY_DIR}/libzip/CMakeCache.txt)')
needle='list(APPEND LIBZIP_CONFIGURE_ARGS "-DCMAKE_C_BYTE_ORDER=LITTLE_ENDIAN")'
replacement='''list(APPEND LIBZIP_CONFIGURE_ARGS "-DCMAKE_C_BYTE_ORDER=LITTLE_ENDIAN"
        "-DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}"
        "-DCMAKE_MAKE_PROGRAM=${CMAKE_MAKE_PROGRAM}" "-G" "${CMAKE_GENERATOR}"
        "-DCMAKE_C_FLAGS=${CMAKE_C_FLAGS}" "-DCMAKE_CXX_FLAGS=${CMAKE_CXX_FLAGS}"
        "-DCMAKE_POLICY_VERSION_MINIMUM=3.5")'''
if derived.count(needle)!=1:raise RuntimeError('Patch context mismatch')
derived=derived.replace(needle,replacement)
derived=derived.replace('MESSAGE( STATUS "CMD_ERROR:" ${CMD_ERROR})','''if(NOT CMD_ERROR EQUAL 0)
      message(FATAL_ERROR "Pinned libzip header configure failed: ${CMD_ERROR}")
    endif()''')
if current is not None and current.replace('\r\n','\n') not in [original.replace('\r\n','\n'),derived.replace('\r\n','\n')]:
 raise RuntimeError('Refusing to overwrite modified source')
dest.mkdir(parents=True,exist_ok=True)
if current!=derived:(dest/'CMakeLists.txt').write_text(derived,encoding='utf-8',newline='\n')
manifest={'archiveSha256':pin,'sourceVersion':'2.5.0','patch':'cross target header configuration and fatal configure error',
 'originalCmakeSha256':hashlib.sha256(original.encode()).hexdigest(),'derivedCmakeSha256':hashlib.sha256((dest/'CMakeLists.txt').read_bytes()).hexdigest()}
(dest/'.arch-printing-prepared.json').write_text(json.dumps(manifest,indent=2))
(run/'inputs/lib3mf-derivation.patch').write_text(''.join(difflib.unified_diff(original.splitlines(True),derived.splitlines(True),fromfile='a/CMakeLists.txt',tofile='b/CMakeLists.txt')))
print(json.dumps(manifest))
