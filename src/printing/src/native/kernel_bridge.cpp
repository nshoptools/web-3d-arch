#include "kernel_bridge.h"
#include "arch3mf_internal.hpp"
#include "runtime.h"
#include <cstring>
#include <stdexcept>
namespace {
void ensure(bool value,const char* code){if(!value)throw std::runtime_error(code);}
uint32_t word(const uint8_t* p){
 return uint32_t(p[0])|(uint32_t(p[1])<<8)|(uint32_t(p[2])<<16)|(uint32_t(p[3])<<24);
}
}
uint32_t arch3mf_kernel_abi_version(){return arch_abi_version();}
int32_t arch3mf_add_snapshot_part(void* context,uint32_t handle,uint32_t generation,
 uint32_t part_index,const char* name,uint32_t material){
 try{
  ensure(arch_abi_version()==2,"CORE_ABI_MISMATCH");
  const uint32_t length=arch_snapshot_len(handle);
  const uint8_t* bytes=arch_snapshot_ptr(handle);
  ensure(bytes&&length>=128&&length<=256u*1024u*1024u,"SNAPSHOT_LEASE_INVALID");
  auto at=[&](uint32_t offset){ensure(uint64_t(offset)+4<=length,"SNAPSHOT_LAYOUT");return word(bytes+offset);};
  ensure(at(0)==0x48435241&&at(4)==1&&at(8)==128&&at(12)==length,"SNAPSHOT_FORMAT");
  ensure(generation>0&&generation<0xffffffff&&at(16)==generation,"SNAPSHOT_GENERATION");
  const uint32_t nv=at(20),nf=at(24),np=at(28),vo=at(48),fo=at(52),po=at(56);
  ensure(nv>0&&nv<=1000000&&nf>0&&nf<=2000000&&np>0&&np<=128,"MESH_BUDGET");
  ensure(vo>=128&&vo%8==0&&fo%4==0&&po%8==0&&
    uint64_t(vo)+uint64_t(nv)*24<=fo&&uint64_t(fo)+uint64_t(nf)*12<=po&&
    uint64_t(po)+uint64_t(np)*40<=length,"SNAPSHOT_LAYOUT");
  ensure(part_index<np,"SNAPSHOT_PART_INDEX");
  const uint32_t part=po+part_index*40,vs=at(part),vc=at(part+4),ts=at(part+8),tc=at(part+12);
  ensure(vc>=4&&tc>=4&&uint64_t(vs)+vc<=nv&&uint64_t(ts)+tc<=nf,"SNAPSHOT_PART_RANGE");
  const auto* vertices=bytes+vo+uint64_t(vs)*24;
  const auto* triangles=bytes+fo+uint64_t(ts)*12;
  ensure(reinterpret_cast<uintptr_t>(vertices)%alignof(double)==0&&
    reinterpret_cast<uintptr_t>(triangles)%alignof(uint32_t)==0,"SNAPSHOT_ALIGNMENT");
  const uint32_t endian=1;ensure(*reinterpret_cast<const uint8_t*>(&endian)==1,"SNAPSHOT_ENDIAN");
  return arch3mf_add_part_range(context,name,reinterpret_cast<const double*>(vertices),vc,
    reinterpret_cast<const uint32_t*>(triangles),tc,vs,material);
 }catch(const std::exception& e){return arch3mf_reject(context,e.what());}
 catch(...){return arch3mf_reject(context,"SNAPSHOT_BRIDGE_FAILURE");}
}
