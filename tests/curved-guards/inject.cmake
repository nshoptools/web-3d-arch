# Optional synthetic prepared-source ABI probe for the curved replay target.
# No production CMake/project change; select with
# -DCMAKE_PROJECT_arch_curved_products_replay_INCLUDE=<this file>.
if(PROJECT_NAME STREQUAL "arch_curved_products_replay" AND NOT TARGET prepared_guard_probe)
  add_executable(prepared_guard_probe "${CMAKE_CURRENT_LIST_DIR}/prepared-probe.cpp")
  target_link_libraries(prepared_guard_probe PRIVATE arch_source_assembly)
  if(EMSCRIPTEN)
    target_compile_options(prepared_guard_probe PRIVATE -fexceptions)
    target_link_options(prepared_guard_probe PRIVATE -fexceptions -sNODERAWFS=1 -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4194304)
    set_target_properties(prepared_guard_probe PROPERTIES SUFFIX ".js")
  endif()
endif()
