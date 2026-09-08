#include "internal.hpp"
#include "manifold/manifold.h"
#include "manifold/mesh.h"
#include <algorithm>
#include <cstring>
#include <iomanip>
#include <sstream>
#include <numeric>
using namespace archmi;
namespace archmi {
static std::string topology(Context& c,size_t partIndex){
 auto& p=c.parts[partIndex];auto& d=c.details[partIndex];
 std::map<std::pair<uint32_t,uint32_t>,std::pair<uint32_t,int>> edges;
 std::vector<std::map<uint32_t,std::vector<uint32_t>>> links(p.vertex_count);
 std::set<std::array<uint32_t,3>> unique;std::string error;
 auto bad=[&](const char* code){if(error.empty())error=code;};
 manifold::MeshGL64 mesh;mesh.vertProperties.assign(c.vertices.begin()+p.vertex_start*3,c.vertices.begin()+(p.vertex_start+p.vertex_count)*3);
 mesh.triVerts.reserve(p.triangle_count*3);mesh.faceID.reserve(p.triangle_count);
 double volume=0;
 for(uint32_t fi=0;fi<p.triangle_count;++fi){
  std::array<uint32_t,3> t;
  for(int j=0;j<3;++j){uint32_t v=c.triangles[(p.triangle_start+fi)*3+j];need(v>=p.vertex_start&&v<p.vertex_start+p.vertex_count,"PART_INDEX");t[j]=v-p.vertex_start;mesh.triVerts.push_back(t[j]);}
  auto sorted=t;std::sort(sorted.begin(),sorted.end());if(!unique.insert(sorted).second)bad("DUPLICATE_FACE");
  if(t[0]==t[1]||t[1]==t[2]||t[2]==t[0])bad("DEGENERATE_FACE");
  std::array<double,3> a{},b{},cross{};
  for(int j=0;j<3;++j){a[j]=mesh.vertProperties[t[1]*3+j]-mesh.vertProperties[t[0]*3+j];b[j]=mesh.vertProperties[t[2]*3+j]-mesh.vertProperties[t[0]*3+j];}
  cross={a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]};
  if(cross[0]*cross[0]+cross[1]*cross[1]+cross[2]*cross[2]<=1e-24)bad("DEGENERATE_FACE");
  for(int j=0;j<3;++j)volume+=(mesh.vertProperties[t[0]*3+j]-mesh.vertProperties[j])*cross[j]/6;
  for(int j=0;j<3;++j){
   uint32_t a=t[j],b=t[(j+1)%3],v=t[(j+2)%3];auto key=std::minmax(a,b);auto& edge=edges[key];++edge.first;edge.second+=a<b?1:-1;
   links[a][b].push_back(v);links[a][v].push_back(b);
  }
  mesh.faceID.push_back(fi);
 }
 for(auto& [key,value]:edges)if(value.first!=2||value.second!=0)bad("OPEN_OR_NONMANIFOLD_EDGE");
 for(auto& link:links){
  if(link.empty()){bad("UNREFERENCED_VERTEX");continue;}
  for(auto& [v,next]:link)if(next.size()!=2)bad("NONMANIFOLD_VERTEX");
  std::set<uint32_t> reached;std::vector<uint32_t> queue{link.begin()->first};
  while(!queue.empty()){auto v=queue.back();queue.pop_back();if(!reached.insert(v).second)continue;for(auto next:link[v])if(!reached.count(next))queue.push_back(next);}
  if(reached.size()!=link.size())bad("NONMANIFOLD_VERTEX");
 }
 if(!std::isfinite(volume)||volume<=0)bad("NONPOSITIVE_VOLUME");
 p.volume_mm3=volume;
 // Vetted validation is always exercised. Never replace original arrays with
 // Manifold's simplified/repaired output just because construction succeeds.
 manifold::Manifold solid(mesh);d.manifold=int(solid.Status());
 if(solid.Status()!=manifold::Manifold::Error::NoError)bad("MANIFOLD_REJECTED");
 if(solid.IsEmpty())bad("MANIFOLD_EMPTY");
 if(error.empty()&&std::abs(solid.Volume()-volume)>std::max(1e-8,std::abs(volume)*1e-10))bad("MANIFOLD_VOLUME_CHANGED");
 return error.empty()?"pass":error;
}
void validate(Context& c,double budget){
 need(std::isfinite(budget)&&budget>0&&budget<=.002,"ERROR_BUDGET");
 need(!c.sourceId.empty(),"SOURCE_PROVENANCE_REQUIRED");
 need(!c.parts.empty()&&c.parts.size()<=MAX_PARTS,"PART_COUNT");
 need(c.triangles.size()%3==0&&c.vertices.size()%3==0&&c.face_materials.size()==c.triangles.size()/3,"MESH_LAYOUT");
 for(double v:c.vertices)need(std::isfinite(v)&&std::abs(v)<=10000,"COORDINATE_DOMAIN");
 c.state="ready";c.publishable=true;
 for(size_t i=0;i<c.parts.size();++i){
  auto& p=c.parts[i];auto& detail=c.details[i];detail.topology=topology(c,i);
  if(detail.topology!="pass"){c.state="repair-proposal";c.publishable=false;}
  uint32_t material=c.face_materials[p.triangle_start];
  for(uint32_t j=0;j<p.triangle_count;++j)if(c.face_materials[p.triangle_start+j]!=material)material=NO_MATERIAL;
  if(material==NO_MATERIAL||material>=c.materials.size()){
   if(c.state=="ready")c.state="material-proposal";c.publishable=false;p.color_rgba=0;
  }else{
   p.color_rgba=c.materials[material].rgba;
   if((p.color_rgba&255)!=255){if(c.state=="ready")c.state="material-proposal";c.publishable=false;}
  }
 }
 if(c.numericError>budget){c.state="error-budget-exceeded";c.publishable=false;c.diagnostic="IMPORT_ERROR_BUDGET";}
 c.frozen=true;report(c);
}
void report(Context& c){
 std::ostringstream s;s<<std::setprecision(17);
 s<<"{\"schemaVersion\":1,\"implementation\":\"mesh-import/0.1.0\",\"state\":"<<archmi::quoted(c.state)
 <<",\"diagnostic\":"<<archmi::quoted(c.diagnostic)<<",\"format\":"<<archmi::quoted(c.format)
 <<",\"sourceId\":"<<archmi::quoted(c.sourceId)<<",\"sourceName\":"<<archmi::quoted(c.sourceName)
 <<",\"operation\":"<<archmi::quoted(c.operation)<<",\"unit\":"<<archmi::quoted(c.unit)<<",\"unitOrigin\":"<<archmi::quoted(c.unitOrigin)
 <<",\"numericErrorBoundMm\":"<<c.numericError<<",\"originalByteLength\":"<<c.original->size()
 <<",\"publishable\":"<<(c.publishable?"true":"false")
 <<",\"meshUnit\":\"millimeter\",\"interPartOverlap\":\"unverified\",\"selfIntersection\":\"unverified\",\"physicalFit\":\"unverified\",\"sourceGate\":{\"generatedParameters\":\"unapplied\",\"sourceOriginal\":\"read-only\"},\"materials\":[";
 for(size_t i=0;i<c.materials.size();++i){if(i)s<<',';auto& m=c.materials[i];s<<"{\"id\":"<<archmi::quoted(m.id)<<",\"name\":"<<archmi::quoted(m.name)<<",\"rgba\":"<<m.rgba<<'}';}
 s<<"],\"parts\":[";
 for(size_t i=0;i<c.parts.size();++i){
  if(i)s<<',';auto& p=c.parts[i];auto& d=c.details[i];
  uint32_t material=c.face_materials[p.triangle_start];
  for(uint32_t j=0;j<p.triangle_count;++j)if(c.face_materials[p.triangle_start+j]!=material)material=NO_MATERIAL;

  s<<"{\"id\":"<<archmi::quoted(d.id)<<",\"name\":"<<archmi::quoted(d.name)<<",\"partNumber\":"<<archmi::quoted(d.partnumber)<<",\"objectResourceId\":"<<d.object
   <<",\"vertexStart\":"<<p.vertex_start<<",\"vertexCount\":"<<p.vertex_count<<",\"faceStart\":"<<p.triangle_start<<",\"faceCount\":"<<p.triangle_count
   <<",\"materialIndex\":"<<(material==NO_MATERIAL?"null":std::to_string(material))
   <<",\"volumeMm3\":"<<p.volume_mm3<<",\"topology\":"<<archmi::quoted(d.topology)<<",\"manifoldStatus\":"<<d.manifold<<",\"reflectionWinding\":"<<(d.reflected?"true":"false")<<",\"transforms\":[";
  for(size_t j=0;j<d.transforms.size();++j){if(j)s<<',';s<<'[';for(int k=0;k<12;++k){if(k)s<<',';s<<d.transforms[j][k];}s<<']';}s<<"]}";
 }
 s<<"],\"sourceModelPath\":"<<archmi::quoted(c.facts.path)<<",\"sourceObjectIds\":[";
 bool first=true;for(auto id:c.facts.objects){if(!first)s<<',';s<<id;first=false;}
 s<<"],\"sourceMetadata\":[";
 for(size_t i=0;i<c.facts.metadata.size();++i){if(i)s<<',';s<<"{\"name\":"<<archmi::quoted(c.facts.metadata[i].first)<<",\"value\":"<<archmi::quoted(c.facts.metadata[i].second)<<'}';}
 s<<"],\"sourceSemanticAttributes\":[";
 for(size_t i=0;i<c.facts.attributes.size();++i){if(i)s<<',';auto& a=c.facts.attributes[i];s<<"{\"element\":"<<archmi::quoted(a[0])<<",\"attribute\":"<<archmi::quoted(a[1])<<",\"value\":"<<archmi::quoted(a[2])<<'}';}
 s<<"],\"sourceIndexMapping\":"<<archmi::quoted(c.source_vertices.empty()?"retained-in-original-bytes":"original-v-and-f-record-zero-based; no-coordinate-welding")
  <<",\"sourceMaterialNames\":[";
 for(size_t i=0;i<c.sourceMaterialNames.size();++i){if(i)s<<',';s<<(c.sourceMaterialNames[i].empty()?"null":archmi::quoted(c.sourceMaterialNames[i]));}
 s<<"],\"sourceLibraryDirectives\":[";
 for(size_t i=0;i<c.sourceLibraries.size();++i){if(i)s<<',';s<<archmi::quoted(c.sourceLibraries[i]);}
 s<<"],\"operandReports\":"<<c.operandReports<<",\"sourceCount\":"<<(1+c.operands.size())<<"}";c.report=s.str();need(c.report.size()<=1024*1024,"REPORT_BOUND");
}
}
namespace {
std::map<uint32_t,std::shared_ptr<Context>> registry;uint32_t nextId=1;std::string lastError;
Context& get(uint32_t id){auto it=registry.find(id);need(it!=registry.end(),"IMPORT_HANDLE");return *it->second;}
uint64_t memory(){
 uint64_t n=0;for(auto& [id,c]:registry)n+=c->original->size()+c->vertices.size()*8+c->triangles.size()*4+c->face_materials.size()*4+c->report.size()+c->operandReports.size()+(c->source_vertices.size()+c->source_faces.size()+c->source_material_refs.size())*4;
 for(auto& [id,c]:registry)for(auto& operand:c->operands)n+=operand->size();return n;
}
template<class F> int32_t action(uint32_t id,F f){
 try{lastError.clear();auto& c=get(id);need(!c.frozen,"IMPORT_FROZEN");f(c);return 0;}
 catch(const std::exception& e){lastError=e.what();auto it=registry.find(id);if(it!=registry.end()&&!it->second->frozen){auto& c=*it->second;c.state="rejected";c.diagnostic=lastError;c.frozen=true;c.publishable=false;
 c.source_vertices.clear();c.source_faces.clear();c.source_material_refs.clear();c.vertices.clear();c.triangles.clear();c.face_materials.clear();c.parts.clear();c.details.clear();
 try{report(c);}catch(...){c.report=R"({"state":"rejected","diagnostic":"REPORT_FAILURE"})";}}return -1;}
 catch(...){lastError="IMPORT_FAILURE";return -1;}
}
}
uint32_t archmi_abi_version(){return 1;}
const char* archmi_error(){return lastError.c_str();}
uint32_t archmi_begin(uint32_t bytes){
 try{need(bytes>0&&bytes<=MAX_SOURCE&&registry.size()<8&&nextId<0xffffffff&&memory()+bytes<=256u*1024u*1024u,"IMPORT_RESOURCE_LIMIT");
  auto c=std::make_unique<Context>();c->original=std::make_shared<std::vector<uint8_t>>(bytes);uint32_t id=nextId++;registry.emplace(id,std::move(c));return id;
 }catch(const std::exception& e){lastError=e.what();return 0;}
}
int32_t archmi_set_provenance(uint32_t id,const char* source_id,const char* source_name){
 return action(id,[&](Context& c){
  need(c.parts.empty()&&c.sourceId.empty()&&source_id&&source_name,"SOURCE_PROVENANCE_STATE");
  need(std::strlen(source_id)>0&&std::strlen(source_id)<=256&&std::strlen(source_name)<=4096,"SOURCE_PROVENANCE_BOUND");
  c.sourceId=source_id;c.sourceName=source_name;
 });
}
uint8_t* archmi_source_ptr(uint32_t id){try{auto& c=get(id);return c.frozen?nullptr:c.original->data();}catch(...){return nullptr;}}
uint32_t archmi_source_len(uint32_t id){try{return uint32_t(get(id).original->size());}catch(...){return 0;}}
int32_t archmi_decode_3mf(uint32_t id,double budget){return action(id,[&](Context& c){need(c.parts.empty()&&c.format.empty()&&c.materials.empty(),"IMPORT_STARTED");decode_3mf(c);validate(c,budget);});}
int32_t archmi_stage_stl(uint32_t id,const double* xyz,uint32_t faces,uint32_t unit,uint32_t color,uint32_t chosen,const char* name,const char* material_id,const char* material_name,double error){
 return action(id,[&](Context& c){
  need(c.format.empty()||c.format=="stl","IMPORT_FORMAT_MISMATCH");need(unit>=1&&unit<=6,"STL_UNIT_REQUIRED");const double scales[]={0,1,10,25.4,304.8,1000,.001};const char* units[]={"","millimeter","centimeter","inch","foot","meter","micron"};
  need(xyz&&faces>0&&uint64_t(c.triangles.size()/3)+faces<=MAX_FACES&&c.parts.size()<MAX_PARTS,"MESH_BUDGET");
  need(name&&std::strlen(name)<=4096&&std::isfinite(error)&&error>=0,"STL_METADATA");
  if(!c.parts.empty())need(c.unit==units[unit],"STL_UNIT_MISMATCH");
  c.format="stl";c.unit=units[unit];c.unitOrigin="user";c.numericError=std::max(c.numericError,error);
  uint32_t mat=NO_MATERIAL;
  need(chosen<=1,"STL_MATERIAL_CHOICE");
  if(chosen){need(material_id&&material_name&&std::strlen(material_id)>0&&std::strlen(material_id)<=256&&std::strlen(material_name)<=256,"STL_MATERIAL_ID");
   for(uint32_t i=0;i<c.materials.size();++i)if(c.materials[i].id==material_id){need(c.materials[i].rgba==color&&c.materials[i].name==material_name,"STL_MATERIAL_ID_COLLISION");mat=i;}
   if(mat==NO_MATERIAL){need(c.materials.size()<MAX_MATERIALS,"MATERIAL_BUDGET");mat=uint32_t(c.materials.size());c.materials.push_back({material_id,material_name,color});}}
  ArchmiPart part{};part.vertex_start=uint32_t(c.vertices.size()/3);part.triangle_start=uint32_t(c.triangles.size()/3);part.triangle_count=faces;part.source_index=uint32_t(c.parts.size());
  std::map<std::array<double,3>,uint32_t> index;
  for(uint32_t i=0;i<faces*3;++i){
   std::array<double,3> p;
   for(int j=0;j<3;++j){double v=xyz[i*3+j]*scales[unit];need(std::isfinite(v)&&std::abs(v)<=10000,"COORDINATE_DOMAIN");p[j]=v==0?0:v;c.numericError=std::max(c.numericError,error+std::abs(v)*8*std::numeric_limits<double>::epsilon());}
   auto found=index.find(p);
   if(found==index.end()){need(c.vertices.size()/3<MAX_VERTICES,"VERTEX_BUDGET");uint32_t vi=uint32_t(c.vertices.size()/3);index[p]=vi;c.vertices.insert(c.vertices.end(),p.begin(),p.end());c.triangles.push_back(vi);}
   else c.triangles.push_back(found->second);
   if(i%3==0)c.face_materials.push_back(mat);
  }
  part.vertex_count=uint32_t(index.size());c.parts.push_back(part);
  Detail detail;detail.id="solid-"+std::to_string(c.parts.size()-1);detail.name=name;c.details.push_back(std::move(detail));
  need(memory()<=256u*1024u*1024u,"IMPORT_RESOURCE_LIMIT");
 });
}
int32_t archmi_add_material(uint32_t id,uint32_t index,const char* mid,const char* name,uint32_t rgba){
 return action(id,[&](Context& c){
  need(c.parts.empty()&&(c.format.empty()||c.format=="obj")&&index==c.materials.size()&&index<MAX_MATERIALS,"OBJ_MATERIAL_TABLE_STATE");
  need(mid&&name&&std::strlen(mid)>0&&std::strlen(mid)<=256&&std::strlen(name)<=256,"OBJ_MATERIAL_ID");
  for(auto& m:c.materials)need(m.id!=mid,"OBJ_MATERIAL_ID_COLLISION");
  c.format="obj";c.materials.push_back({mid,name,rgba});
 });
}
int32_t archmi_obj_source_material(uint32_t id,uint32_t index,const char* name){
 return action(id,[&](Context& c){
  need(c.parts.empty()&&(c.format.empty()||c.format=="obj")&&index==c.sourceMaterialNames.size()&&index<MAX_MATERIALS,"OBJ_SOURCE_MATERIAL_STATE");
  need(name&&std::strlen(name)<=256,"OBJ_SOURCE_MATERIAL_NAME");
  for(auto& n:c.sourceMaterialNames)need(n!=name,"OBJ_SOURCE_MATERIAL_COLLISION");
  c.format="obj";c.sourceMaterialNames.emplace_back(name);
 });
}
int32_t archmi_obj_library(uint32_t id,const char* directive){
 return action(id,[&](Context& c){
  need(c.parts.empty()&&(c.format.empty()||c.format=="obj")&&c.sourceLibraries.size()<128&&directive&&std::strlen(directive)>0&&std::strlen(directive)<=256,"OBJ_LIBRARY_BOUND");
  c.format="obj";c.sourceLibraries.emplace_back(directive);
 });
}
int32_t archmi_stage_obj(uint32_t id,const double* xyz,uint32_t vertices,const uint32_t* triangles,uint32_t faces,const uint32_t* materials,const uint32_t* source_vertices,const uint32_t* source_faces,const uint32_t* source_materials,uint32_t unit,const char* name,double error){
 return action(id,[&](Context& c){
  need((c.format.empty()||c.format=="obj")&&unit>=1&&unit<=6,"OBJ_UNIT_OR_FORMAT");
  const double scales[]={0,1,10,25.4,304.8,1000,.001};const char* units[]={"","millimeter","centimeter","inch","foot","meter","micron"};
  need(xyz&&triangles&&materials&&source_vertices&&source_faces&&source_materials&&vertices>0&&faces>0,"OBJ_MESH_POINTERS");
  need(uint64_t(c.vertices.size()/3)+vertices<=MAX_VERTICES&&uint64_t(c.triangles.size()/3)+faces<=MAX_FACES&&c.parts.size()<MAX_PARTS,"MESH_BUDGET");
  need(name&&std::strlen(name)<=256&&std::isfinite(error)&&error>=0,"OBJ_METADATA");
  if(!c.parts.empty())need(c.unit==units[unit],"OBJ_UNIT_MISMATCH");
  c.format="obj";c.unit=units[unit];c.unitOrigin="user";c.numericError=std::max(c.numericError,error);
  ArchmiPart p{};p.vertex_start=uint32_t(c.vertices.size()/3);p.vertex_count=vertices;p.triangle_start=uint32_t(c.triangles.size()/3);p.triangle_count=faces;p.source_index=uint32_t(c.parts.size());
  std::set<uint32_t> unique;
  for(uint32_t i=0;i<vertices;++i){
   need(source_vertices[i]<MAX_VERTICES&&unique.insert(source_vertices[i]).second,"OBJ_SOURCE_VERTEX_INDEX");c.source_vertices.push_back(source_vertices[i]);
   for(int k=0;k<3;++k){double n=xyz[i*3+k]*scales[unit];need(std::isfinite(n)&&std::abs(n)<=10000,"COORDINATE_DOMAIN");c.vertices.push_back(n);c.numericError=std::max(c.numericError,error+std::abs(n)*8*std::numeric_limits<double>::epsilon());}
  }
  for(uint32_t i=0;i<faces;++i){
   need(materials[i]==NO_MATERIAL||materials[i]<c.materials.size(),"OBJ_MATERIAL_REFERENCE");
   need(source_materials[i]<c.sourceMaterialNames.size()&&source_faces[i]<MAX_FACES,"OBJ_SOURCE_FACE_REFERENCE");
   c.face_materials.push_back(materials[i]);c.source_material_refs.push_back(source_materials[i]);c.source_faces.push_back(source_faces[i]);
   for(int k=0;k<3;++k){need(triangles[i*3+k]<vertices,"OBJ_TRIANGLE_INDEX");c.triangles.push_back(p.vertex_start+triangles[i*3+k]);}
  }
  c.parts.push_back(p);Detail d;d.id="obj-part-"+std::to_string(c.parts.size()-1);d.name=name;c.details.push_back(d);
  need(memory()<=256u*1024u*1024u,"IMPORT_RESOURCE_LIMIT");
 });
}
const uint32_t* archmi_source_vertex_indices(uint32_t id){try{auto& c=get(id);return c.frozen?c.source_vertices.data():nullptr;}catch(...){return nullptr;}}
uint32_t archmi_source_vertex_index_count(uint32_t id){try{auto& c=get(id);return c.frozen?uint32_t(c.source_vertices.size()):0;}catch(...){return 0;}}
const uint32_t* archmi_source_face_indices(uint32_t id){try{auto& c=get(id);return c.frozen?c.source_faces.data():nullptr;}catch(...){return nullptr;}}
const uint32_t* archmi_source_material_refs(uint32_t id){try{auto& c=get(id);return c.frozen?c.source_material_refs.data():nullptr;}catch(...){return nullptr;}}
uint32_t archmi_source_face_index_count(uint32_t id){try{auto& c=get(id);return c.frozen?uint32_t(c.source_faces.size()):0;}catch(...){return 0;}}
int32_t archmi_validate(uint32_t id,double budget){return action(id,[&](Context& c){validate(c,budget);});}
uint32_t archmi_acquire(uint32_t id){try{auto& c=get(id);need(c.frozen&&c.leases<64,"IMPORT_LEASE_LIMIT");++c.leases;return 1;}catch(...){return 0;}}
uint32_t archmi_release(uint32_t id){auto it=registry.find(id);if(it==registry.end())return 0;if(--it->second->leases==0)registry.erase(it);return 1;}
const double* archmi_vertices(uint32_t id){try{auto& c=get(id);return c.frozen?c.vertices.data():nullptr;}catch(...){return nullptr;}}
uint32_t archmi_vertex_count(uint32_t id){try{auto& c=get(id);return c.frozen?uint32_t(c.vertices.size()/3):0;}catch(...){return 0;}}
const uint32_t* archmi_triangles(uint32_t id){try{auto& c=get(id);return c.frozen?c.triangles.data():nullptr;}catch(...){return nullptr;}}
uint32_t archmi_face_count(uint32_t id){try{auto& c=get(id);return c.frozen?uint32_t(c.triangles.size()/3):0;}catch(...){return 0;}}
const uint32_t* archmi_face_materials(uint32_t id){try{auto& c=get(id);return c.frozen?c.face_materials.data():nullptr;}catch(...){return nullptr;}}
const ArchmiPart* archmi_parts(uint32_t id){try{auto& c=get(id);return c.frozen?c.parts.data():nullptr;}catch(...){return nullptr;}}
uint32_t archmi_part_count(uint32_t id){try{auto& c=get(id);return c.frozen?uint32_t(c.parts.size()):0;}catch(...){return 0;}}
const char* archmi_report(uint32_t id){try{return get(id).report.c_str();}catch(...){return nullptr;}}
uint32_t archmi_report_len(uint32_t id){try{return uint32_t(get(id).report.size());}catch(...){return 0;}}
uint32_t archmi_publishable(uint32_t id){try{return get(id).publishable?1:0;}catch(...){return 0;}}
uint32_t archmi_transform(uint32_t id,const double* matrix,double budget){
 try{
  auto& src=get(id);need(src.frozen&&!src.parts.empty()&&matrix,"TRANSFORM_INPUT");
  need(registry.size()<8&&nextId<0xffffffff&&memory()+src.original->size()+std::accumulate(src.operands.begin(),src.operands.end(),uint64_t(0),[](uint64_t n,const auto& b){return n+b->size();})+src.operandReports.size()+src.vertices.size()*8+src.triangles.size()*4+src.face_materials.size()*4+src.report.size()+(src.source_vertices.size()+src.source_faces.size()+src.source_material_refs.size())*4<=256u*1024u*1024u,"IMPORT_RESOURCE_LIMIT");Matrix m;std::copy(matrix,matrix+12,m.begin());matrix_check(m);
  auto out=std::make_unique<Context>(src);out->leases=1;out->frozen=false;out->operation="affine/v1";out->diagnostic.clear();out->numericError=0;bool reflected=determinant(m)<0;
  for(size_t i=0;i<src.vertices.size();i+=3){
   for(int j=0;j<3;++j){
    double n=src.vertices[i]*m[j]+src.vertices[i+1]*m[3+j]+src.vertices[i+2]*m[6+j]+m[9+j];
    need(std::isfinite(n)&&std::abs(n)<=10000,"COORDINATE_DOMAIN");out->vertices[i+j]=n;
    double row=std::abs(m[j])+std::abs(m[3+j])+std::abs(m[6+j]);
    double terms=std::abs(src.vertices[i]*m[j])+std::abs(src.vertices[i+1]*m[3+j])+std::abs(src.vertices[i+2]*m[6+j])+std::abs(m[9+j]);
    out->numericError=std::max(out->numericError,row*src.numericError+terms*16*std::numeric_limits<double>::epsilon());
   }
  }
  if(reflected)for(size_t i=0;i<out->triangles.size();i+=3)std::swap(out->triangles[i+1],out->triangles[i+2]);
  for(auto& d:out->details){d.transforms.insert(d.transforms.begin(),m);if(reflected)d.reflected=!d.reflected;}
  validate(*out,budget);uint32_t result=nextId++;registry.emplace(result,std::move(out));return result;
 }catch(const std::exception& e){lastError=e.what();return 0;}catch(...){lastError="TRANSFORM_FAILURE";return 0;}
}
namespace {
struct BoxOracle{std::array<double,3> lo,hi;};
BoxOracle boxOracle(const Context& c){
 need(c.publishable&&c.parts.size()==1&&c.vertices.size()==24&&c.triangles.size()==36,"CSG_ANALYTIC_BOX_SCOPE");
 BoxOracle b{{INFINITY,INFINITY,INFINITY},{-INFINITY,-INFINITY,-INFINITY}};
 for(size_t i=0;i<c.vertices.size();i++) {b.lo[i%3]=std::min(b.lo[i%3],c.vertices[i]);b.hi[i%3]=std::max(b.hi[i%3],c.vertices[i]);}
 std::set<std::array<double,3>> corners;
 for(size_t i=0;i<c.vertices.size();i+=3){
  std::array<double,3> p{c.vertices[i],c.vertices[i+1],c.vertices[i+2]};
  for(int j=0;j<3;j++)need(b.hi[j]>b.lo[j]&&(p[j]==b.lo[j]||p[j]==b.hi[j]),"CSG_ANALYTIC_BOX_SCOPE");corners.insert(p);
 }
 need(corners.size()==8,"CSG_ANALYTIC_BOX_SCOPE");
 for(size_t i=0;i<c.triangles.size();i+=3){
  bool plane=false;for(int j=0;j<3;j++){double x=c.vertices[c.triangles[i]*3+j];if((x==b.lo[j]||x==b.hi[j])&&x==c.vertices[c.triangles[i+1]*3+j]&&x==c.vertices[c.triangles[i+2]*3+j])plane=true;}
  need(plane,"CSG_ANALYTIC_BOX_SCOPE");
 }
 double volume=(b.hi[0]-b.lo[0])*(b.hi[1]-b.lo[1])*(b.hi[2]-b.lo[2]);
 need(std::abs(volume-c.parts[0].volume_mm3)<=std::max(1e-8,volume*1e-10),"CSG_INPUT_ORACLE");
 return b;
}

void qualifyBoxSurface(const Context& c,const BoxOracle& b){
 std::array<double,6> areas{};
 for(size_t i=0;i<c.vertices.size();i++)need(c.vertices[i]>=b.lo[i%3]&&c.vertices[i]<=b.hi[i%3],"CSG_BOUNDS_ORACLE");
 for(size_t i=0;i<c.triangles.size();i+=3){
  std::array<std::array<double,3>,3> p;for(int v=0;v<3;v++)for(int j=0;j<3;j++)p[v][j]=c.vertices[c.triangles[i+v]*3+j];
  std::array<double,3> u,v,n;for(int j=0;j<3;j++){u[j]=p[1][j]-p[0][j];v[j]=p[2][j]-p[0][j];}
  n={u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]};
  int plane=-1;
  for(int j=0;j<3;j++)if(p[0][j]==p[1][j]&&p[0][j]==p[2][j]){
   if(p[0][j]==b.lo[j]&&n[j]<0)plane=j*2;
   if(p[0][j]==b.hi[j]&&n[j]>0)plane=j*2+1;
  }
  need(plane>=0,"CSG_SURFACE_ORACLE");areas[plane]+=std::abs(n[plane/2])*.5;
 }
 for(int j=0;j<3;j++){
  double expected=(b.hi[(j+1)%3]-b.lo[(j+1)%3])*(b.hi[(j+2)%3]-b.lo[(j+2)%3]);
  for(int side=0;side<2;side++)need(std::abs(areas[j*2+side]-expected)<=std::max(1e-8,expected*1e-10),"CSG_AREA_ORACLE");
 }
}

