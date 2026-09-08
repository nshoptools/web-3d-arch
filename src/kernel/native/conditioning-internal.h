#pragma once
#include "conditioning.h"
#include <clipper2/clipper.h>
#include <memory>
namespace arch_condition {
struct Context {
  ArchConditionOptions options{};
  ArchConditionLedger ledger{};
  const ArchBuildControl* control=nullptr;
  uint32_t progress=560;
  std::vector<uint8_t> proof;
  void tick(uint64_t amount=1);
};
void validate_options(const ArchConditionOptions*);
void graph(std::vector<Clipper2Lib::Paths64>& regions,Context&);
void mesh(const ArchSceneView&,Context&);
}
ArchScene* arch_scene_build_condition_impl(const int64_t*,uint32_t,const uint32_t*,uint32_t,
    const uint32_t*,uint32_t,const uint32_t*,const uint32_t*,const double*,const double*,
    const ArchBuildControl*,arch_condition::Context*,char*,uint32_t);