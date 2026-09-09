#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "arch3mf.h"
#include "lib3mf_implicit.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
using namespace Lib3MF;
namespace {
constexpr uint32_t MAX_VERTICES=1000000, MAX_FACES=2000000, MAX_PARTS=128, MAX_MATERIALS=64;
constexpr uint32_t MAX_OUTPUT=64u*1024u*1024u;
constexpr double READBACK_TEXT_TOLERANCE_MM=2e-6;
struct Part { PMeshObject mesh; std::vector<sPosition> vertices; std::vector<sTriangle> faces; uint32_t material; };
struct Context {
  PWrapper wrapper; PModel model; PBaseMaterialGroup materials; PComponentsObject assembly;
  std::vector<uint32_t> propertyIds; std::vector<Part> parts; std::vector<uint8_t> bytes;
  std::string error; bool finished=false; uint32_t vertices=0,faces=0,attachmentBytes=0;
  Context() {
    wrapper=CWrapper::loadLibrary();
    uint32_t a,b,c; wrapper->GetLibraryVersion(a,b,c);
    if(a!=2||b!=5||c!=0) throw std::runtime_error("LIB3MF_VERSION: requires 2.5.0");
    model=wrapper->CreateModel(); model->SetUnit(eModelUnit::MilliMeter);
    materials=model->AddBaseMaterialGroup(); assembly=model->AddComponentsObject();
    assembly->SetName("web-3d-arch assembly");
    model->AddCustomContentType("json","application/json");
    model->AddCustomContentType("config","application/xml");
  }
};
void require(bool ok,const char* code) { if(!ok) throw std::runtime_error(code); }
void text(const char* s) {
  require(s && std::char_traits<char>::length(s)<=4096,"TEXT_BOUND");
  for(const unsigned char* p=(const unsigned char*)s;*p;++p)
    require(*p>=32 || *p==9 || *p==10 || *p==13,"XML_CONTROL");
}
template<class F> int32_t call(void* p,F fn) {
  if(!p) return -1; auto& c=*static_cast<Context*>(p);
  if(!c.error.empty()) return -1;
  try { require(!c.finished,"TRANSACTION_CLOSED"); return fn(c); }
  catch(const std::exception& e) {c.error=e.what();c.bytes.clear();return -1;}
  catch(...) {c.error="LIB3MF_FAILURE";c.bytes.clear();return -1;}
}
void topology(const std::vector<sPosition>& v,const std::vector<sTriangle>& f) {
  using Edge=std::pair<uint32_t,uint32_t>;
  std::map<Edge,std::vector<std::pair<uint32_t,int>>> edges;
  std::vector<std::map<uint32_t,std::vector<uint32_t>>> links(v.size());
  std::set<std::array<uint32_t,3>> unique;
  std::vector<double> volumes; volumes.reserve(f.size());
  for(uint32_t ti=0;ti<f.size();++ti) {
    auto a=f[ti].m_Indices[0],b=f[ti].m_Indices[1],c=f[ti].m_Indices[2];
    require(a<v.size()&&b<v.size()&&c<v.size(),"INDEX_BOUND");
    require(a!=b&&b!=c&&a!=c,"DEGENERATE_FACE");
    std::array<uint32_t,3> sorted{a,b,c}; std::sort(sorted.begin(),sorted.end());
    require(unique.insert(sorted).second,"DUPLICATE_FACE");
    std::array<double,3> ab{},ac{},cross{};
    for(int k=0;k<3;++k){ab[k]=double(v[b].m_Coordinates[k])-v[a].m_Coordinates[k];ac[k]=double(v[c].m_Coordinates[k])-v[a].m_Coordinates[k];}
    cross={ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]};
    require(cross[0]*cross[0]+cross[1]*cross[1]+cross[2]*cross[2]>1e-20,"DEGENERATE_FACE");
    // Translation-invariant volume about the first vertex.
    double vol=0; for(int k=0;k<3;++k) vol+=(double(v[a].m_Coordinates[k])-v[0].m_Coordinates[k])*cross[k]/6.;
    volumes.push_back(vol);
    uint32_t ids[3]={a,b,c};
    for(int k=0;k<3;++k){
      auto x=ids[k],y=ids[(k+1)%3],z=ids[(k+2)%3];
      edges[{std::min(x,y),std::max(x,y)}].push_back({ti,x<y?1:-1});
      links[x][y].push_back(z);links[x][z].push_back(y);
    }
  }
  std::vector<std::vector<uint32_t>> adjacent(f.size());
  for(const auto& item:edges) {
    const auto& fs=item.second;
    require(fs.size()==2,"EDGE_NOT_MANIFOLD");
    require(fs[0].second+fs[1].second==0,"INCONSISTENT_WINDING");
    adjacent[fs[0].first].push_back(fs[1].first); adjacent[fs[1].first].push_back(fs[0].first);
  }
  for(const auto& link:links) {
    require(!link.empty(),"UNREFERENCED_VERTEX");
    for(const auto& node:link) require(node.second.size()==2,"VERTEX_NOT_MANIFOLD");
    std::set<uint32_t> seen;std::vector<uint32_t> todo{link.begin()->first};
    while(!todo.empty()){auto u=todo.back();todo.pop_back();if(!seen.insert(u).second)continue;for(auto q:link.at(u))todo.push_back(q);}
    require(seen.size()==link.size(),"VERTEX_NOT_MANIFOLD");
  }
  std::vector<bool> seen(f.size(),false);
  for(uint32_t i=0;i<f.size();++i) if(!seen[i]){
    double vol=0;std::vector<uint32_t> todo{i};
    while(!todo.empty()){auto t=todo.back();todo.pop_back();if(seen[t])continue;seen[t]=true;vol+=volumes[t];for(auto q:adjacent[t])todo.push_back(q);}
    require(vol>1e-12,"NONPOSITIVE_COMPONENT_VOLUME");
  }
}
}
uint32_t arch3mf_abi_version(){return 1;}
void* arch3mf_create(){try{return new Context();}catch(...){return nullptr;}}
void arch3mf_destroy(void* p){delete static_cast<Context*>(p);}
const char* arch3mf_error(void* p){return p?static_cast<Context*>(p)->error.c_str():"CONTEXT_ALLOCATION_OR_VERSION";}
int32_t arch3mf_add_material(void* p,const char* name,uint32_t rgba){
 return call(p,[&](Context& c)->int32_t{
  text(name); require(c.parts.empty()&&c.materials->GetCount()<MAX_MATERIALS,"MATERIAL_COUNT_OR_ORDER");
  require((rgba&255)==255,"TRANSLUCENT_MATERIAL_UNSUPPORTED");
  sColor color{};color.m_Red=(rgba>>24)&255;color.m_Green=(rgba>>16)&255;color.m_Blue=(rgba>>8)&255;color.m_Alpha=255;
  c.propertyIds.push_back(c.materials->AddMaterial(name,color)); return int32_t(c.propertyIds.size()-1);
 });
}
int32_t arch3mf_add_part(void* p,const char* name,const double* xyz,uint32_t nv,const uint32_t* indices,uint32_t nf,uint32_t material){
 return arch3mf_add_part_range(p,name,xyz,nv,indices,nf,0,material);
}
int32_t arch3mf_reject(void* p,const char* code){
 return call(p,[&](Context&)->int32_t{throw std::runtime_error(code);});
}
int32_t arch3mf_add_part_range(void* p,const char* name,const double* xyz,uint32_t nv,const uint32_t* indices,uint32_t nf,uint32_t vertex_base,uint32_t material){
 return call(p,[&](Context& c)->int32_t{
  text(name); require(xyz&&indices&&nv>=4&&nf>=4,"EMPTY_MESH");
  require(nv<=MAX_VERTICES-c.vertices&&nf<=MAX_FACES-c.faces&&c.parts.size()<MAX_PARTS,"MESH_BUDGET");
  require(material<c.materials->GetCount(),"MATERIAL_SLOT_MISMATCH");
  Part part;part.vertices.resize(nv);part.faces.resize(nf);part.material=material;
  for(uint32_t i=0;i<nv;++i)for(int k=0;k<3;++k){
    auto d=xyz[3*i+k];require(std::isfinite(d)&&std::abs(d)<=10000,"NONFINITE_OR_COORDINATE_BOUND");
    part.vertices[i].m_Coordinates[k]=float(d);
    require(std::abs(d-double(float(d)))<=0.001,"OUTPUT_FLOAT_BUDGET");
  }
  for(uint32_t i=0;i<nf;++i)for(int k=0;k<3;++k){
    const auto index=indices[3*i+k];
    require(index>=vertex_base&&uint64_t(index)-vertex_base<nv,"INDEX_BOUND");
    part.faces[i].m_Indices[k]=index-vertex_base;
  }
  topology(part.vertices,part.faces);
  part.mesh=c.model->AddMeshObject();part.mesh->SetName(name);part.mesh->SetGeometry(part.vertices,part.faces);
  part.mesh->SetObjectLevelProperty(c.materials->GetUniqueResourceID(),c.propertyIds.at(material));
  require(part.mesh->IsManifoldAndOriented(),"LIB3MF_TOPOLOGY_REJECTED");
  auto id=part.mesh->GetUniqueResourceID();
  c.assembly->AddComponent(part.mesh.get(),c.wrapper->GetIdentityTransform());
  c.vertices+=nv;c.faces+=nf;c.parts.push_back(std::move(part));
  return int32_t(id);
 });
}
uint32_t arch3mf_assembly_id(void* p){return p?static_cast<Context*>(p)->assembly->GetUniqueResourceID():0;}
int32_t arch3mf_metadata(void* p,const char* ns,const char* name,const char* value){
 return call(p,[&](Context& c)->int32_t{text(ns);text(name);text(value);c.model->GetMetaDataGroup()->AddMetaData(ns,name,value,"xs:string",false);return 0;});
}
int32_t arch3mf_attachment(void* p,const char* path,const uint8_t* data,uint32_t n){
 return call(p,[&](Context& c)->int32_t{
  text(path);std::string s(path);
  const std::set<std::string> allowed{"/Metadata/project_settings.config","/Metadata/model_settings.config","/Metadata/printing-manifest.json"};
  require(allowed.count(s)!=0,"ATTACHMENT_PATH");
  require(data&&n<=2*1024*1024&&c.attachmentBytes<=4*1024*1024-n,"ATTACHMENT_BUDGET");
  std::vector<uint8_t> bytes(data,data+n);
  c.model->AddAttachment(s,"http://schemas.web3darch.local/printing/2026/attachment")->ReadFromBuffer(bytes);
  c.attachmentBytes+=n;return 0;
 });
}
static void requireIdentity(const sTransform& t,const char* code){
  for(int row=0;row<4;++row)for(int col=0;col<3;++col)
    require(t.m_Fields[row][col]==(row==col?1.f:0.f),code);
}
static void validateWritten(Context& c,const std::vector<uint8_t>& bytes){
  auto read=c.wrapper->CreateModel();auto reader=read->QueryReader("3mf");reader->SetStrictModeActive(true);reader->ReadFromBuffer(bytes);
  require(reader->GetWarningCount()==0,"LIB3MF_READBACK_WARNING");
  require(read->GetUnit()==eModelUnit::MilliMeter,"READBACK_UNIT");
  auto groups=read->GetBaseMaterialGroups();
  require(groups->MoveNext(),"READBACK_MATERIAL_GROUP");
  auto materials=groups->GetCurrentBaseMaterialGroup();
  require(!groups->MoveNext()&&materials->GetModelResourceID()==c.materials->GetModelResourceID(),"READBACK_MATERIAL_GROUP");
  const auto materialId=materials->GetUniqueResourceID();
  std::vector<uint32_t> properties;materials->GetAllPropertyIDs(properties);
  require(properties==c.propertyIds,"READBACK_MATERIAL_COUNT");
  for(auto id:properties){
    require(materials->GetName(id)==c.materials->GetName(id),"READBACK_MATERIAL_NAME");
    auto a=materials->GetDisplayColor(id),b=c.materials->GetDisplayColor(id);
    require(a.m_Red==b.m_Red&&a.m_Green==b.m_Green&&a.m_Blue==b.m_Blue&&a.m_Alpha==b.m_Alpha,"READBACK_MATERIAL_COLOR");
  }
  auto it=read->GetMeshObjects();uint32_t count=0;
  while(it->MoveNext()){
    auto mesh=it->GetCurrentMeshObject();
    require(count<c.parts.size(),"READBACK_PART_COUNT");
    const auto& expected=c.parts[count++];
    require(mesh->GetName()==expected.mesh->GetName(),"READBACK_PART_NAME");
    std::vector<sPosition> rv;std::vector<sTriangle> rf;
    mesh->GetVertices(rv);mesh->GetTriangleIndices(rf);
    require(rv.size()==expected.vertices.size()&&rf.size()==expected.faces.size(),"READBACK_MESH_COUNTS");
    // lib3MF serialises the float32 coordinates as decimal text with six places (its writer default).
    // Below 16 mm the float32 grid is finer than that text, so the value read back can land on the
    // neighbouring float, at most one ulp (< 2e-6 mm) away; above 16 mm the text is exact. That is
    // the writer's own quantisation, inside the 0.001 mm float budget already declared, not a
    // corrupted file, so the read-back is held to that quantum instead of bit equality (audit R3:
    // every real scene failed with READBACK_VERTICES; only integer-and-half fixtures passed).
    for(size_t i=0;i<rv.size();++i)for(int k=0;k<3;++k)require(std::abs(double(rv[i].m_Coordinates[k])-double(expected.vertices[i].m_Coordinates[k]))<=READBACK_TEXT_TOLERANCE_MM,"READBACK_VERTICES");
    for(size_t i=0;i<rf.size();++i)for(int k=0;k<3;++k)require(rf[i].m_Indices[k]==expected.faces[i].m_Indices[k],"READBACK_FACES");
    uint32_t pid=0,index=0;require(mesh->GetObjectLevelProperty(pid,index)&&pid==materialId&&index==c.propertyIds.at(expected.material),"READBACK_MATERIAL");
    topology(rv,rf);
  }
  require(count==c.parts.size(),"READBACK_PART_COUNT");
  auto assemblies=read->GetComponentsObjects();
  require(assemblies->MoveNext(),"READBACK_ASSEMBLY");
  auto assembly=assemblies->GetCurrentComponentsObject();
  require(!assemblies->MoveNext()&&assembly->GetModelResourceID()==c.assembly->GetModelResourceID(),"READBACK_ASSEMBLY");
  require(assembly->GetName()==c.assembly->GetName()&&assembly->GetComponentCount()==c.parts.size(),"READBACK_ASSEMBLY");
  for(uint32_t i=0;i<c.parts.size();++i){
    auto component=assembly->GetComponent(i);
    require(component->GetObjectResource()->GetModelResourceID()==c.parts[i].mesh->GetModelResourceID(),"READBACK_COMPONENT_REFERENCE");
    requireIdentity(component->GetTransform(),"READBACK_COMPONENT_TRANSFORM");
  }
  auto builds=read->GetBuildItems();uint32_t nb=0;
  while(builds->MoveNext()){
    auto item=builds->GetCurrent();++nb;
    require(item->GetObjectResourceID()==assembly->GetUniqueResourceID(),"READBACK_BUILD_REFERENCE");
    requireIdentity(item->GetObjectTransform(),"READBACK_BUILD_TRANSFORM");
  }
  require(nb==1,"READBACK_BUILD");
}
int32_t arch3mf_finish(void* p){
 return call(p,[&](Context& c)->int32_t{
  require(!c.parts.empty(),"EMPTY_MESH");
  c.model->AddBuildItem(c.assembly.get(),c.wrapper->GetIdentityTransform());
  auto writer=c.model->QueryWriter("3mf");writer->SetStrictModeActive(true);
  std::vector<uint8_t> bytes;writer->WriteToBuffer(bytes);
  require(bytes.size()<=MAX_OUTPUT,"OUTPUT_BUDGET");
  validateWritten(c,bytes);
  c.bytes=std::move(bytes);c.finished=true;return 0;
 });
}
const uint8_t* arch3mf_bytes(void* p){auto* c=static_cast<Context*>(p);return c&&c->finished&&c->error.empty()?c->bytes.data():nullptr;}
uint32_t arch3mf_size(void* p){auto* c=static_cast<Context*>(p);return c&&c->finished&&c->error.empty()?uint32_t(c->bytes.size()):0;}

int32_t arch3mf_validate_output(void* p,const uint8_t* data,uint32_t size){
 if(!p)return -1;auto& c=*static_cast<Context*>(p);
 if(!c.error.empty())return -1;
 try{
  require(c.finished&&data&&size>0&&size<=MAX_OUTPUT,"OUTPUT_BOUND");
  std::vector<uint8_t> bytes(data,data+size);validateWritten(c,bytes);return 0;
 }catch(const std::exception& e){c.error=e.what();c.bytes.clear();return -1;}
 catch(...){c.error="LIB3MF_OUTPUT_READBACK";c.bytes.clear();return -1;}
}
