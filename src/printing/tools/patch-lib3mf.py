import pathlib,sys,os
p=pathlib.Path(sys.argv[1])/'CMakeLists.txt'
if not p.resolve().is_relative_to(pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()):raise RuntimeError('Patch target must be in own run')
original=p.read_text()
s=original
s=s.replace('if(NOT EXISTS ${CMAKE_BINARY_DIR}/libzip)','if(NOT EXISTS ${CMAKE_CURRENT_BINARY_DIR}/libzip)')
old='list(APPEND LIBZIP_CONFIGURE_ARGS "-DCMAKE_C_BYTE_ORDER=LITTLE_ENDIAN")'
new='''list(APPEND LIBZIP_CONFIGURE_ARGS "-DCMAKE_C_BYTE_ORDER=LITTLE_ENDIAN"
        "-DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}"
        "-DCMAKE_MAKE_PROGRAM=${CMAKE_MAKE_PROGRAM}"
        "-DCMAKE_POLICY_VERSION_MINIMUM=3.5" "-G" "${CMAKE_GENERATOR}")'''
if old in s:s=s.replace(old,new)
elif new not in s:raise RuntimeError('upstream patch context mismatch')
if s!=original:p.write_text(s,encoding='utf-8',newline='\n')
