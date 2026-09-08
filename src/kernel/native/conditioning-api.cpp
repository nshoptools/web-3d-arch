#include "conditioning-internal.h"
#include <atomic>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <vector>
namespace {
void fail(char* e,uint32_t n,const char* s){if(e&&n){std::strncpy(e,s,n-1);e[n-1]=0;}}
void put32(std::vector<uint8_t>& b,uint32_t n){for(int i=0;i<4;++i)b.push_back(uint8_t(n>>(8*i)));}
void put64(std::vector<uint8_t>& b,uint64_t n){for(int i=0;i<8;++i)b.push_back(uint8_t(n>>(8*i)));}
std::atomic<uint64_t> serial{1};
std::atomic<uint32_t> live_proposals{0};
void reserve_proposal(){
 auto value=live_proposals.load(std::memory_order_relaxed);
 while(value<4){if(live_proposals.compare_exchange_weak(value,value+1,std::memory_order_relaxed))return;}
 throw std::runtime_error("CONDITIONING_PROPOSAL_LIMIT");
}
uint64_t next_serial(){
 auto value=serial.load(std::memory_order_relaxed);
 while(value!=UINT64_MAX){if(serial.compare_exchange_weak(value,value+1,std::memory_order_relaxed))return value;}
 throw std::runtime_error("CONDITIONING_SERIAL_EXHAUSTED");
}
}
struct ArchConditionProposal {
 ArchConditionProposal(){reserve_proposal();}
 ~ArchConditionProposal(){live_proposals.fetch_sub(1,std::memory_order_relaxed);}
 ArchConditionProposal(const ArchConditionProposal&)=delete;
 ArchConditionProposal& operator=(const ArchConditionProposal&)=delete;
 std::unique_ptr<ArchScene,decltype(&arch_scene_destroy)> scene{nullptr,arch_scene_destroy};
 ArchConditionLedger ledger{};
 uint8_t head[72]{};
 std::vector<uint8_t> descriptor,proof;
};
extern "C" ArchConditionProposal* arch_condition_prepare(
 const int64_t* xy,uint32_t np,const uint32_t* ends,uint32_t nc,const uint32_t* se,uint32_t ns,
 const uint32_t* rules,const uint32_t* colors,const double* z0,const double* z1,
 const ArchConditionOptions* options,const uint8_t* head,const ArchBuildControl* control,char* error,uint32_t cap){
 fail(error,cap,"");
 try{
  arch_condition::validate_options(options);
  if(!head)throw std::runtime_error("CONDITIONING_INVALID_HEAD");
  bool populated=false,generation=false;for(int i=8;i<72;++i)populated|=head[i]!=0;for(int i=0;i<8;++i)generation|=head[i]!=0;
  if(!populated||!generation)throw std::runtime_error("CONDITIONING_INVALID_HEAD");
  auto p=std::make_unique<ArchConditionProposal>();
  arch_condition::Context c;c.options=*options;c.control=control;
  c.ledger.version=1;c.ledger.bytes=128;c.ledger.algorithm=1;c.ledger.requires_confirmation=1;
  p->scene.reset(arch_scene_build_condition_impl(xy,np,ends,nc,se,ns,rules,colors,z0,z1,control,&c,error,cap));
  if(!p->scene)return nullptr;
  p->ledger=c.ledger;p->proof=std::move(c.proof);std::memcpy(p->head,head,72);
  auto s=next_serial();
  auto& b=p->descriptor;
  put32(b,0x444e4f43);put32(b,1);put32(b,272);put32(b,0);put64(b,s);
  b.insert(b.end(),head,head+72);
  put32(b,options->version);put32(b,options->bytes);put32(b,options->chord_linf_nm);put32(b,options->max_output_points);
  put64(b,options->max_work_units);
  for(auto u:{options->prior_bound_nm,options->total_budget_nm,options->prior_verified,options->budget_class,options->max_part_points,options->reserved})put32(b,u);
  const auto& l=p->ledger;
  for(auto u:{l.version,l.bytes,l.algorithm,l.requires_confirmation,l.source_vertices,l.output_vertices,l.source_edges,l.output_edges,
     l.chains,l.pins,l.components,l.loops,l.changed,l.conditioning_linf_nm,l.conditioning_euclidean_nm,l.mesh_conversion_nm,
     l.float32_nm,l.prior_nm,l.total_nm,l.budget_nm,l.source_occurrences,l.output_occurrences,l.part_count,l.reserved})put32(b,u);
  put64(b,l.work_units);put64(b,l.intersection_pairs);put64(b,l.nesting_tests);put32(b,0);put32(b,0);
  if(b.size()!=272)throw std::runtime_error("CONDITIONING_DESCRIPTOR_INVARIANT");
  if(control&&control->cancelled&&control->cancelled(control->data))throw std::runtime_error("CANCELLED");
  return p.release();
 }catch(const std::bad_alloc&){fail(error,cap,"RESOURCE_EXHAUSTED");}
 catch(const std::exception& e){fail(error,cap,e.what());}
 catch(...){fail(error,cap,"CONDITIONING_INTERNAL_ERROR");}
 return nullptr;
}
extern "C" int arch_condition_preview(const ArchConditionProposal* p,ArchSceneView* v,ArchConditionLedger* l){
 if(!p||!p->scene||!v||!l)return 0;*l=p->ledger;return arch_scene_view(p->scene.get(),v);
}
extern "C" const uint8_t* arch_condition_descriptor(const ArchConditionProposal* p,uint32_t* n){
 if(n)*n=0;if(!p||!p->scene||!n)return nullptr;*n=static_cast<uint32_t>(p->descriptor.size());return p->descriptor.data();
}
extern "C" const uint8_t* arch_condition_proof(const ArchConditionProposal* p,uint32_t* n){
 if(n)*n=0;if(!p||!p->scene||!n)return nullptr;*n=static_cast<uint32_t>(p->proof.size());return p->proof.data();
}
extern "C" ArchScene* arch_condition_confirm(ArchConditionProposal* p,const uint8_t* head,const uint8_t* accepted,
 uint32_t bytes,uint32_t confirm,const ArchBuildControl* control,char* error,uint32_t cap){
 fail(error,cap,"");
 if(!p||!p->scene){fail(error,cap,"CONDITIONING_PROPOSAL_CONSUMED");return nullptr;}
 if(confirm!=1){fail(error,cap,"CONDITIONING_CONFIRMATION_REQUIRED");return nullptr;}
 if(!head||std::memcmp(head,p->head,72)){fail(error,cap,"CONDITIONING_STALE_HEAD");return nullptr;}
 if(!accepted||bytes!=p->descriptor.size()||std::memcmp(accepted,p->descriptor.data(),bytes)){
  fail(error,cap,"CONDITIONING_PROPOSAL_MISMATCH");return nullptr;
 }
 if(control&&control->cancelled&&control->cancelled(control->data)){fail(error,cap,"CANCELLED");return nullptr;}
 return p->scene.release();
}
extern "C" void arch_condition_destroy(ArchConditionProposal* p){delete p;}