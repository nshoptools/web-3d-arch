#include "source_assembly.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>
extern "C" uint32_t arch_mech_source_datum_extension_version();
namespace {
void u32(std::ostream&s,uint32_t x){for(int i=0;i<4;i++)s.put(char(x>>(8*i)));}
void f64(std::ostream&s,double d){uint64_t q;std::memcpy(&q,&d,8);for(int i=0;i<8;i++)s.put(char(q>>(8*i)));}
void snapshot(const std::string&name,const ArchMechView&v){
  std::ofstream f(name,std::ios::binary);uint32_t offsets[7],end=128;
  const uint32_t counts[]={v.vertex_count,v.triangle_count,v.part_count,0,0,0,0},strides[]={24,12,40,16,16,4,16},align[]={8,4,8,8,4,4,4};
  for(uint32_t i=0;i<7;i++){end=(end+align[i]-1)/align[i]*align[i];offsets[i]=end;end+=counts[i]*strides[i];}
  std::array<uint32_t,32>h{};h[0]=0x48435241;h[1]=1;h[2]=128;h[3]=end;h[4]=uint32_t(v.revision);for(uint32_t i=0;i<7;i++){h[5+i]=counts[i];h[12+i]=offsets[i];}for(auto x:h)u32(f,x);
  for(uint32_t i=0;i<v.vertex_count*3;i++)f64(f,v.vertices_xyz[i]);for(uint32_t i=0;i<v.triangle_count*3;i++)u32(f,v.triangles[i]);while(uint32_t(f.tellp())<offsets[2])f.put(0);
  for(uint32_t i=0;i<v.part_count;i++){auto&p=v.parts[i];for(auto x:{p.vertex_start,p.vertex_count,p.triangle_start,p.triangle_count,p.color_rgba,p.source_index,0u,0u})u32(f,x);f64(f,p.volume_mm3);}while(uint32_t(f.tellp())<end)f.put(0);if(!f)throw std::runtime_error("snapshot write");
}
void param(std::ostream&f,const ArchMechParam&p){f<<"{\"id\":"<<p.field_id<<",\"mode\":"<<p.mode<<",\"origin\":"<<p.origin<<",\"datum\":"<<p.datum<<",\"reference\":"<<p.reference_layer<<",\"count\":"<<p.layer_count<<",\"value\":"<<p.value<<",\"provenance\":\""<<p.provenance_id<<"\"}";}
struct Cancel {uint32_t at,done=0;};
uint32_t cancelled(void*p){auto&c=*static_cast<Cancel*>(p);return c.at&&c.done>=c.at;}
void progress(void*p,uint32_t n,uint32_t){static_cast<Cancel*>(p)->done=n;}
}
int main(int argc,char**argv){try{
#ifndef ARCH_R2_PREIMAGE
  if(arch_source_abi_version()!=1||arch_source_semantics_version()!=2||arch_mech_abi_version()!=2||arch_mech_semantics_version()!=3||arch_mech_source_datum_extension_version()!=1)throw std::runtime_error("source/mechanics post-link getters");
#endif
  if(argc<2)throw std::runtime_error("fixture OUTPUT key=value...");std::string out=argv[1];std::map<std::string,std::string>args;
  for(int i=2;i<argc;i++){std::string s=argv[i];auto k=s.find('=');if(k==s.npos)throw std::runtime_error("argument");args[s.substr(0,k)]=s.substr(k+1);}
  auto opt=[&](const char*k,const char*d){auto it=args.find(k);return it==args.end()?std::string(d):it->second;};uint32_t product=std::stoul(opt("product","0"));
  std::vector<ArchMechParam>parameters;for(uint32_t id=1;id<AM_FIELD_COUNT;id++)parameters.push_back(arch_mech_default_parameter(product,id));
  auto set=[&](const char*name,double v){auto id=arch_mech_field_id(name);if(!id)throw std::runtime_error(name);auto&p=parameters[id-1];p.value=v;p.origin=AM_USER;p.provenance_id=UINT64_C(9007199254740993)+id;};
  if(opt("defaults","0")=="0"){set("size",20);set("outline",1);set("cornerR",0);set("offset",1);set("weld",0);}set("ringOn",0);
  for(auto&[key,val]:args){uint32_t id=arch_mech_field_id(key.c_str());if(id)set(key.c_str(),std::stod(val));}
  int64_t regular=int64_t(std::llround(std::stod(opt("h",".2"))*1e6)),first=int64_t(std::llround(std::stod(opt("h0",".2"))*1e6));parameters[AM_F_layerH-1].value=regular/1e6;
  for(auto&[key,val]:args)if(key.rfind("layers.",0)==0){uint32_t id=arch_mech_field_id(key.substr(7).c_str());if(!id)throw std::runtime_error("layer field");std::stringstream s(val);std::string a,b,c;std::getline(s,a,',');std::getline(s,b,',');std::getline(s,c,',');auto&p=parameters[id-1];p.mode=AM_LAYERS;p.layer_count=std::stoul(a);p.reference_layer=std::stoul(b);p.datum=std::stoul(c);p.origin=AM_USER;}
  auto bind=[&](ArchMechParam& p,const std::string& value,uint32_t mode){
    std::stringstream stream(value);std::string a,b,c;std::getline(stream,a,',');std::getline(stream,b,',');std::getline(stream,c,',');
    p.mode=mode;p.origin=AM_USER;p.reference_layer=std::stoul(b);p.datum=std::stoul(c);
    if(mode==AM_MM)p.value=std::stod(a);else p.layer_count=std::stoul(a);
  };
  for(auto&[key,val]:args)if(key.rfind("mm.",0)==0){auto id=arch_mech_field_id(key.substr(3).c_str());if(!id)throw std::runtime_error("MM field");bind(parameters[id-1],val,AM_MM);}
  std::vector<int64_t>xy;std::vector<ArchMechRing>rings;std::vector<ArchSourceRegion>regions;std::vector<ArchSourceText>texts;std::vector<ArchMechMaterial>palette;
  auto ring=[&](std::vector<std::array<double,2>>p){uint32_t start=uint32_t(xy.size()/2);for(auto q:p){xy.push_back(int64_t(std::llround(q[0]*1e6)));xy.push_back(int64_t(std::llround(q[1]*1e6)));}rings.push_back({start,uint32_t(p.size()),1000+rings.size()});};
  auto rect=[&](double x0,double y0,double x1,double y1){ring({{x0,y0},{x1,y0},{x1,y1},{x0,y1}});};
  auto region=[&](uint64_t id,uint32_t start,uint32_t count,uint32_t color,uint32_t slot,uint64_t group=0){ArchSourceRegion a{};a.ring_start=start;a.ring_count=count;a.semantic_id=id;a.provenance_id=id+1000;a.text_group=group;a.material={uint32_t(group?AM_TEXT:AM_ARTWORK),color,slot,AM_AUTO,id+2000};regions.push_back(a);};
  const auto pattern=opt("pattern","rect");
  if(pattern=="accent"){rect(-10,-5,8,4);region(101,0,1,0xe04444ff,2);rect(8.4,4.2,10,5);region(102,1,1,0x3388eeff,3);}
  else if(pattern=="point"){ring({{-10,-5},{0,-5},{0,0},{-10,0}});ring({{0,0},{10,0},{10,5},{0,5}});region(101,0,2,0xe04444ff,2);}
  else if(pattern=="slope"){ring({{-10,-5},{0,-4.999999},{0,5},{-10,5}});region(101,0,1,0xe04444ff,2);ring({{0,-4.999999},{10,-5},{10,5},{0,5},{0,0}});region(102,1,1,0x3388eeff,3);}
  else{double extent=pattern=="square"?10:5;rect(-10,-extent,0,extent);uint32_t count=1;if(pattern=="hole"){ring({{-8,-1},{-8,1},{-6,1},{-6,-1}});count++;}region(101,0,count,0xe04444ff,2);rect(pattern=="overlap"?-1:0,-extent,10,extent);region(102,count,1,0x3388eeff,3);}
  if(pattern=="rawedge")xy[2]=xy[0]+1,xy[3]=xy[1]+1;
  if(opt("override","0")!="0"){regions[0].override_height=1;regions[0].height=parameters[AM_F_artH-1];regions[0].height.mode=AM_MM;regions[0].height.value=std::stod(opt("override","0"));regions[0].height.origin=AM_USER;regions[0].height.provenance_id=777;}
  if(opt("roleoverride","0")=="1"){palette.push_back({AM_BODY,0x998811ff,6,AM_USER,8001});palette.push_back({AM_ARTWORK,0x112233ff,7,AM_USER,8002});regions[0].material.origin=AM_USER;}
  auto txt=opt("text","none");if(txt!="none"){
    double x=txt=="bed"?std::stod(opt("textx","30")):-2;uint32_t start=uint32_t(rings.size());rect(x,-1,x+3,1);region(201,start,1,0xffffffff,4,501);start=uint32_t(rings.size());rect(x+1,1.4,x+2,2);region(202,start,1,0xffffffff,4,501);
    ArchSourceText t{};t.semantic_id=501;t.provenance_id=1501;t.placement=txt=="bed"?1:0;t.base_on=txt=="nobase"?0:1;t.base_pad=.5;t.base_round=.3;t.height={0,AM_MM,AM_USER,AS_TEXT_BOTTOM,0,0,.8,5101};t.base_height={0,AM_MM,AM_USER,AS_TEXT_BASE_BOTTOM,0,0,.6,5102};texts.push_back(t);
    if(txt=="outside")texts[0].base_pad=8;
    if(opt("textlayers","0")=="1"){texts[0].height.mode=AM_LAYERS;texts[0].height.layer_count=4;texts[0].height.reference_layer=3;texts[0].base_height.mode=AM_LAYERS;texts[0].base_height.layer_count=2;}
  }
  if(!texts.empty()){
    auto& t=texts[0];
    if(opt("textbinding","legacy")=="unspecified"){t.height.datum=AM_BED;t.height.reference_layer=0;t.base_height.datum=AM_BED;t.base_height.reference_layer=0;}
    for(auto&[key,val]:args){
      if(key=="text.height.mm")bind(t.height,val,AM_MM);
      if(key=="text.base.mm")bind(t.base_height,val,AM_MM);
      if(key=="text.height.layers")bind(t.height,val,AM_LAYERS);
      if(key=="text.base.layers")bind(t.base_height,val,AM_LAYERS);
    }
  }
  if(opt("overridebinding","")!="")bind(regions[0].height,opt("overridebinding",""),opt("overridemode","mm")=="layers"?AM_LAYERS:AM_MM);
  if(opt("samecolor","0")=="1"){regions[1].material=regions[0].material;}
  if(opt("reverse","0")=="1")std::reverse(regions.begin(),regions.end());
  std::vector<ArchMechParam>upstream(parameters.begin(),parameters.begin()+7);if(opt("stale","0")=="1")upstream[0].value+=1;
  ArchSourceRequest request{};request.abi_version=1;request.product=product;request.parameter_count=uint32_t(parameters.size());request.parameters=parameters.data();request.material_count=uint32_t(palette.size());request.materials=palette.data();request.schedule={1,0,0,0,first,regular,1234};
  request.point_count=uint32_t(xy.size()/2);request.ring_count=uint32_t(rings.size());request.region_count=uint32_t(regions.size());request.text_count=uint32_t(texts.size());request.xy=xy.data();request.rings=rings.data();request.regions=regions.data();request.texts=texts.data();request.upstream_binding_count=7;request.upstream_bindings=upstream.data();request.max_slabs=std::stoul(opt("slabs","1024"));request.max_points=std::stoul(opt("points","200000"));request.max_operations=std::stoul(opt("ops","100000"));request.tolerance_mm=std::stod(opt("tol",".001"));request.source_id=77;request.provenance_id=88;request.revision=42;request.eyelet_text_id=opt("eyelet","0")=="1"?501:0;
  auto beforexy=xy;auto beforeparams=parameters;auto beforeregions=regions;auto beforetexts=texts;Cancel cancel{uint32_t(std::stoul(opt("cancel","0")))};ArchSourceControl control{&cancel,cancelled,progress};
  ArchSourceResult*result=nullptr;
  if(opt("indexed","0")=="1"){
    std::vector<int64_t>pool;std::map<std::pair<int64_t,int64_t>,uint32_t>unique;std::vector<uint32_t>indices;std::vector<ArchSourceContour>contours;
    for(uint32_t i=0;i<rings.size();i++){auto&rr=rings[i];uint32_t owner=0;for(uint32_t j=0;j<regions.size();j++)if(i>=regions[j].ring_start&&i<regions[j].ring_start+regions[j].ring_count)owner=j;ArchSourceContour c{uint32_t(indices.size()),rr.point_count,owner,0};
      for(uint32_t j=0;j<rr.point_count;j++){auto n=rr.point_start+j;std::pair<int64_t,int64_t>pt{xy[2*n],xy[2*n+1]};auto it=unique.find(pt);if(it==unique.end()){it=unique.emplace(pt,uint32_t(pool.size()/2)).first;pool.push_back(pt.first);pool.push_back(pt.second);}indices.push_back(it->second);}contours.push_back(c);}
    if(opt("badindex","0")=="1")indices[0]=uint32_t(pool.size()/2);
    ArchSourceIndexed indexed{uint32_t(pool.size()/2),uint32_t(contours.size()),uint32_t(indices.size()),uint32_t(regions.size()),pool.data(),contours.data(),indices.data(),regions.data()};result=arch_source_build_indexed(&request,&indexed,&control);
  }else result=arch_source_build(&request,&control);
  if(!result)throw std::runtime_error("source allocation");ArchSourceView v{};arch_source_view(result,&v);auto borrowed=arch_assembly_source(result);if(bool(borrowed)!=(v.verdict==AS_OK))throw std::runtime_error("getter validity");
  auto equal=[](const auto&a,const auto&b){return a.size()==b.size()&&(a.empty()||!std::memcmp(a.data(),b.data(),a.size()*sizeof(a[0])));};bool immutable=xy==beforexy&&equal(parameters,beforeparams)&&equal(regions,beforeregions)&&equal(texts,beforetexts);
  auto bytes=[](const void* p,size_t n){const auto* q=static_cast<const unsigned char*>(p);return n?std::vector<unsigned char>(q,q+n):std::vector<unsigned char>();};
  const auto savedxy=bytes(v.source.xy,v.source.point_count*2*sizeof(int64_t)),savedslabs=bytes(v.source.slabs,v.source.slab_count*sizeof(ArchMechSlab)),
    savedparams=bytes(v.parameters,v.parameter_count*sizeof(ArchMechParam)),savedintervals=bytes(v.intervals,v.interval_count*sizeof(ArchSourceInterval)),
    savedlineage=bytes(v.lineage,v.lineage_count*sizeof(ArchSourceLineage));
  auto bad=request;bad.abi_version=99;auto failed=arch_source_build(&bad,nullptr);ArchSourceView fv{};arch_source_view(failed,&fv);bool lifetime=fv.verdict==AS_INVALID&&fv.source.slab_count==0&&fv.source.point_count==0&&fv.source.ring_count==0&&!arch_assembly_source(failed)
    &&savedxy==bytes(v.source.xy,v.source.point_count*2*sizeof(int64_t))&&savedslabs==bytes(v.source.slabs,v.source.slab_count*sizeof(ArchMechSlab))
    &&savedparams==bytes(v.parameters,v.parameter_count*sizeof(ArchMechParam))&&savedintervals==bytes(v.intervals,v.interval_count*sizeof(ArchSourceInterval))
    &&savedlineage==bytes(v.lineage,v.lineage_count*sizeof(ArchSourceLineage));arch_source_destroy(failed);
  ArchMechView mv{};ArchMechResult*mesh=nullptr;
  if(v.verdict==AS_OK){ArchMechRequest mr{};mr.abi_version=2;mr.product=product;mr.parameters=v.parameters;mr.parameter_count=v.parameter_count;mr.materials=palette.data();mr.material_count=uint32_t(palette.size());mr.schedule=request.schedule;mr.source=*borrowed;mr.revision=42;mr.mating_tolerance_mm=.001;mr.export_tolerance_mm=.004;if(opt("badfootprint","0")=="1"){mr.source.footprint_ring_start=mr.source.slabs[mr.source.slab_count-1].ring_start;mr.source.footprint_ring_count=mr.source.slabs[mr.source.slab_count-1].ring_count;}mesh=arch_mech_build(&mr);if(!mesh)throw std::runtime_error("mechanics allocation");arch_mech_view(mesh,&mv);}
  snapshot(out+".bin",mv);std::ofstream f(out+".json");f<<std::setprecision(17);f<<"{\"version\":1,\"verdict\":"<<v.verdict<<",\"mechanicsVerdict\":"<<(mesh?int(mv.verdict):-1)<<",\"immutable\":"<<(immutable?"true":"false")<<",\"lifetime\":"<<(lifetime?"true":"false")<<",\"bridge\":"<<arch_mech_source_datum_extension_version()<<",\"operations\":"<<v.operations<<",\"proposals\":"<<v.proposal_count<<",\"slabs\":[";
  for(uint32_t i=0;i<v.source.slab_count;i++){if(i)f<<',';auto&s=v.source.slabs[i];f<<"{\"id\":\""<<s.semantic_id<<"\",\"source\":\""<<v.lineage[i].source_id<<"\",\"stage\":"<<v.lineage[i].stage<<",\"role\":"<<s.role<<",\"color\":"<<s.rgba<<",\"slot\":"<<s.slot<<",\"origin\":"<<s.origin<<",\"lo\":"<<s.z0<<",\"hi\":"<<s.z1<<",\"attachment\":\""<<s.attachment_id<<"\",\"rings\":[";
    for(uint32_t j=0;j<s.ring_count;j++){if(j)f<<',';f<<'[';auto&ring=v.source.rings[s.ring_start+j];for(uint32_t k=0;k<ring.point_count;k++){if(k)f<<',';uint32_t n=ring.point_start+k;f<<'['<<v.source.xy[2*n]/1e6<<','<<v.source.xy[2*n+1]/1e6<<']';}f<<']';}f<<"]}";}
  f<<"],\"contacts\":[";for(uint32_t i=0;i<v.contact_count;i++){if(i)f<<',';auto&c=v.contacts[i];f<<'['<<c.slab_a<<','<<c.slab_b<<','<<c.kind<<','<<c.area_mm2<<','<<c.z0<<','<<c.z1<<']';}
  f<<"],\"intervals\":[";for(uint32_t i=0;i<v.interval_count;i++){if(i)f<<',';auto&a=v.intervals[i];f<<'['<<a.field_id<<','<<a.datum<<','<<a.mode<<','<<a.reference_layer<<','<<a.z0<<','<<a.z1<<']';}
  f<<"],\"parameters\":[";for(uint32_t i=0;i<v.parameter_count;i++){if(i)f<<',';param(f,v.parameters[i]);}
  f<<"],\"diagnostics\":[";for(uint32_t i=0;i<v.diagnostic_count;i++){if(i)f<<',';f<<'"'<<v.diagnostics[i].message<<'"';}f<<"],\"mechanicsDiagnostics\":[";for(uint32_t i=0;i<mv.diagnostic_count;i++){if(i)f<<',';f<<'"'<<mv.diagnostics[i].message<<'"';}
  f<<"],\"parts\":[";for(uint32_t i=0;i<mv.part_count;i++){if(i)f<<',';auto&pi=mv.part_info[i];f<<"{\"role\":"<<pi.role<<",\"group\":"<<pi.assembly_group<<",\"preview\":[";for(int j=0;j<16;j++){if(j)f<<',';f<<pi.preview_transform[j];}f<<"]}";}
  f<<"],\"abiSizes\":["<<sizeof(ArchSourceRequest)<<','<<sizeof(ArchSourceView)<<','<<sizeof(ArchSourceIndexed)<<','<<sizeof(ArchSourceRegion)<<','<<sizeof(ArchSourceText)<<','<<sizeof(ArchSourceLineage)<<"],\"inputRegions\":[";
  for(uint32_t i=0;i<v.input_region_count;i++){if(i)f<<',';f<<"{\"id\":\""<<v.input_regions[i].semantic_id<<"\",\"height\":";param(f,v.input_regions[i].height);f<<'}';}
  f<<"],\"errors\":[";for(uint32_t i=0;i<v.error_count;i++){if(i)f<<',';auto&e=v.errors[i];f<<'['<<e.stage<<','<<e.segments<<','<<e.radius<<','<<e.signed_min_mm<<','<<e.signed_max_mm<<']';}
  f<<"],\"semanticsVersion\":"<<v.semantics_version<<",\"bodyDatumZ\":"<<v.body_datum_z<<",\"exportBlocked\":"<<v.export_blocked;
#ifndef ARCH_R2_PREIMAGE
  if(v.semantics_version!=arch_source_semantics_version())throw std::runtime_error("semantics getter mismatch");
#endif
  f<<",\"inputTexts\":[";for(uint32_t i=0;i<v.input_text_count;i++){if(i)f<<',';f<<"{\"id\":\""<<v.input_texts[i].semantic_id<<"\",\"height\":";param(f,v.input_texts[i].height);f<<",\"baseHeight\":";param(f,v.input_texts[i].base_height);f<<'}';}
  f<<"]}\n";if(!f)throw std::runtime_error("metadata write");std::cout<<"source="<<v.verdict<<" mesh="<<(mesh?int(mv.verdict):-1)<<" slabs="<<v.source.slab_count<<" parts="<<mv.part_count<<'\n';for(uint32_t i=0;i<v.diagnostic_count;i++)std::cout<<v.diagnostics[i].message<<'\n';if(mesh&&mv.verdict)for(uint32_t i=0;i<mv.diagnostic_count;i++)std::cout<<mv.diagnostics[i].message<<'\n';arch_mech_destroy(mesh);arch_source_destroy(result);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
