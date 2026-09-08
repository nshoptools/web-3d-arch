# Include after the parent's pinned Manifold target. Default STL/OBJ + general
# CSG need no lib3MF; that optional decoder remains disabled.
# For optional3MF only, parent supplies lib3mf + pinned expat/header trees.
function(arch_attach_mesh_import)
 if(TARGET arch_mesh_import_static)
  return()
 endif()
 if(ARCHMI_ENABLE_3MF_EXTENSION AND NOT ARCHMI_LIBZIP_CONFIG)
  message(FATAL_ERROR "Set ARCHMI_LIBZIP_CONFIG to this target's prepared libzip header directory")
 endif()
 get_filename_component(_archmi_package "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/.." ABSOLUTE)
 add_subdirectory("${_archmi_package}" "${CMAKE_CURRENT_BINARY_DIR}/importer")
endfunction()

# Both aliases are provided by one add_subdirectory call; no second Manifold.
function(arch_attach_imported_csg)
 arch_attach_mesh_import()
 if(NOT TARGET arch_imported_csg_static)
  message(FATAL_ERROR "Existing importer is an older package: integrate the checked0.2.0 files first")
 endif()
endfunction()
