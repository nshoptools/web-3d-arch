#include "imported_csg.h"
#include "internal.hpp"
#include "triangle_guard.hpp"
#include <manifold/manifold.h>
#include <manifold/mesh.h>
#include <algorithm>
#include <cstring>
#include <iomanip>
#include <sstream>
#include <unordered_map>
#include <numeric>
#include <cstddef>
static_assert(sizeof(ArchcsgPart)==40&&sizeof(ArchcsgPartBinding)==32&&sizeof(ArchcsgMaterial)==16&&sizeof(ArchcsgFaceOrigin)==16,"CSG flat ABI");
namespace {
using manifold::Manifold;using manifold::MeshGL64;using manifold::vec3;
struct Failure:std::runtime_error{uint32_t verdict;Failure(uint32_t v,const char*s):runtime_error(s),verdict(v){}};
void need(bool b,const char*s,uint32_t v=ARCHCSG_INVALID){if(!b)throw Failure(v,s);}
template<class T>void put(std::vector<uint8_t>&o,const T&x){auto p=reinterpret_cast<const uint8_t*>(&x);o.insert(o.end(),p,p+sizeof(T));}
struct Result{
 uint32_t verdict=ARCHCSG_GEOMETRY_PROPOSAL,leases=1,generation=0,ops=0,operation=UINT32_MAX;
 uint64_t revision=0,feature=0;
 std::vector<double> vertices;std::vector<uint32_t> triangles;
 std::vector<ArchcsgPart> parts;std::vector<ArchcsgFaceOrigin> origins;
 std::vector<uint8_t> descriptor;
 std::vector<std::shared_ptr<std::vector<uint8_t>>> originals;
 std::shared_ptr<const archmi::Context> sourceContext;
 std::string report,diagnostic,partReports,importReport,provenance;
 double tolerance=0;uint32_t materialRemap=0,aliasCount=0;
 std::string sourceReports,remaps,command,removed;
};
std::map<uint32_t,std::unique_ptr<Result>> results;uint32_t nextId=0xc5000001;std::string error;bool busy=false;
uint32_t u32(const uint8_t*p){return uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
double f64(const uint8_t*p){uint64_t q=uint64_t(u32(p))|uint64_t(u32(p+4))<<32;double x;std::memcpy(&x,&q,8);return x;}
struct Original{uint32_t side,part,first,count;};
struct Solid{
 Manifold mesh;uint32_t original,part,material,rgba,sourceIndex;
 uint64_t semantic,source,provenance;uint32_t side;
 // Only import-as-part retains input ordering for an exact geometry append.
 std::vector<double> exactVertices;std::vector<uint32_t> exactTriangles;bool reflected=false;
};
struct Job{
 const ArchcsgRequest&r;const ArchcsgControl&control;Result&o;manifold::ExecutionContext ctx;
 std::shared_ptr<const archmi::Context> imported;
 std::vector<Solid> generated,tools;
 std::map<uint32_t,Original> originalIDs;
 std::vector<uint32_t> selected;
 std::vector<ArchcsgMaterial> materials;
 std::array<double,12> transform;
 Job(const ArchcsgRequest&a,const ArchcsgControl&c,Result&x):r(a),control(c),o(x){}
 void tick(){
  need(++o.ops<=r.max_operations,"CSG_OPERATION_BUDGET",ARCHCSG_RESOURCE);
  if(control.cancelled(control.user)){ctx.Cancel();throw Failure(ARCHCSG_CANCELLED,"CSG_CANCELLED");}
  need(control.current(control.user,r.generation,r.project_revision)==1,"CSG_STALE_HEAD",ARCHCSG_STALE);
  if(control.progress)control.progress(control.user,std::min<uint32_t>(990,20+o.ops));
 }
 Manifold evaluate(const Manifold&m){
  tick();auto x=m.WithContext(ctx);auto status=x.Status();
  need(status!=Manifold::Error::Cancelled,"CSG_CANCELLED",ARCHCSG_CANCELLED);
  need(status==Manifold::Error::NoError,"CSG_MANIFOLD_REJECTED");
  need(std::isfinite(x.GetTolerance())&&x.GetTolerance()<=r.query_tolerance_ceiling_mm,"CSG_QUERY_TOLERANCE_UNAVAILABLE",ARCHCSG_UNVERIFIED);
  o.tolerance=std::max(o.tolerance,x.GetTolerance());
  if(!x.IsEmpty())need(std::isfinite(x.Volume())&&x.Volume()>0,"CSG_NONPOSITIVE_VOLUME");
  tick();return x;
 }
 Manifold boolean(const Manifold&a,const Manifold&b,manifold::OpType op){return evaluate(a.Boolean(b,op));}
 void disjoint(const std::vector<Solid>&p,const char*message,bool retained=false){
  for(size_t i=0;i<p.size();i++)for(size_t j=i+1;j<p.size();j++){
   if(retained&&p[i].side==0&&p[j].side==0)continue;
   tick();auto ab=p[i].mesh.BoundingBox(),bb=p[j].mesh.BoundingBox();
   if(ab.max.x<=bb.min.x||bb.max.x<=ab.min.x||ab.max.y<=bb.min.y||bb.max.y<=ab.min.y||ab.max.z<=bb.min.z||bb.max.z<=ab.min.z)continue;
   auto overlap=boolean(p[i].mesh,p[j].mesh,manifold::OpType::Intersect);
   need(overlap.IsEmpty(),message,ARCHCSG_MATERIAL_PROPOSAL);
  }
 }
 Solid ingest(const std::vector<double>&xyz,const std::vector<uint32_t>&tri,uint32_t side,uint32_t part,uint32_t first,uint32_t material,uint32_t rgba,uint32_t sourceIndex,uint64_t semantic,uint64_t source,uint64_t provenance){
  tick();need(xyz.size()%3==0&&tri.size()%3==0&&!xyz.empty()&&!tri.empty(),"CSG_INPUT_ARRAYS");
  need(xyz.size()/3<=r.max_vertices&&tri.size()/3<=r.max_triangles,"CSG_INPUT_BUDGET",ARCHCSG_RESOURCE);
  // Reuse the frozen importer's independent incidence/link/duplicate checks
  // and actual Manifold construction, on a private validation context.
  archmi::Context check;check.original=std::make_shared<std::vector<uint8_t>>();
  check.sourceId="csg-input";check.vertices=xyz;check.triangles=tri;
  check.face_materials.assign(tri.size()/3,0);check.materials.push_back({"validated-input","",rgba});
  ArchmiPart p{};p.vertex_count=uint32_t(xyz.size()/3);p.triangle_count=uint32_t(tri.size()/3);check.parts.push_back(p);check.details.emplace_back();
  archmi::validate(check,r.query_tolerance_ceiling_mm);
  need(check.publishable,"CSG_INPUT_TOPOLOGY_REJECTED");
  MeshGL64 mesh;mesh.vertProperties=xyz;mesh.triVerts.assign(tri.begin(),tri.end());
  mesh.faceID.resize(tri.size()/3);std::iota(mesh.faceID.begin(),mesh.faceID.end(),uint64_t(first));
  uint32_t original=Manifold::ReserveIDs(1);
  mesh.runOriginalID={original};mesh.runIndex={0,mesh.triVerts.size()};
  originalIDs.emplace(original,Original{side,part,first,uint32_t(tri.size()/3)});
  auto solid=evaluate(ctx.FromMeshGL(mesh));need(!solid.IsEmpty(),"CSG_EMPTY_INPUT");
  // A surface-pair test alone misses nested outward shells. Qualify separate
  // positive components with the vetted volume intersection. Negative shell
  // nesting needs a separate winding-domain proof; never reinterpret it.
  if(!(r.operation==ARCHCSG_IMPORT_AS_PART&&side==0)){
  auto components=solid.Decompose();
  for(size_t a=0;a<components.size();a++){
   need(components[a].Volume()>0,"CSG_INPUT_NESTED_NEGATIVE_SHELL_UNVERIFIED",ARCHCSG_UNVERIFIED);
   for(size_t b=a+1;b<components.size();b++)
    need(boolean(components[a],components[b],manifold::OpType::Intersect).IsEmpty(),"CSG_INPUT_COMPONENT_OVERLAP",ARCHCSG_UNVERIFIED);
  }
  need(archcsg_guard::check(xyz,tri,[&]{tick();}),"CSG_INPUT_SELF_INTERSECTION_OR_CONTACT_UNVERIFIED",ARCHCSG_UNVERIFIED);
  } // Exact retained generated geometry must pass the owned root guard.

  Solid out{solid,original,part,material,rgba,sourceIndex,semantic,source,provenance,side};
  if(r.operation==ARCHCSG_IMPORT_AS_PART){out.exactVertices=xyz;out.exactTriangles=tri;}
  return out;
 }
 void initialize(){
  need(r.abi_version==1&&r.operation<=ARCHCSG_IMPORT_AS_PART&&r.material_policy<=1&&r.reserved==0,"CSG_ABI_OR_OPERATION");
  need(r.generation>0&&r.generation<UINT32_MAX&&r.generated_snapshot&&r.generated_generation&&r.importer_handle&&r.feature_id,"CSG_IDENTITIES");
  need(control.current&&control.cancelled,"CSG_CONTROL_REQUIRED");
  need(r.max_vertices>=3&&r.max_vertices<=1000000&&r.max_triangles>=1&&r.max_triangles<=400000&&r.max_parts>=1&&r.max_parts<=128&&r.max_operations>=1&&r.max_operations<=2000000,"CSG_RESOURCE_CONTRACT");
  need(std::isfinite(r.query_tolerance_ceiling_mm)&&r.query_tolerance_ceiling_mm>0&&r.query_tolerance_ceiling_mm<=.002,"CSG_QUERY_BUDGET");
  need(r.generated_arch&&r.generated_arch_bytes>=128&&r.generated_arch_bytes<=256u*1024u*1024u,"CSG_ARCH_BYTES");
  need(r.generated_bindings&&r.generated_materials&&r.generated_material_count>0&&r.generated_material_count<=16,"CSG_MATERIAL_TABLE");
  need(r.imported_transform,"CSG_EXPLICIT_TRANSFORM_REQUIRED");
  if(r.operation==ARCHCSG_IMPORT_AS_PART){
   need(r.target_count==0,"CSG_IMPORT_AS_PART_HAS_NO_TARGET");
   need(r.material_policy==ARCHCSG_REQUIRE_DISJOINT_MATERIALS,"CSG_IMPORT_AS_PART_PRESERVES_MATERIALS",ARCHCSG_MATERIAL_PROPOSAL);
  }else need(r.target_semantic_ids&&r.target_count>0&&r.target_count<=r.generated_part_count,"CSG_EXPLICIT_TARGET_REQUIRED");
  need(r.generated_part_count<=r.max_parts,"CSG_PART_BUDGET",ARCHCSG_RESOURCE);
  need(r.provenance_json&&r.provenance_bytes>0&&r.provenance_bytes<=65536,"CSG_PROVENANCE_REQUIRED");
  o.generation=r.generation;o.revision=r.project_revision;o.feature=r.feature_id;o.operation=r.operation;
  o.provenance.assign(r.provenance_json,r.provenance_bytes);
  need(o.provenance.find('\0')==std::string::npos,"CSG_PROVENANCE_NUL");
  // Metadata is an opaque capsule, quoted in reports; reject invalid UTF-8.
  for(size_t i=0;i<o.provenance.size();){
   auto a=uint8_t(o.provenance[i++]);if(a<128)continue;
   uint32_t n=0,value=0,minimum=0;
   if(a>=0xc2&&a<=0xdf){n=1;value=a&31;minimum=128;}
   else if(a>=0xe0&&a<=0xef){n=2;value=a&15;minimum=2048;}
   else if(a>=0xf0&&a<=0xf4){n=3;value=a&7;minimum=65536;}
   else need(false,"CSG_PROVENANCE_UTF8");
   need(i+n<=o.provenance.size(),"CSG_PROVENANCE_UTF8");
   for(uint32_t j=0;j<n;j++){auto b=uint8_t(o.provenance[i++]);need((b&0xc0)==0x80,"CSG_PROVENANCE_UTF8");value=value*64+(b&63);}
   need(value>=minimum&&value<=0x10ffff&&(value<0xd800||value>0xdfff),"CSG_PROVENANCE_UTF8");
  }
  std::copy(r.imported_transform,r.imported_transform+12,transform.begin());archmi::matrix_check(transform);
  std::ostringstream command;command<<std::setprecision(17)<<"{\"operation\":"<<archmi::quoted(r.operation==0?"union":r.operation==1?"difference":r.operation==2?"intersection":"import-as-part")<<",\"materialPolicy\":"<<archmi::quoted(r.material_policy==0?"require-disjoint-materials":"keep-selected-target-material")<<",\"selectedSemanticIds\":[";
  for(uint32_t i=0;i<r.target_count;i++){if(i)command<<',';command<<'"'<<r.target_semantic_ids[i]<<'"';}command<<"],\"importedTransform\":[";
  for(int i=0;i<12;i++){if(i)command<<',';command<<transform[i];}command<<"],\"generatedMaterials\":[";
  for(uint32_t i=0;i<r.generated_material_count;i++){if(i)command<<',';const auto&m=r.generated_materials[i];command<<"{\"id\":\""<<m.material_id<<"\",\"rgba\":"<<m.rgba<<",\"slot\":"<<m.slot<<'}';}
  command<<"],\"queryToleranceCeilingMm\":"<<r.query_tolerance_ceiling_mm<<'}';o.command=command.str();
  tick();
  materials.assign(r.generated_materials,r.generated_materials+r.generated_material_count);
  std::set<uint64_t> mids;
  for(auto&m:materials)need(m.material_id&&mids.insert(m.material_id).second&&(m.rgba&255)==255&&m.slot>=1&&m.slot<=16,"CSG_MATERIAL_ID_COLLISION_OR_DOMAIN");
  const auto*b=r.generated_arch;
  need(u32(b)==0x48435241&&u32(b+4)==1&&u32(b+8)==128&&u32(b+12)==r.generated_arch_bytes&&u32(b+16)==r.generated_generation,"CSG_ARCH_HEADER_OR_GENERATION",ARCHCSG_STALE);
  const uint32_t counts[]={u32(b+20),u32(b+24),u32(b+28),u32(b+32),u32(b+36),u32(b+40),u32(b+44)};
  need(counts[0]>0&&counts[0]<=r.max_vertices&&counts[1]>0&&counts[1]<=r.max_triangles&&counts[2]>0&&counts[2]<=r.max_parts&&counts[2]==r.generated_part_count,"CSG_ARCH_COUNTS",ARCHCSG_RESOURCE);
  const uint32_t strides[]={24,12,40,16,16,4,16};uint64_t end=128;
  for(int i=0;i<7;i++){if(i==2)end=(end+7)&~uint64_t(7);need(u32(b+48+4*i)==end,"CSG_ARCH_SECTION_LAYOUT");end+=uint64_t(counts[i])*strides[i];need(end<=r.generated_arch_bytes,"CSG_ARCH_SECTION_BOUND");}
  need(end==r.generated_arch_bytes,"CSG_ARCH_TRAILING_BYTES");
  for(int i=76;i<128;i++)need(b[i]==0,"CSG_ARCH_RESERVED");
  const uint32_t vo=u32(b+48),to=u32(b+52),po=u32(b+56);
  uint32_t nextVertex=0,nextTriangle=0;std::set<uint64_t> ids,targets;
  if(r.target_count)targets.insert(r.target_semantic_ids,r.target_semantic_ids+r.target_count);
  need(targets.size()==r.target_count,"CSG_DUPLICATE_TARGET");
  for(uint32_t pi=0;pi<counts[2];pi++){
   tick();const auto*p=b+po+pi*40;const uint32_t vs=u32(p),nv=u32(p+4),ts=u32(p+8),nt=u32(p+12);
   const auto&binding=r.generated_bindings[pi];
   need(vs==nextVertex&&ts==nextTriangle&&nv>0&&nt>0&&uint64_t(vs)+nv<=counts[0]&&uint64_t(ts)+nt<=counts[1],"CSG_ARCH_PART_RANGE");
   need(binding.semantic_id&&binding.source_id&&binding.provenance_id&&ids.insert(binding.semantic_id).second&&binding.source_index==u32(p+20)&&binding.material_index<materials.size(),"CSG_PART_BINDING_COLLISION");
   const auto&m=materials[binding.material_index];need(m.rgba==u32(p+16),"CSG_MATERIAL_BINDING_MISMATCH");
   need(std::isfinite(f64(p+32))&&f64(p+32)>0,"CSG_DECLARED_VOLUME_INVALID");
   std::vector<double>xyz;xyz.reserve(nv*3);for(uint32_t i=0;i<nv*3;i++){double x=f64(b+vo+uint64_t(vs*3+i)*8);need(std::isfinite(x)&&std::abs(x)<=10000,"CSG_COORDINATE_DOMAIN");xyz.push_back(x);}
   std::vector<uint32_t>tri;tri.reserve(nt*3);for(uint32_t i=0;i<nt*3;i++){auto index=u32(b+to+uint64_t(ts*3+i)*4);need(index>=vs&&index<vs+nv,"CSG_PART_TRIANGLE_INDEX");tri.push_back(index-vs);}
   auto solid=ingest(xyz,tri,0,pi,ts,binding.material_index,m.rgba,pi,binding.semantic_id,binding.source_id,binding.provenance_id);
   std::ostringstream sr;if(!o.sourceReports.empty())o.sourceReports+=',';
   sr<<"{\"row\":"<<pi<<",\"operand\":0,\"part\":"<<pi<<",\"originalSourceIndex\":"<<binding.source_index<<",\"semanticId\":\""<<binding.semantic_id<<"\",\"sourceId\":\""<<binding.source_id<<"\",\"provenanceId\":\""<<binding.provenance_id<<"\"}";o.sourceReports+=sr.str();
   generated.push_back(std::move(solid));if(targets.count(binding.semantic_id))selected.push_back(pi);
   nextVertex+=nv;nextTriangle+=nt;
  }
  need(nextVertex==counts[0]&&nextTriangle==counts[1]&&selected.size()==targets.size(),"CSG_ORPHAN_TARGET_OR_PART");
  imported=archmi::csg_source(r.importer_handle);
  need(imported->format=="stl"||imported->format=="obj","CSG_IMPORT_FORMAT_UNSUPPORTED");
  need(imported->numericError<=r.query_tolerance_ceiling_mm,"CSG_IMPORT_ERROR_BUDGET");
  o.originals.push_back(imported->original);o.originals.insert(o.originals.end(),imported->operands.begin(),imported->operands.end());
  o.importReport=imported->report;o.sourceContext=imported;
  for(uint32_t pi=0;pi<imported->parts.size();pi++){
   const auto&p=imported->parts[pi];uint32_t mat=imported->face_materials[p.triangle_start];
   need(mat<imported->materials.size(),"CSG_IMPORT_MATERIAL_AMBIGUOUS",ARCHCSG_MATERIAL_PROPOSAL);
   for(uint32_t f=p.triangle_start;f<p.triangle_start+p.triangle_count;f++)need(imported->face_materials[f]==mat,"CSG_IMPORT_MIXED_MATERIAL_PART",ARCHCSG_MATERIAL_PROPOSAL);
   std::vector<double>xyz(imported->vertices.begin()+p.vertex_start*3,imported->vertices.begin()+(p.vertex_start+p.vertex_count)*3);
   std::vector<uint32_t>tri;for(uint32_t f=0;f<p.triangle_count*3;f++)tri.push_back(imported->triangles[p.triangle_start*3+f]-p.vertex_start);
   const bool separate=r.operation==ARCHCSG_IMPORT_AS_PART;
   const bool reflected=separate&&archmi::determinant(transform)<0;
   if(separate){
    for(size_t v=0;v<xyz.size();v+=3){const double x=xyz[v],y=xyz[v+1],z=xyz[v+2];
     for(int k=0;k<3;k++)xyz[v+k]=((transform[k]*x+transform[k+3]*y)+transform[k+6]*z)+transform[k+9];
    }
    if(reflected)for(size_t f=0;f<tri.size();f+=3)std::swap(tri[f+1],tri[f+2]);
   }
   auto solid=ingest(xyz,tri,1,pi,p.triangle_start,mat,imported->materials[mat].rgba,uint32_t(generated.size())+pi,0,0,0);
   solid.reflected=reflected;
   if(!separate)solid.mesh=evaluate(solid.mesh.Transform(manifold::mat3x4(manifold::la::mat<double,3,4>(transform.data()))));
   auto bounds=solid.mesh.BoundingBox();for(int k=0;k<3;k++)need(std::isfinite(bounds.min[k])&&std::isfinite(bounds.max[k])&&bounds.min[k]>=-10000&&bounds.max[k]<=10000,"CSG_TRANSFORM_COORDINATE_DOMAIN");
   auto transformed=solid.mesh.GetMeshGL64();
   std::vector<uint32_t> transformedTri;for(auto index:transformed.triVerts){need(index<=UINT32_MAX,"CSG_TRANSFORM_INDEX");transformedTri.push_back(uint32_t(index));}
   need(transformed.mergeFromVert.empty(),"CSG_TRANSFORM_ALIAS_REQUIRES_QUALIFICATION",ARCHCSG_UNVERIFIED);
   need(archcsg_guard::check(transformed.vertProperties,transformedTri,[&]{tick();}),"CSG_TRANSFORM_SELF_INTERSECTION_UNVERIFIED",ARCHCSG_UNVERIFIED);
   std::ostringstream sr;if(!o.sourceReports.empty())o.sourceReports+=',';
   sr<<"{\"row\":"<<solid.sourceIndex<<",\"operand\":1,\"part\":"<<pi<<",\"originalSourceIndex\":"<<p.source_index<<",\"sourceId\":"<<archmi::quoted(imported->sourceId)<<",\"sourceName\":"<<archmi::quoted(imported->sourceName)<<",\"partId\":"<<archmi::quoted(imported->details.at(pi).id)<<",\"partName\":"<<archmi::quoted(imported->details.at(pi).name)<<",\"rawFaceMapping\":"<<archmi::quoted(imported->format=="obj"?"retained-original-OBJ-f-record":"normalized-STL-facet-in-retained-source")<<'}';o.sourceReports+=sr.str();
   tools.push_back(std::move(solid));
  }
  need(!tools.empty()&&generated.size()+tools.size()<=r.max_parts,"CSG_PART_BUDGET",ARCHCSG_RESOURCE);
  disjoint(generated,"CSG_GENERATED_MATERIAL_OVERLAP",r.operation==ARCHCSG_IMPORT_AS_PART);disjoint(tools,"CSG_IMPORTED_MATERIAL_OVERLAP");
 }
 Manifold join(const std::vector<Solid>&list){std::vector<Manifold>m;for(auto&s:list)m.push_back(s.mesh);return evaluate(Manifold::BatchBoolean(m,manifold::OpType::Add));}
 void append(const Manifold&solid,const Solid&owner,const char*operation){
  if(solid.IsEmpty())return;
  auto mesh=solid.GetMeshGL64();need(mesh.numProp==3&&mesh.faceID.size()==mesh.NumTri()&&mesh.runIndex.size()==mesh.runOriginalID.size()+1,"CSG_LINEAGE_UNAVAILABLE",ARCHCSG_UNVERIFIED);
  need(o.parts.size()<r.max_parts&&uint64_t(o.vertices.size()/3)+mesh.NumVert()<=r.max_vertices&&uint64_t(o.triangles.size()/3)+mesh.NumTri()<=r.max_triangles,"CSG_OUTPUT_BUDGET",ARCHCSG_RESOURCE);
  // ARCH has no property aliases. Normalize ONLY identities explicitly
  // supplied by Manifold and only when their binary64 positions are equal.
  need(mesh.mergeFromVert.size()==mesh.mergeToVert.size(),"CSG_OUTPUT_ALIAS_LAYOUT",ARCHCSG_UNVERIFIED);
  std::vector<uint32_t> parent(mesh.NumVert());std::iota(parent.begin(),parent.end(),0u);
  auto root=[&](uint32_t a){while(parent[a]!=a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
  for(size_t i=0;i<mesh.mergeFromVert.size();i++){
   auto a=mesh.mergeFromVert[i],b=mesh.mergeToVert[i];
   need(a<parent.size()&&b<parent.size(),"CSG_OUTPUT_ALIAS_INDEX",ARCHCSG_UNVERIFIED);
   for(int k=0;k<3;k++)need(mesh.vertProperties[a*3+k]==mesh.vertProperties[b*3+k],"CSG_ALIAS_POSITION_CHANGE_UNAPPROVED",ARCHCSG_UNVERIFIED);
   parent[root(uint32_t(a))]=root(uint32_t(b));++o.aliasCount;
  }
  std::vector<double>xyz;std::vector<uint32_t>tri,compact(parent.size(),UINT32_MAX);
  for(auto a:mesh.triVerts){
   need(a<parent.size(),"CSG_OUTPUT_INDEX");auto b=root(uint32_t(a));
   if(compact[b]==UINT32_MAX){compact[b]=uint32_t(xyz.size()/3);for(int k=0;k<3;k++)xyz.push_back(mesh.vertProperties[b*3+k]);}
   tri.push_back(compact[b]);
  }
  archmi::Context check;check.original=std::make_shared<std::vector<uint8_t>>();check.sourceId="csg-output";
  check.vertices=xyz;check.triangles=tri;check.face_materials.assign(tri.size()/3,0);check.materials.push_back({"owner","",owner.rgba});
  ArchmiPart cp{};cp.vertex_count=uint32_t(xyz.size()/3);cp.triangle_count=uint32_t(tri.size()/3);check.parts.push_back(cp);check.details.emplace_back();
  archmi::validate(check,r.query_tolerance_ceiling_mm);need(check.publishable,"CSG_OUTPUT_TOPOLOGY_REJECTED");
  need(archcsg_guard::check(xyz,tri,[&]{tick();}),"CSG_OUTPUT_SELF_INTERSECTION_OR_CONTACT_UNVERIFIED",ARCHCSG_UNVERIFIED);
  ArchcsgPart part{};part.vertex_start=uint32_t(o.vertices.size()/3);part.vertex_count=uint32_t(xyz.size()/3);part.triangle_start=uint32_t(o.triangles.size()/3);part.triangle_count=uint32_t(mesh.NumTri());part.color_rgba=owner.rgba;part.source_index=owner.sourceIndex;part.volume_mm3=solid.Volume();
  for(double x:xyz)need(std::isfinite(x)&&std::abs(x)<=10000,"CSG_OUTPUT_COORDINATE_DOMAIN");
  o.vertices.insert(o.vertices.end(),xyz.begin(),xyz.end());
  for(auto index:tri){need(index<part.vertex_count,"CSG_OUTPUT_INDEX");o.triangles.push_back(part.vertex_start+uint32_t(index));}
  size_t covered=0;
  for(size_t run=0;run<mesh.runOriginalID.size();run++){
   auto it=originalIDs.find(mesh.runOriginalID[run]);need(it!=originalIDs.end(),"CSG_UNKNOWN_SOURCE_ORIGIN",ARCHCSG_UNVERIFIED);const auto&origin=it->second;
   need(mesh.runIndex[run]==covered&&mesh.runIndex[run]%3==0&&mesh.runIndex[run+1]%3==0&&mesh.runIndex[run+1]<=mesh.triVerts.size(),"CSG_LINEAGE_RUN_LAYOUT",ARCHCSG_UNVERIFIED);
   for(size_t f=mesh.runIndex[run]/3;f<mesh.runIndex[run+1]/3;f++){
    need(mesh.faceID[f]>=origin.first&&mesh.faceID[f]<uint64_t(origin.first)+origin.count,"CSG_SOURCE_FACE_UNAVAILABLE",ARCHCSG_UNVERIFIED);
    o.origins.push_back({origin.side,origin.part,uint32_t(mesh.faceID[f]),mesh.Backside(run)?1u:0u});
   }covered=mesh.runIndex[run+1];
  }
  need(covered==mesh.triVerts.size(),"CSG_LINEAGE_RUN_COVERAGE",ARCHCSG_UNVERIFIED);
  if(!o.partReports.empty())o.partReports+=',';
  std::ostringstream s;s<<"{\"index\":"<<o.parts.size()<<",\"volumeOwnerOperand\":"<<owner.side<<",\"volumeOwnerPart\":"<<owner.part<<",\"sourceRow\":"<<owner.sourceIndex<<",\"materialNamespace\":"<<archmi::quoted(owner.side?"imported":"generated")<<",\"materialIndex\":"<<owner.material<<",\"materialId\":";
  if(owner.side==0)s<<'"'<<materials[owner.material].material_id<<'"';else s<<archmi::quoted(imported->materials[owner.material].id);
  s<<",\"operation\":"<<archmi::quoted(operation)<<'}';o.partReports+=s.str();o.parts.push_back(part);
 }
 void append_exact(const Solid&owner){
  const auto&xyz=owner.exactVertices;const auto&tri=owner.exactTriangles;
  need(o.parts.size()<r.max_parts&&o.vertices.size()/3+xyz.size()/3<=r.max_vertices&&o.triangles.size()/3+tri.size()/3<=r.max_triangles,"CSG_OUTPUT_BUDGET",ARCHCSG_RESOURCE);
  ArchcsgPart part{};part.vertex_start=uint32_t(o.vertices.size()/3);part.vertex_count=uint32_t(xyz.size()/3);
  part.triangle_start=uint32_t(o.triangles.size()/3);part.triangle_count=uint32_t(tri.size()/3);part.color_rgba=owner.rgba;part.source_index=owner.sourceIndex;
  part.volume_mm3=owner.side?owner.mesh.Volume():f64(r.generated_arch+u32(r.generated_arch+56)+40*owner.part+32);
  o.vertices.insert(o.vertices.end(),xyz.begin(),xyz.end());
  for(auto ix:tri){need(ix<part.vertex_count,"CSG_OUTPUT_INDEX");o.triangles.push_back(part.vertex_start+ix);}
  const auto original=originalIDs.at(owner.original);
  for(uint32_t f=0;f<part.triangle_count;f++)o.origins.push_back({owner.side,owner.part,original.first+f,owner.reflected?1u:0u});
  if(!o.partReports.empty())o.partReports+=',';
  std::ostringstream s;s<<"{\"index\":"<<o.parts.size()<<",\"volumeOwnerOperand\":"<<owner.side<<",\"volumeOwnerPart\":"<<owner.part<<",\"sourceRow\":"<<owner.sourceIndex
   <<",\"materialNamespace\":"<<archmi::quoted(owner.side?"imported":"generated")<<",\"materialIndex\":"<<owner.material<<",\"materialId\":";
  if(owner.side==0)s<<'"'<<materials[owner.material].material_id<<'"';else s<<archmi::quoted(imported->materials[owner.material].id);
  s<<",\"operation\":"<<archmi::quoted(owner.side?"import-as-part":"retained-part")<<",\"geometryPreservation\":"<<archmi::quoted(owner.side?"exact-approved-affine-of-normalized-input":"exact-generated-vertices-and-triangles")
   <<",\"reflectionWinding\":"<<(owner.reflected?"true":"false")<<'}';
  o.partReports+=s.str();o.parts.push_back(part);
 }
 void calculate(){
  if(r.operation==ARCHCSG_IMPORT_AS_PART){
   // Topology was validated on the represented arrays above. Boolean queries
   // may veto collisions; their output NEVER replaces either operand's mesh.
   std::vector<Solid> output;output.reserve(generated.size()+tools.size());
   for(auto&s:generated)output.push_back(std::move(s));for(auto&s:tools)output.push_back(std::move(s));
   std::set<std::pair<uint32_t,uint32_t>> used;for(const auto&s:output)used.insert({s.side,s.material});
   need(used.size()<=32,"CSG_FINAL_MATERIAL_COUNT",ARCHCSG_MATERIAL_PROPOSAL); // root resolves the explicitly approved mappings to <=16 final materials
   disjoint(output,"CSG_IMPORT_AS_PART_COLLISION",true);
   for(const auto&s:output){tick();append_exact(s);}
   need(o.origins.size()==o.triangles.size()/3,"CSG_OUTPUT_LINEAGE_LAYOUT");tick();return;
  }
  auto toolUnion=join(tools);std::set<uint32_t> chosen(selected.begin(),selected.end());std::vector<Solid> output;
  for(uint32_t i=0;i<generated.size();i++)if(!chosen.count(i))output.push_back(generated[i]);
  if(r.operation==ARCHCSG_UNION){
   // Welding requires every connected imported solid to join the selected
   // solid. Count actual manifold components, including face-contact unions;
   // a disjoint or point/edge-only addition cannot become a welded part.
   // Test each tool component so a bridge cannot hide a detached island.
   std::vector<Solid> picked;for(auto i:selected)picked.push_back(generated[i]);
   const auto target=join(picked);const auto targetCount=target.Decompose().size();
   const auto toolComponents=toolUnion.Decompose();
   need(targetCount>0&&targetCount<=r.max_parts&&toolComponents.size()<=r.max_parts,"CSG_CONNECTIVITY_BUDGET",ARCHCSG_RESOURCE);
   for(const auto&component:toolComponents){
    tick();const auto joined=boolean(target,component,manifold::OpType::Add);
    need(joined.Decompose().size()<=targetCount,"CSG_WELD_REQUIRES_CONNECTED_TARGET",ARCHCSG_UNVERIFIED);
   }
  }
  if(r.operation==ARCHCSG_UNION&&r.material_policy==ARCHCSG_KEEP_SELECTED_TARGET_MATERIAL){
   const auto&owner=generated[selected[0]];
   for(auto i:selected)need(materials[generated[i].material].material_id==materials[owner.material].material_id,"CSG_MULTIPLE_TARGET_MATERIALS_REQUIRE_MAPPING",ARCHCSG_MATERIAL_PROPOSAL);
   std::vector<Solid> picked;for(auto i:selected)picked.push_back(generated[i]);
   auto out=owner;out.mesh=boolean(join(picked),toolUnion,manifold::OpType::Add);output.push_back(out);o.materialRemap=1;
   for(const auto&t:tools){if(!o.remaps.empty())o.remaps+=',';std::ostringstream remap;remap<<"{\"operand\":1,\"part\":"<<t.part<<",\"fromMaterialId\":"<<archmi::quoted(imported->materials[t.material].id)<<",\"toGeneratedMaterialId\":\""<<materials[owner.material].material_id<<"\"}";o.remaps+=remap.str();}
  }else if(r.operation==ARCHCSG_UNION){
   // Preserve both volume ownership tables only where they do not overlap.
   // No ordering heuristic decides an intersecting volume's material.
   for(auto i:selected)for(auto&t:tools)need(boolean(generated[i].mesh,t.mesh,manifold::OpType::Intersect).IsEmpty(),"CSG_OVERLAP_MATERIAL_OWNER_REQUIRED",ARCHCSG_MATERIAL_PROPOSAL);
   for(auto i:selected)output.push_back(generated[i]);output.insert(output.end(),tools.begin(),tools.end());
   // Evaluate the real union even where output retains separate color solids.
   std::vector<Solid> all;for(auto i:selected)all.push_back(generated[i]);all.insert(all.end(),tools.begin(),tools.end());join(all);
  }else{
   if(r.operation==ARCHCSG_INTERSECTION)need(r.material_policy==ARCHCSG_KEEP_SELECTED_TARGET_MATERIAL,"CSG_INTERSECTION_MATERIAL_OWNER_REQUIRED",ARCHCSG_MATERIAL_PROPOSAL);
   for(auto i:selected){auto s=generated[i];s.mesh=boolean(s.mesh,toolUnion,r.operation==ARCHCSG_DIFFERENCE?manifold::OpType::Subtract:manifold::OpType::Intersect);if(!s.mesh.IsEmpty())output.push_back(s);else{if(!o.removed.empty())o.removed+=',';o.removed+='"'+std::to_string(s.semantic)+'"';}}
  }
  need(!output.empty(),"CSG_EMPTY_SCENE");
  std::set<std::pair<uint32_t,uint32_t>> outputMaterials;for(auto&s:output)outputMaterials.insert({s.side,s.material});
  need(outputMaterials.size()<=16,"CSG_FINAL_MATERIAL_COUNT",ARCHCSG_MATERIAL_PROPOSAL);
  disjoint(output,"CSG_FINAL_MATERIAL_OR_UNSELECTED_COLLISION");
  for(auto&s:output){tick();append(s.mesh,s,s.side==0&&chosen.count(s.part)?"csg-result":"retained-part");}
  need(o.origins.size()==o.triangles.size()/3,"CSG_OUTPUT_LINEAGE_LAYOUT");
  // The output as a whole is evaluated too. This does not replace the parent
  // final roof/floor/datum gates or qualify a missing global numeric bound.
  join(output);tick();
 }
 void descriptor(uint32_t serial){
  // Pointer-free exact request/head descriptor. Root's immutable registered
  // handles and generation bind the borrowed operands; provenance carries its
  // source/settings SHA records. No user JSON is executed.
  auto&b=o.descriptor;put(b,uint32_t(0x51534341));put(b,uint32_t(1));put(b,serial);
  for(auto x:{r.operation,r.material_policy,r.generation,r.generated_snapshot,r.generated_generation,r.importer_handle})put(b,x);
  put(b,r.project_revision);put(b,r.feature_id);
  put(b,r.generated_arch_bytes);
  put(b,r.generated_part_count);for(uint32_t i=0;i<r.generated_part_count;i++){const auto&p=r.generated_bindings[i];put(b,p.semantic_id);put(b,p.source_id);put(b,p.provenance_id);put(b,p.source_index);put(b,p.material_index);}
  put(b,r.generated_material_count);for(auto&m:materials){put(b,m.material_id);put(b,m.rgba);put(b,m.slot);}
  put(b,r.target_count);for(uint32_t i=0;i<r.target_count;i++)put(b,r.target_semantic_ids[i]);
  for(double x:transform)put(b,x);put(b,r.query_tolerance_ceiling_mm);
  for(auto x:{r.max_vertices,r.max_triangles,r.max_parts,r.max_operations,r.provenance_bytes})put(b,x);
  b.insert(b.end(),o.provenance.begin(),o.provenance.end());need(b.size()<=131072,"CSG_DESCRIPTOR_BUDGET",ARCHCSG_RESOURCE);
 }
};
uint64_t memory(const Result&o){
 uint64_t n=o.vertices.capacity()*8ull+o.triangles.capacity()*4ull+o.parts.capacity()*sizeof(ArchcsgPart)+o.origins.capacity()*sizeof(ArchcsgFaceOrigin)+o.descriptor.capacity()+o.report.size()+o.importReport.size()+o.provenance.size()+o.sourceReports.size()+o.partReports.size()+o.remaps.size();
 for(auto&b:o.originals)n+=b->size();if(o.sourceContext){const auto&c=*o.sourceContext;n+=c.vertices.size()*8ull+(c.triangles.size()+c.face_materials.size()+c.source_vertices.size()+c.source_faces.size()+c.source_material_refs.size())*4ull+c.report.size();}return n;
}
void makeReport(Result&o){
 std::ostringstream s;s<<std::setprecision(17);
 s<<"{\"schemaVersion\":1,\"algorithm\":\"triangle-manifold-csg/v1\""
  <<",\"verdict\":"<<o.verdict<<",\"diagnostic\":"<<archmi::quoted(o.diagnostic)
  <<",\"requiresFinalGates\":true,\"exportable\":false"
  <<",\"generation\":"<<o.generation<<",\"projectRevision\":\""<<o.revision
  <<"\",\"featureId\":\""<<o.feature<<"\""
  <<",\"command\":"<<(o.command.empty()?"null":o.command)
  <<",\"removedSelectedSemanticIds\":["<<o.removed<<"]"
  <<",\"sceneKind\":\"derived-final-triangle-proposal\""
  <<",\"sourceGate\":{\"original\":\"immutable\",\"importedGeneratedParameters\":\"unapplied\",\"syntheticSlabs\":false}"
  <<",\"operations\":"<<o.ops<<",\"observedManifoldToleranceMm\":"<<o.tolerance
  <<",\"globalNumericalBound\":\"unverified\",\"physicalFit\":\"unqualified\""
  <<",\"selfIntersectionQualification\":"<<archmi::quoted(o.verdict!=0?"not-qualified":o.operation==ARCHCSG_IMPORT_AS_PART?"new-parts-triangle-pair-separation; retained-generated-requires-owned-exact-root-guard":"conservative-full-triangle-pair-separation")
  <<",\"explicitMaterialRemap\":"<<(o.materialRemap?"true":"false")
  <<",\"identityAliasNormalizations\":"<<o.aliasCount
  <<",\"sourceRows\":["<<o.sourceReports<<"],\"materialRemaps\":["<<o.remaps
  <<"],\"parts\":["<<o.partReports<<"]"
  <<",\"provenanceCapsule\":"<<archmi::quoted(o.provenance)
  <<",\"importSourceReport\":"<<archmi::quoted(o.importReport)
  <<",\"surfaceLineage\":\"Manifold retained run/face ancestry; coincident contributors remain in the full operand recipe; not exclusive geometric authorship\""
  <<",\"originalSourceCount\":"<<o.originals.size()<<'}';
 o.report=s.str();need(o.report.size()<=2*1024*1024,"CSG_REPORT_BUDGET",ARCHCSG_RESOURCE);
}
}
extern "C" uint32_t archcsg_abi_version(){return 1;}
extern "C" uint32_t archcsg_operation_mask(){return 15;}
extern "C" uint32_t archcsg_operation(uint32_t id){auto it=results.find(id);return it==results.end()?UINT32_MAX:it->second->operation;}
extern "C" uint32_t archcsg_compute(const ArchcsgRequest*r,const ArchcsgControl*c){
 if(busy){error="CSG_REENTRANT";return 0;}
 struct Guard{Guard(){busy=true;}~Guard(){busy=false;}}guard;
 try{
  error.clear();need(results.size()<4&&nextId<0xc5ffffff,"CSG_HANDLE_RESOURCE_LIMIT",ARCHCSG_RESOURCE);
  auto out=std::make_unique<Result>();uint32_t id=nextId++;
  try{need(r&&c,"CSG_NULL_REQUEST");Job job(*r,*c,*out);job.initialize();job.calculate();job.descriptor(id);job.tick();}
  catch(const Failure&e){out->verdict=e.verdict;out->diagnostic=e.what();}
  catch(const std::bad_alloc&){out->verdict=ARCHCSG_RESOURCE;out->diagnostic="CSG_ALLOCATION";}
  catch(const std::exception&e){out->verdict=ARCHCSG_INVALID;out->diagnostic=e.what();}
  if(out->verdict!=ARCHCSG_GEOMETRY_PROPOSAL){out->vertices.clear();out->triangles.clear();out->parts.clear();out->origins.clear();out->descriptor.clear();out->partReports.clear();error=out->diagnostic;}
  makeReport(*out);uint64_t held=memory(*out);need(held<=128u*1024u*1024u,"CSG_RESULT_MEMORY_LIMIT",ARCHCSG_RESOURCE);
  for(const auto&item:results)held+=memory(*item.second);
  need(held<=256u*1024u*1024u,"CSG_HELD_MEMORY_LIMIT",ARCHCSG_RESOURCE);
  results.emplace(id,std::move(out));return id;
 }catch(const std::exception&e){error=e.what();return 0;}catch(...){error="CSG_FAILURE";return 0;}
}
extern "C" uint32_t archcsg_view(uint32_t id,ArchcsgView*v){
 if(!v)return 0;*v={};auto it=results.find(id);if(it==results.end())return 0;const auto&o=*it->second;
 v->abi_version=1;v->verdict=o.verdict;v->requires_final_gates=1;
 v->vertices=o.vertices.empty()?nullptr:o.vertices.data();v->triangles=o.triangles.empty()?nullptr:o.triangles.data();v->parts=o.parts.empty()?nullptr:o.parts.data();v->face_origins=o.origins.empty()?nullptr:o.origins.data();
 v->vertex_count=uint32_t(o.vertices.size()/3);v->triangle_count=uint32_t(o.triangles.size()/3);v->part_count=uint32_t(o.parts.size());v->face_origin_count=uint32_t(o.origins.size());
 v->report_json=o.report.c_str();v->report_bytes=uint32_t(o.report.size());v->confirmation_descriptor=o.descriptor.empty()?nullptr:o.descriptor.data();v->confirmation_bytes=uint32_t(o.descriptor.size());return 1;
}
extern "C" uint32_t archcsg_acquire(uint32_t id){if(busy)return 0;auto it=results.find(id);if(it==results.end()||it->second->leases>=64)return 0;++it->second->leases;return 1;}
extern "C" uint32_t archcsg_release(uint32_t id){if(busy)return 0;auto it=results.find(id);if(it==results.end())return 0;if(--it->second->leases==0)results.erase(it);return 1;}
extern "C" uint32_t archcsg_confirmation_matches(uint32_t id,const uint8_t*p,uint32_t n,uint32_t gen,uint64_t rev){
 auto it=results.find(id);if(it==results.end()||!p)return 0;const auto&o=*it->second;
 return o.verdict==ARCHCSG_GEOMETRY_PROPOSAL&&o.generation==gen&&o.revision==rev&&o.descriptor.size()==n&&std::memcmp(p,o.descriptor.data(),n)==0?1:0;
}
extern "C" const char*archcsg_error(){return error.c_str();}

extern "C" uint32_t archcsg_source_count(uint32_t id){auto it=results.find(id);return it==results.end()?0:uint32_t(it->second->originals.size());}
extern "C" const uint8_t* archcsg_source_ptr(uint32_t id,uint32_t source){auto it=results.find(id);return it==results.end()||source>=it->second->originals.size()?nullptr:it->second->originals[source]->data();}
extern "C" uint32_t archcsg_source_len(uint32_t id,uint32_t source){auto it=results.find(id);return it==results.end()||source>=it->second->originals.size()?0:uint32_t(it->second->originals[source]->size());}

extern "C" const uint32_t* archcsg_import_source_faces(uint32_t id){
 auto it=results.find(id);if(it==results.end()||!it->second->sourceContext)return nullptr;
 const auto&v=it->second->sourceContext->source_faces;return v.empty()?nullptr:v.data();
}
extern "C" uint32_t archcsg_import_source_face_count(uint32_t id){
 auto it=results.find(id);return it==results.end()||!it->second->sourceContext?0:uint32_t(it->second->sourceContext->source_faces.size());
}
extern "C" uint32_t archcsg_layout(uint32_t type,uint32_t field){
#define F(T,x) uint32_t(offsetof(T,x))
 static const uint32_t request[]={sizeof(ArchcsgRequest),
 F(ArchcsgRequest,abi_version),F(ArchcsgRequest,operation),F(ArchcsgRequest,material_policy),F(ArchcsgRequest,generation),
 F(ArchcsgRequest,project_revision),F(ArchcsgRequest,feature_id),F(ArchcsgRequest,generated_snapshot),F(ArchcsgRequest,generated_generation),
 F(ArchcsgRequest,importer_handle),F(ArchcsgRequest,reserved),F(ArchcsgRequest,generated_arch),F(ArchcsgRequest,generated_arch_bytes),
 F(ArchcsgRequest,generated_part_count),F(ArchcsgRequest,generated_bindings),F(ArchcsgRequest,generated_materials),
 F(ArchcsgRequest,generated_material_count),F(ArchcsgRequest,target_count),F(ArchcsgRequest,target_semantic_ids),F(ArchcsgRequest,imported_transform),
 F(ArchcsgRequest,query_tolerance_ceiling_mm),F(ArchcsgRequest,max_vertices),F(ArchcsgRequest,max_triangles),F(ArchcsgRequest,max_parts),F(ArchcsgRequest,max_operations),
 F(ArchcsgRequest,provenance_json),F(ArchcsgRequest,provenance_bytes)};
 static const uint32_t view[]={sizeof(ArchcsgView),F(ArchcsgView,abi_version),F(ArchcsgView,verdict),F(ArchcsgView,requires_final_gates),F(ArchcsgView,reserved),
 F(ArchcsgView,vertices),F(ArchcsgView,triangles),F(ArchcsgView,parts),F(ArchcsgView,face_origins),F(ArchcsgView,vertex_count),F(ArchcsgView,triangle_count),
 F(ArchcsgView,part_count),F(ArchcsgView,face_origin_count),F(ArchcsgView,report_json),F(ArchcsgView,report_bytes),F(ArchcsgView,confirmation_descriptor),F(ArchcsgView,confirmation_bytes)};
 static const uint32_t control[]={sizeof(ArchcsgControl),F(ArchcsgControl,user),F(ArchcsgControl,current),F(ArchcsgControl,cancelled),F(ArchcsgControl,progress)};
#undef F
 const uint32_t*data=nullptr;size_t n=0;
 if(type==0){data=request;n=sizeof(request)/4;}if(type==1){data=view;n=sizeof(view)/4;}if(type==2){data=control;n=sizeof(control)/4;}
 return field<n?data[field]:UINT32_MAX;
}
