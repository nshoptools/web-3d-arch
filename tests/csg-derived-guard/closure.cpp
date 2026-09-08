// Child ABI regression of an already generated controller result. No replacement
// SVG/product constructor and no root/controller replay claim.
#include "mechanics.cpp"
#include <fstream>
#include <iostream>
#include <iterator>
void check(bool b,const char*s){if(!b)throw std::runtime_error(s);}
#include "ancestry.h"
#include "fixtures/controller-meta.inc"
#include "fixtures/controller-cutter.inc"
static Manifold box(double x,double y,double z,double w,double h,double d){return Manifold::Cube({w,h,d}).Translate({x,y,z});}
static void archive(const std::string& filename,const Data&d){
 std::ofstream f(filename,std::ios::binary);uint32_t head[]={uint32_t(d.xyz.size()/3),uint32_t(d.tri.size()/3),uint32_t(d.parts.size())};
 f.write((char*)head,sizeof(head));f.write((char*)d.xyz.data(),d.xyz.size()*8);f.write((char*)d.tri.data(),d.tri.size()*4);check(bool(f),"write archive");
}
static void load_controller(const std::string& path,ArchMechResult& out){
 // Bounded test fixture reader of exact ARCH/1 bytes. Production is unchanged.
 std::ifstream f(path,std::ios::binary);check(bool(f),"controller fixture");
 std::vector<char> bytes{std::istreambuf_iterator<char>(f),{}};
 check(bytes.size()>=128&&bytes.size()<1024*1024,"fixture byte bound");
 auto u=[&](size_t i){uint32_t x;check(i+4<=bytes.size(),"u32 bounds");std::memcpy(&x,bytes.data()+i,4);return x;};
 check(u(0)==0x48435241&&u(4)==1&&u(8)==128&&u(12)==bytes.size(),"fixture ARCH1");
 auto read=[&](size_t offset,size_t n,void* dest){check(offset+n<=bytes.size(),"fixture slice");std::memcpy(dest,bytes.data()+offset,n);};
 check(u(20)<100000&&u(24)<200000&&u(28)==4,"actual fixture counts");
 out.vertices.resize(3*size_t(u(20)));read(u(48),out.vertices.size()*8,out.vertices.data());
 out.triangles.resize(3*size_t(u(24)));read(u(52),out.triangles.size()*4,out.triangles.data());
 static_assert(sizeof(ArchMechPart)==40,"ARCH stride");
 out.parts.resize(u(28));read(u(56),out.parts.size()*40,out.parts.data());
 uint32_t nv=0,nt=0;for(const auto&p:out.parts){
  check(p.vertex_start==nv&&p.triangle_start==nt,"fixture ownership");nv+=p.vertex_count;nt+=p.triangle_count;
  check(nv<=out.vertices.size()/3&&nt<=out.triangles.size()/3,"fixture range");
  for(uint32_t t=p.triangle_start;t<nt;t++)for(int a=0;a<3;a++)check(out.triangles[3*size_t(t)+a]>=p.vertex_start&&out.triangles[3*size_t(t)+a]<nv,"fixture index");
 }
 check(nv==out.vertices.size()/3&&nt==out.triangles.size()/3,"fixture coverage");
}
int main(int argc,char**argv){try{
 check(argc==4,"closure_probe case output-prefix controller-original.arch");
 const std::string id=argv[1],prefix=argv[2];
 auto base=std::make_unique<ArchMechResult>();ArchMechRequest q{};
 if(id.rfind("actual-",0)==0){controller_metadata(*base,q);load_controller(argv[3],*base);}
 else{
  q.abi_version=2;q.revision=7;q.product=AM_KEYCHAIN;q.mating_tolerance_mm=.001;q.export_tolerance_mm=.004;
  Data d;d.add(box(0,0,0,1,1,1),0,0,0x112233ff);
  const auto shift=id=="contact-edge"?std::array<double,3>{1,1,0}:id=="contact-point"?std::array<double,3>{1,1,1}:std::array<double,3>{0,0,1};
  d.add(box(shift[0],shift[1],shift[2],1,1,1),1,0,0x223344ff);
  base->vertices=d.xyz;base->triangles=d.tri;base->parts=d.parts;
  for(uint32_t i=0;i<2;i++){
   ArchMechPartInfo info{};info.feature_index=i;info.slot=i+1;for(int k=0;k<16;k++)info.preview_transform[k]=k%5==0?1:0;base->part_info.push_back(info);
   ArchMechFeature f{};copystr(f.id,"source:test:"+std::to_string(i));f.source_id=123+i;f.provenance_id=456+i;base->features.push_back(f);
  }
 }
 Builder builder(q,*base,nullptr);builder.body_h=2.4;builder.capture_guard();
 ArchMechView bv{};check(arch_mech_view(base.get(),&bv),"original view");
 auto*g=arch_mech_guard_take(base.get());check(g&&arch_mech_guard_take(base.get())==nullptr,"take once");
 Data original,derived;uint32_t changedCapTriangles=0;
 for(uint32_t pi=0;pi<bv.part_count;pi++){
  auto a=solid(bv,pi),m=a;const auto group=bv.part_info[pi].assembly_group;
  original.add(a,pi,group,bv.parts[pi].color_rgba);
  if(pi==0){
   if(id=="actual-cut"||id=="actual-foreign-datum"||id=="actual-wrong-owner"||id=="actual-wrong-material")m=a-controller_cutter();
   if(id=="actual-top-removed")m=a-box(-100,-100,2.3,200,200,10);
   if(id=="actual-missing-source")continue;
  }
  if(pi==3&&id=="actual-mechanical-cut")m=a-box(0,0,-1,10,30,10);
  if(pi==1&&id=="contact-overlap")m=a.Translate({0,0,-.00001});
  uint32_t owner=pi,color=bv.parts[pi].color_rgba;
  if(pi==0&&id=="actual-wrong-owner")owner=1;
  if(pi==0&&id=="actual-wrong-material")color^=0x100;
  derived.add(m,owner,group,color);
 }
 if(id=="actual-foreign-datum"){const auto&p=derived.parts[0];for(uint32_t t=p.triangle_start;t<p.triangle_start+p.triangle_count;t++)derived.origins[4*size_t(t)]=1;}
 const auto beforeXYZ=derived.xyz;const auto beforeTri=derived.tri, beforeOrigins=derived.origins;
 archive(prefix+".before.bin",original);archive(prefix+".after.bin",derived);
 std::set<std::array<double,9>> afterFaces;
 for(uint32_t t=0;t<derived.tri.size()/3;t++)afterFaces.insert(oriented_face(derived.xyz.data(),derived.tri.data()+3*size_t(t)));
 for(uint32_t t=0;t<original.tri.size()/3;t++){auto face=oriented_face(original.xyz.data(),original.tri.data()+3*size_t(t));if(face[2]==face[5]&&face[5]==face[8]&&!afterFaces.count(face))changedCapTriangles++;}
 base.reset();
 auto v=derived.view();auto*c=arch_mech_control_create(1);auto*result=arch_mech_guard_check(g,&v,c,1);ArchMechView actual{};
 check(result&&arch_mech_view(result,&actual),"guard result");
 double originalVolume=0,derivedVolume=0;for(const auto&p:original.parts)originalVolume+=p.volume_mm3;for(const auto&p:derived.parts)derivedVolume+=p.volume_mm3;
 std::ofstream f(prefix+".json");f<<std::setprecision(17)<<"{\"id\":\""<<id<<"\",\"verdict\":"<<actual.verdict<<",\"exportBlocked\":"<<actual.export_blocked
 <<",\"resultVertices\":"<<actual.vertex_count<<",\"resultTriangles\":"<<actual.triangle_count<<",\"guardCharge\":"<<arch_mech_guard_charge(g)
 <<",\"inputUnchanged\":"<<(beforeXYZ==derived.xyz&&beforeTri==derived.tri&&beforeOrigins==derived.origins?"true":"false")
 <<",\"originalVolume\":"<<originalVolume<<",\"derivedVolume\":"<<derivedVolume<<",\"changedCapTriangles\":"<<changedCapTriangles<<",\"diagnostics\":[";
 for(uint32_t k=0;k<actual.diagnostic_count;k++){if(k)f<<',';f<<'"'<<actual.diagnostics[k].message<<'"';}f<<"]}\n";
 std::cout<<id<<" verdict="<<actual.verdict<<" changedCaps="<<changedCapTriangles<<'\n';
 for(uint32_t k=0;k<actual.diagnostic_count;k++)std::cout<<actual.diagnostics[k].message<<'\n';
 arch_mech_destroy(result);arch_mech_control_destroy(c);arch_mech_guard_destroy(g);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}