manifold::Manifold solidFor(const Context& c){
 manifold::MeshGL64 mesh;mesh.vertProperties=c.vertices;mesh.triVerts.assign(c.triangles.begin(),c.triangles.end());
 return manifold::Manifold(mesh);
}
}
uint32_t archmi_boolean(uint32_t target,uint32_t tool,uint32_t op,uint32_t acknowledge,double budget){
 try{
  lastError.clear();need(target!=tool&&op<=1&&acknowledge==1,"CSG_EXPLICIT_TARGET_MATERIAL_REQUIRED");
  auto& a=get(target);auto& b=get(tool);need(a.operands.empty()&&b.operands.empty(),"CSG_CHAIN_UNSUPPORTED");auto ab=boxOracle(a),bb=boxOracle(b);
  need(ab.lo[1]==bb.lo[1]&&ab.hi[1]==bb.hi[1]&&ab.lo[2]==bb.lo[2]&&ab.hi[2]==bb.hi[2],"CSG_ANALYTIC_AXIAL_SCOPE");
  need(ab.lo[0]<bb.lo[0]&&bb.lo[0]<ab.hi[0]&&ab.hi[0]<bb.hi[0],"CSG_CONTACT_OR_CONTAINMENT_UNVERIFIED");
  need(a.report.size()+b.report.size()<=262144&&registry.size()<8&&nextId<0xffffffff&&memory()+a.original->size()+b.original->size()+1024*1024<=256u*1024u*1024u,"IMPORT_RESOURCE_LIMIT");
  auto left=solidFor(a),right=solidFor(b);
  auto result=left.Boolean(right,op==0?manifold::OpType::Add:manifold::OpType::Subtract);
  need(result.Status()==manifold::Manifold::Error::NoError&&!result.IsEmpty(),"CSG_MANIFOLD_REJECTED");
  const double width=op==0?bb.hi[0]-ab.lo[0]:bb.lo[0]-ab.lo[0];
  const double expected=width*(ab.hi[1]-ab.lo[1])*(ab.hi[2]-ab.lo[2]);
  need(std::abs(result.Volume()-expected)<=std::max(1e-8,expected*1e-10),"CSG_VOLUME_ORACLE");
  auto mesh=result.GetMeshGL64();need(!mesh.vertProperties.empty()&&mesh.vertProperties.size()<=3072&&!mesh.triVerts.empty()&&mesh.triVerts.size()<=6144&&mesh.numProp==3,"CSG_OUTPUT_ANALYTIC_SCOPE");
  auto out=std::make_unique<Context>();out->original=a.original;out->operands={b.original};out->operandReports="["+a.report+","+b.report+"]";
  out->sourceId=a.sourceId;out->sourceName=a.sourceName;out->format=a.format;out->unit=a.unit;out->unitOrigin=a.unitOrigin;out->materials=a.materials;out->facts=a.facts;
  out->operation=op==0?"analytic-axial-box-csg/v1:union":"analytic-axial-box-csg/v1:subtract";
  out->vertices=mesh.vertProperties;for(auto index:mesh.triVerts){need(index<mesh.vertProperties.size()/3,"CSG_INDEX");out->triangles.push_back(uint32_t(index));}
  out->face_materials.assign(out->triangles.size()/3,a.face_materials[0]);
  ArchmiPart part{};part.vertex_count=uint32_t(out->vertices.size()/3);part.triangle_count=uint32_t(out->triangles.size()/3);out->parts.push_back(part);
  Detail detail;detail.id="csg-proposal";detail.name="explicit target material";out->details.push_back(detail);
  out->numericError=a.numericError+b.numericError+result.GetTolerance();
  validate(*out,budget);need(out->publishable,"CSG_ERROR_BUDGET");BoxOracle expectedBox=ab;expectedBox.hi[0]=op==0?bb.hi[0]:bb.lo[0];qualifyBoxSurface(*out,expectedBox);
  uint32_t id=nextId++;registry.emplace(id,std::move(out));return id;
 }catch(const std::exception& e){lastError=e.what();return 0;}catch(...){lastError="CSG_FAILURE";return 0;}
}
uint32_t archmi_source_count(uint32_t id){try{return uint32_t(1+get(id).operands.size());}catch(...){return 0;}}
const uint8_t* archmi_source_at_ptr(uint32_t id,uint32_t index){
 try{auto& c=get(id);return index==0?c.original->data():c.operands.at(index-1)->data();}catch(...){return nullptr;}
}
uint32_t archmi_source_at_len(uint32_t id,uint32_t index){
 try{auto& c=get(id);return uint32_t(index==0?c.original->size():c.operands.at(index-1)->size());}catch(...){return 0;}
}


std::shared_ptr<const archmi::Context> archmi::csg_source(uint32_t id){const auto& c=get(id);need(c.frozen&&c.publishable,"CSG_IMPORT_NOT_VALIDATED");return registry.at(id);}
