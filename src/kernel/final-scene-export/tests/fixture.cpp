#include "final_scene_export.h"
#include <manifold/manifold.h>
#include <vector>
#include <memory>
#include <cstring>
#include <stdexcept>
using manifold::Manifold;
struct FinalFixture {std::vector<double> vertices;std::vector<uint32_t> triangles;std::vector<ArchPart> parts;};
extern "C" void* arch_final_fixture_create(uint32_t index){
 try{
  auto r=std::make_unique<FinalFixture>();std::vector<Manifold> parts;
  auto box=[](double x,double y,double z,double a,double b,double c){return Manifold::Cube({a,b,c}).Translate({x,y,z});};
  switch(index){
   case 0:parts={box(0,0,0,10,10,10),box(5,0,0,10,10,10)};break;
   case 1:parts={box(0,0,0,10,10,10),box(10,0,0,10,10,10)};break;
   case 2:parts={box(0,0,0,20,10,4)-box(8,3,-1,4,4,6)};break;
   case 3:parts={box(0,0,0,20,10,4)-box(8,3,-1,4,4,3)};break;
   case 4:parts={box(0,0,0,10,10,10),box(15,0,0,10,10,10)};break;
   case 5:parts={box(0,0,0,10,10,10),box(10,10,10,10,10,10)};break;
   case 6:parts={box(0,0,0,10,10,10),box(10,10,0,10,10,10)};break;
   case 7:parts={box(1,2,3,4,5,6)};break;
   case 8:parts={box(0,0,0,10,10,10)};break;
   case 9:parts={box(9000,0,0,1,1,1),box(9001.00001,0,0,1,1,1)};break;
   case 10:parts={box(0,0,0,10,10,10),box(0,0,0,10,10,10)};break;
   case 11:parts={box(0,0,0,10,10,10).Rotate(0,30,0)};break;
   case 12:parts={box(0,0,0,10,10,10),box(10,0,0,10,10,10),box(20,0,0,10,10,10)};break;
   case 13:parts={box(0,0,0,10,10,10),box(0,0,15,10,10,10)};break;
   case 14:parts={box(0,0,0,20,10,4)-box(8,3,-1,.0000015,4,6)};break;
   case 15:parts={box(0,0,0,20,10,4)-box(8,3,-1,.000008,4,6)};break;
   case 16:parts={box(0,0,0,10,10,4)-box(8,3,-1,4,4,6),box(10,0,0,10,10,4)-box(8,3,-1,4,4,6)};break;
   case 17:parts={box(0,0,0,10,10,2),box(0,0,2,10,10,2)};break;
   case 200:for(int i=0;i<160;++i)parts.push_back(box((i%20)*11.,(i/20)*11.,0,10,10,10));break;
   default:
    if(index>=100&&index<164){uint32_t seed=0xAFE12069u+index*1664525u;double a=3+(seed%70)*.1;double shift=a*(1+(seed%7))*.1;parts={box(0,0,0,a,7,3),box(shift,0,0,a,7,3)};}
    else return nullptr;
  }
  for(uint32_t i=0;i<parts.size();++i){if(parts[i].Status()!=Manifold::Error::NoError)return nullptr;auto mesh=parts[i].GetMeshGL64();ArchPart p{};
   p.vertex_start=uint32_t(r->vertices.size()/3);p.vertex_count=uint32_t(mesh.NumVert());p.triangle_start=uint32_t(r->triangles.size()/3);p.triangle_count=uint32_t(mesh.NumTri());p.source_index=101+i;p.color_rgba=i%2?0x0000ffff:0xff0000ff;p.volume_mm3=parts[i].Volume();
   for(size_t v=0;v<mesh.NumVert();++v)for(int a=0;a<3;++a)r->vertices.push_back(mesh.vertProperties[v*mesh.numProp+a]);
   for(auto t:mesh.triVerts)r->triangles.push_back(uint32_t(t)+p.vertex_start);
   if(index==8){r->triangles.resize(r->triangles.size()-3);--p.triangle_count;}
   r->parts.push_back(p);
  }return r.release();
 }catch(...){return nullptr;}
}
extern "C" uint32_t arch_final_fixture_view(const void* handle,ArchSceneView* view){if(!handle||!view)return 0;const auto* p=static_cast<const FinalFixture*>(handle);*view={};view->abi_version=1;view->vertex_count=uint32_t(p->vertices.size()/3);view->triangle_count=uint32_t(p->triangles.size()/3);view->part_count=uint32_t(p->parts.size());view->vertices_xyz=p->vertices.data();view->triangles=p->triangles.data();view->parts=p->parts.data();return 1;}
extern "C" void arch_final_fixture_destroy(void* p){delete static_cast<FinalFixture*>(p);}
