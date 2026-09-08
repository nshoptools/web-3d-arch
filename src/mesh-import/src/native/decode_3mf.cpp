#include "internal.hpp"
#include "lib3mf_implicit.hpp"
#include <functional>
#include <algorithm>
using namespace Lib3MF;
namespace archmi {
static Matrix transform(const sTransform& s){Matrix m;for(int i=0;i<12;++i)m[i]=s.m_Fields[i/3][i%3];matrix_check(m);return m;}
static uint32_t rgba(const sColor& s){return uint32_t(s.m_Red)<<24|uint32_t(s.m_Green)<<16|uint32_t(s.m_Blue)<<8|s.m_Alpha;}
static std::array<double,3> apply(std::array<double,3> p,const Matrix& m,double& error,double matrixError){
 std::array<double,3> out{};double nextError=0;
 double magnitude=1+std::abs(p[0])+std::abs(p[1])+std::abs(p[2]);
 for(int j=0;j<3;++j){
  out[j]=p[0]*m[j]+p[1]*m[3+j]+p[2]*m[6+j]+m[9+j];
  double row=std::abs(m[j])+std::abs(m[3+j])+std::abs(m[6+j]);
  double terms=std::abs(p[0]*m[j])+std::abs(p[1]*m[3+j])+std::abs(p[2]*m[6+j])+std::abs(m[9+j]);
  nextError=std::max(nextError,row*error+matrixError*(magnitude+3*error)+16*std::numeric_limits<double>::epsilon()*terms);
  need(std::isfinite(out[j])&&std::abs(out[j])<=1e7,"TRANSFORM_INTERMEDIATE_BOUND");
 }
 error=nextError;return out;
}
void decode_3mf(Context& c){
 c.facts=guard_package(*c.original);
 const std::map<std::string,double> units={{"micron",.001},{"millimeter",1},{"centimeter",10},{"inch",25.4},{"foot",304.8},{"meter",1000}};
 auto unit=units.find(c.facts.unit);need(unit!=units.end(),"MODEL_UNIT");
 const double scale=unit->second;c.unit=c.facts.unit;c.unitOrigin=c.facts.unitOrigin;
 auto w=CWrapper::loadLibrary();uint32_t major,minor,micro;w->GetLibraryVersion(major,minor,micro);
 need(major==2&&minor==5&&micro==0,"LIB3MF_VERSION");
 auto model=w->CreateModel();auto reader=model->QueryReader("3mf");
 reader->SetStrictModeActive(true);reader->ReadFromBuffer(CInputVector<uint8_t>(*c.original));
 std::map<std::pair<uint32_t,uint32_t>,uint32_t> materialLookup;
 auto bases=model->GetBaseMaterialGroups();
 while(bases->MoveNext()){
  auto group=bases->GetCurrentBaseMaterialGroup();std::vector<uint32_t> properties;group->GetAllPropertyIDs(properties);
  for(uint32_t prop:properties){
   need(c.materials.size()<MAX_MATERIALS,"MATERIAL_BUDGET");uint32_t index=uint32_t(c.materials.size());
   materialLookup[{group->GetUniqueResourceID(),prop}]=index;
   c.materials.push_back({"base/"+std::to_string(group->GetModelResourceID())+"/"+std::to_string(prop),group->GetName(prop),rgba(group->GetDisplayColor(prop))});
  }
 }
 auto colors=model->GetColorGroups();
 while(colors->MoveNext()){
  auto group=colors->GetCurrentColorGroup();std::vector<uint32_t> properties;group->GetAllPropertyIDs(properties);
  for(uint32_t prop:properties){
   need(c.materials.size()<MAX_MATERIALS,"MATERIAL_BUDGET");uint32_t index=uint32_t(c.materials.size());
   materialLookup[{group->GetUniqueResourceID(),prop}]=index;
   c.materials.push_back({"color/"+std::to_string(group->GetModelResourceID())+"/"+std::to_string(prop),"",rgba(group->GetColor(prop))});
  }
 }
 uint32_t visits=0;
 std::function<void(PObject,std::vector<Matrix>,std::string,uint32_t)> visit;
 visit=[&](PObject object,std::vector<Matrix> chain,std::string instance,uint32_t depth){
  need(depth<32&&++visits<=8192,"BUILD_EXPANSION_BOUND");
  if(object->IsComponentsObject()){
   auto components=model->GetComponentsObjectByID(object->GetUniqueResourceID());
   for(uint32_t i=0;i<components->GetComponentCount();++i){
    auto component=components->GetComponent(i);auto next=chain;
    if(component->HasTransform())next.push_back(transform(component->GetTransform()));
    visit(component->GetObjectResource(),std::move(next),instance+"/component-"+std::to_string(i),depth+1);
   }return;
  }
  need(object->IsMeshObject()&&object->GetType()==eObjectType::Model,"UNSUPPORTED_OBJECT");
  auto mesh=model->GetMeshObjectByID(object->GetUniqueResourceID());
  uint32_t nv=mesh->GetVertexCount(),nf=mesh->GetTriangleCount();
  auto originalCounts=c.facts.objectCounts.at(object->GetModelResourceID());
  need(nv==originalCounts.first&&nf==originalCounts.second,"LIBRARY_GEOMETRY_COUNT_CHANGED");
  need(nv>=3&&nf>0&&c.parts.size()<MAX_PARTS&&uint64_t(c.vertices.size()/3)+nv<=MAX_VERTICES&&uint64_t(c.triangles.size()/3)+nf<=MAX_FACES,"MESH_BUDGET");
  std::vector<sPosition> vertices;std::vector<sTriangle> faces;mesh->GetVertices(vertices);mesh->GetTriangleIndices(faces);
  ArchmiPart part{};part.vertex_start=uint32_t(c.vertices.size()/3);part.vertex_count=nv;
  part.triangle_start=uint32_t(c.triangles.size()/3);part.triangle_count=nf;part.source_index=uint32_t(c.parts.size());
  Detail detail;detail.id=instance+"/object-"+std::to_string(object->GetModelResourceID());detail.object=object->GetModelResourceID();
  detail.name=object->GetName();detail.partnumber=object->GetPartNumber();detail.transforms=chain;
  for(const auto& m:chain)if(determinant(m)<0)detail.reflected=!detail.reflected;
  for(auto& v:vertices){
   std::array<double,3> p{v.m_Coordinates[0],v.m_Coordinates[1],v.m_Coordinates[2]};double error=c.facts.coordinateError;
   for(auto it=chain.rbegin();it!=chain.rend();++it)p=apply(p,*it,error,c.facts.transformError);
   for(double n:p){double mm=n*scale;need(std::isfinite(mm)&&std::abs(mm)<=10000,"COORDINATE_DOMAIN");c.vertices.push_back(mm);}
   c.numericError=std::max(c.numericError,error*scale+std::abs(scale)*1e7*std::numeric_limits<double>::epsilon()*4);
  }
  for(uint32_t i=0;i<nf;++i){
   auto& f=faces[i];for(uint32_t n:f.m_Indices)need(n<nv,"INDEX_BOUND");
   c.triangles.push_back(part.vertex_start+f.m_Indices[0]);
   c.triangles.push_back(part.vertex_start+f.m_Indices[detail.reflected?2:1]);
   c.triangles.push_back(part.vertex_start+f.m_Indices[detail.reflected?1:2]);
   sTriangleProperties property{};mesh->GetTriangleProperties(i,property);
   if(property.m_ResourceID==0)c.face_materials.push_back(NO_MATERIAL);
   else{
    need(property.m_PropertyIDs[0]==property.m_PropertyIDs[1]&&property.m_PropertyIDs[0]==property.m_PropertyIDs[2],"UNSUPPORTED_TRIANGLE_INTERPOLATION");
    auto found=materialLookup.find({property.m_ResourceID,property.m_PropertyIDs[0]});need(found!=materialLookup.end(),"MATERIAL_REFERENCE");
    c.face_materials.push_back(found->second);
   }
  }
  c.parts.push_back(part);c.details.push_back(std::move(detail));
 };
 auto builds=model->GetBuildItems();uint32_t bi=0;
 while(builds->MoveNext()){
  auto item=builds->GetCurrent();std::vector<Matrix> chain;
  if(item->HasObjectTransform())chain.push_back(transform(item->GetObjectTransform()));
  visit(item->GetObjectResource(),std::move(chain),"build-"+std::to_string(bi++),0);
 }
 need(!c.parts.empty(),"BUILD_EMPTY");c.format="3mf";
}
}
