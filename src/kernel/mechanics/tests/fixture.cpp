#include "mechanics.h"
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#ifndef __EMSCRIPTEN__
#include <thread>
#endif

// Test fixture producer only; no mesh parser, UI serializer or source importer.
namespace {
void u32(std::ostream& s,uint32_t x){for(int i=0;i<4;i++)s.put(char(x>>(8*i)));}
void f64(std::ostream& s,double d){uint64_t q;std::memcpy(&q,&d,8);for(int i=0;i<8;i++)s.put(char(q>>(8*i)));}
void f32(std::ostream& s,double d){float f=(float)d;uint32_t q;std::memcpy(&q,&f,4);u32(s,q);}
std::string quote(const char* p){std::string s="\"";for(;*p;p++){if(*p=='"'||*p=='\\')s+='\\';if(*p=='\n'){s+="\\n";continue;}s+=*p;}return s+'"';}
void snapshot(const std::string& name,const ArchMechView& v){
  std::ofstream f(name,std::ios::binary);if(!f)throw std::runtime_error("snapshot output");
  uint32_t offsets[7];uint32_t end=128;
  const uint32_t counts[]={v.vertex_count,v.triangle_count,v.part_count,0,0,0,0},strides[]={24,12,40,16,16,4,16},align[]={8,4,8,8,4,4,4};
  for(uint32_t i=0;i<7;i++){end=(end+align[i]-1)/align[i]*align[i];offsets[i]=end;end+=counts[i]*strides[i];}
  std::array<uint32_t,32> h{};h[0]=0x48435241;h[1]=1;h[2]=128;h[3]=end;h[4]=(uint32_t)v.revision;
  for(uint32_t i=0;i<7;i++){h[5+i]=counts[i];h[12+i]=offsets[i];}for(auto x:h)u32(f,x);
  for(uint32_t i=0;i<v.vertex_count*3;i++)f64(f,v.vertices_xyz[i]);
  for(uint32_t i=0;i<v.triangle_count*3;i++)u32(f,v.triangles[i]);
  while(uint32_t(f.tellp())<offsets[2])f.put(0);
  for(uint32_t i=0;i<v.part_count;i++){
    const auto& p=v.parts[i];for(auto x:{p.vertex_start,p.vertex_count,p.triangle_start,p.triangle_count,p.color_rgba,p.source_index,0u,0u})u32(f,x);f64(f,p.volume_mm3);
  }
  while(uint32_t(f.tellp())<end)f.put(0);
  if(!f)throw std::runtime_error("snapshot write");
}
void stls(const std::string& name,const ArchMechView& v){
  for(uint32_t i=0;i<v.part_count;i++){
    std::ofstream f(name+".p"+std::to_string(i)+".stl",std::ios::binary);const auto& p=v.parts[i];
    std::array<char,80> h{};std::strcpy(h.data(),"mechanics test fixture; nominal mm; unqualified fit");f.write(h.data(),80);u32(f,p.triangle_count);
    for(uint32_t t=p.triangle_start;t<p.triangle_start+p.triangle_count;t++){
      f32(f,0);f32(f,0);f32(f,0);
      for(uint32_t j=0;j<3;j++)for(uint32_t axis=0;axis<3;axis++)f32(f,v.vertices_xyz[v.triangles[t*3+j]*3+axis]);
      f.put(0);f.put(0);
    }
  }
}
void metadata(const std::string& name,const ArchMechView& v,bool immutable,bool lifetime){
  std::ofstream f(name);f<<std::setprecision(17);
  f<<"{\"version\":2,\"mechanicsAbi\":"<<v.abi_version<<",\"verdict\":"<<v.verdict<<",\"exportBlocked\":"<<v.export_blocked<<",\"fitQualification\":"<<v.fit_qualification<<",\"inputUnchanged\":"<<(immutable?"true":"false")<<",\"priorSnapshotPreserved\":"<<(lifetime?"true":"false");
  f<<",\"layout\":{\"pointer\":"<<sizeof(void*)<<",\"request\":"<<sizeof(ArchMechRequest)<<",\"source\":"<<sizeof(ArchMechSource)<<",\"view\":"<<sizeof(ArchMechView)<<",\"parameter\":"<<sizeof(ArchMechParam)<<",\"part\":"<<sizeof(ArchMechPart)<<",\"partInfo\":"<<sizeof(ArchMechPartInfo)<<",\"feature\":"<<sizeof(ArchMechFeature)<<",\"curve\":"<<sizeof(ArchMechCurve)<<",\"interval\":"<<sizeof(ArchMechInterval)<<",\"diagnostic\":"<<sizeof(ArchMechDiagnostic)<<",\"proposal\":"<<sizeof(ArchMechProposal)<<'}';
  f<<",\"inputStrides\":{\"slab\":"<<sizeof(ArchMechSlab)<<",\"attachment\":"<<sizeof(ArchMechAttachment)<<",\"bevelOverride\":"<<sizeof(ArchMechBevelOverride)<<'}';
  f<<",\"features\":[";
  for(uint32_t i=0;i<v.feature_count;i++){if(i)f<<',';const auto& x=v.features[i];f<<"{\"id\":"<<quote(x.id)<<",\"kind\":"<<x.kind<<",\"parameterId\":"<<x.parameter_id<<",\"role\":"<<x.role<<",\"group\":"<<x.group<<",\"sourceId\":\""<<x.source_id<<"\",\"provenanceId\":\""<<x.provenance_id<<"\",\"dimensions\":[";for(int j=0;j<6;j++){if(j)f<<',';f<<x.dimensions[j];}f<<"]}";}
  f<<"],\"curves\":[";
  for(uint32_t i=0;i<v.curve_count;i++){if(i)f<<',';auto& x=v.curves[i];f<<"{\"feature\":"<<x.feature_index<<",\"segments\":"<<x.segments<<",\"side\":"<<x.side<<",\"frame\":"<<x.frame<<",\"radius\":"<<x.radius<<",\"min\":"<<x.signed_min<<",\"max\":"<<x.signed_max<<",\"tolerance\":"<<x.requested_tolerance<<'}';}
  f<<"],\"intervals\":[";
  for(uint32_t i=0;i<v.interval_count;i++){if(i)f<<',';auto& x=v.intervals[i];f<<"{\"field\":"<<quote(arch_mech_field_name(x.field_id))<<",\"datum\":"<<x.datum<<",\"mode\":"<<x.mode<<",\"referenceLayer\":"<<x.reference_layer<<",\"z0\":"<<x.z0<<",\"z1\":"<<x.z1<<",\"floor\":"<<x.floor_delta<<",\"ceil\":"<<x.ceil_delta<<",\"nearest\":"<<x.nearest_delta<<'}';}
  f<<"],\"diagnostics\":[";
  for(uint32_t i=0;i<v.diagnostic_count;i++){if(i)f<<',';auto& x=v.diagnostics[i];f<<"{\"code\":"<<x.code<<",\"fieldId\":"<<x.field_id<<",\"message\":"<<quote(x.message)<<'}';}
  f<<"],\"proposals\":[";
  for(uint32_t i=0;i<v.proposal_count;i++){if(i)f<<',';auto& x=v.proposals[i];f<<"{\"field\":"<<quote(arch_mech_field_name(x.field_id))<<",\"before\":"<<x.before<<",\"after\":"<<x.after<<",\"mode\":"<<x.mode<<",\"applicable\":"<<x.applicable<<",\"reason\":"<<quote(x.reason)<<'}';}
  f<<"],\"parts\":[";
  for(uint32_t i=0;i<v.part_count;i++){if(i)f<<',';auto& x=v.part_info[i];f<<"{\"feature\":"<<x.feature_index<<",\"role\":"<<x.role<<",\"slot\":"<<x.slot<<",\"origin\":"<<x.origin<<",\"group\":"<<x.assembly_group<<",\"provenanceId\":\""<<x.provenance_id<<"\",\"previewTransform\":[";for(int j=0;j<16;j++){if(j)f<<',';f<<x.preview_transform[j];}f<<"]}";}
  f<<"],\"parameters\":[";
  for(uint32_t i=0;i<v.parameter_count;i++){if(i)f<<',';auto& x=v.parameters[i];f<<"{\"id\":"<<quote(arch_mech_field_name(x.field_id))<<",\"value\":";if(std::isfinite(x.value))f<<x.value;else f<<"null";f<<",\"mode\":"<<x.mode<<",\"origin\":"<<x.origin<<",\"provenanceId\":\""<<x.provenance_id<<"\"}";}
  f<<"],\"layerBoundaries\":[";for(uint32_t i=0;i<v.layer_boundary_count;i++){if(i)f<<',';f<<v.layer_boundaries[i];}f<<"]}\n";
}
}
int main(int argc,char** argv){
  try{
#ifndef ARCH_R2_PREIMAGE
    if(arch_mech_abi_version()!=2||arch_mech_semantics_version()!=3||arch_mech_source_datum_extension_version()!=1)throw std::runtime_error("mechanics post-link getters");
#endif
    std::map<std::string,std::string> options;std::vector<std::pair<std::string,std::string>> changes;
    for(int i=1;i<argc;i+=2){if(i+1>=argc)throw std::runtime_error("paired arguments");std::string key=argv[i],value=argv[i+1];if(key=="--set"){auto j=value.find('=');changes.push_back({value.substr(0,j),value.substr(j+1)});}else options[key]=value;}
    auto opt=[&](const std::string& key,const std::string& fallback){return options.count(key)?options[key]:fallback;};
    const uint32_t product=(uint32_t)std::stoul(opt("--product","0"));const std::string variant=opt("--variant","rectangle"),name=opt("--out","fixture");
    const double w=std::stod(opt("--width","40")),h=std::stod(opt("--height","30"));
    std::vector<ArchMechParam> parameters;for(uint32_t id=1;id<AM_FIELD_COUNT;id++)parameters.push_back(arch_mech_default_parameter(product,id));
    auto set=[&](const std::string& id,double value){auto n=arch_mech_field_id(id.c_str());if(!n)throw std::runtime_error("unknown fixture field "+id);parameters[n-1].value=value;parameters[n-1].origin=AM_USER;parameters[n-1].provenance_id=UINT64_C(9007199254740993)+n;if(n==AM_F_ringH)parameters[n-1].mode=AM_MM;};
    const double h0=std::stod(opt("--h0","0.2")),lh=std::stod(opt("--h","0.2"));set("layerH",lh);set("size",w);
    for(auto& x:changes)set(x.first,std::stod(x.second));
    for(auto& x:changes)if(x.first=="legoRanhZ")parameters[AM_F_legoRanhZ-1].mode=AM_SCALAR;
    if(options.count("--layers")){
      // id,count,reference,datum. Explicit global interval; no conversion guess.
      auto value=options["--layers"];std::vector<std::string> a;size_t start=0;
      for(size_t i=0;i<=value.size();i++)if(i==value.size()||value[i]==','){a.push_back(value.substr(start,i-start));start=i+1;}
      if(a.size()!=4)throw std::runtime_error("layer binding");auto n=arch_mech_field_id(a[0].c_str());auto& p=parameters[n-1];p.mode=AM_LAYERS;p.layer_count=std::stoul(a[1]);p.reference_layer=std::stoul(a[2]);p.datum=std::stoul(a[3]);p.origin=AM_USER;
    }
    if(options.count("--mm-datum")){
      auto value=options["--mm-datum"];std::vector<std::string> a;size_t start=0;
      for(size_t i=0;i<=value.size();i++)if(i==value.size()||value[i]==','){a.push_back(value.substr(start,i-start));start=i+1;}
      if(a.size()!=4)throw std::runtime_error("mm datum binding");auto n=arch_mech_field_id(a[0].c_str());auto& p=parameters[n-1];p.mode=AM_MM;p.value=std::stod(a[1]);p.reference_layer=std::stoul(a[2]);p.datum=std::stoul(a[3]);p.origin=AM_USER;
    }
    if(options.count("--auto-nonzero")){auto& p=parameters[AM_F_ringH-1];p.mode=AM_AUTO_BODY_HEIGHT;p.value=std::stod(options["--auto-nonzero"]);}
    std::vector<int64_t> xy;std::vector<ArchMechRing> rings;
    auto ring=[&](double x0,double y0,double x1,double y1,bool reverse=false){
      uint32_t start=(uint32_t)xy.size()/2;
      const std::array<std::array<double,2>,4> ps={{{x0,y0},{x1,y0},{x1,y1},{x0,y1}}};
      for(int j=0;j<4;j++){auto& p=ps[reverse?3-j:j];xy.push_back(std::llround(p[0]*1e6));xy.push_back(std::llround(p[1]*1e6));}
      rings.push_back({start,4,100+uint64_t(rings.size())});return (uint32_t)rings.size()-1;
    };
    ring(-w/2,-h/2,w/2,h/2);
    if(variant=="dense-ellipse"){
      // Synthetic source polygon only: segments is a declared fixture input,
      // never a production flattening policy. The source has one exact nm ring.
      const uint32_t n=uint32_t(std::stoul(opt("--segments","513")));
      if(n<3||n>200001)throw std::runtime_error("fixture segment range");
      xy.clear();for(uint32_t i=0;i<n;i++){const double angle=2*std::acos(-1.)*i/n;
        xy.push_back(std::llround(w/2*std::cos(angle)*1e6));xy.push_back(std::llround(h/2*std::sin(angle)*1e6));}
      rings[0].point_count=n;
    }
    if(variant=="concave"){
      xy.clear();
      for(const auto& p:std::array<std::array<double,2>,6>{{{-w/2,-h/2},{w/2,-h/2},{w/2,0},{0,0},{0,h/2},{-w/2,h/2}}}){
        xy.push_back(std::llround(p[0]*1e6));xy.push_back(std::llround(p[1]*1e6));
      }
      rings[0].point_count=6;
    }
    if(variant=="shallow-notch"){
      const double depth=std::stod(opt("--notch-depth","0.000001"));
      if(depth<.000001||depth>=h/4)throw std::runtime_error("fixture notch depth");
      xy.clear();
      for(const auto& p:std::array<std::array<double,2>,7>{{{-w/2,-h/2},{w/2,-h/2},{w/2,h/2},{1,h/2},{0,h/2-depth},{-1,h/2},{-w/2,h/2}}}){
        xy.push_back(std::llround(p[0]*1e6));xy.push_back(std::llround(p[1]*1e6));
      }
      rings[0].point_count=7;
    }
    if(variant=="hole")ring(-2,-2,2,2,true);
    if(variant=="cornerhole")ring(-w/2+2,-h/2+2,-w/2+6,-h/2+6,true);
    if(variant=="islands")ring(w/2+2,-1,w/2+4,1);
    if(variant=="point-touch")ring(w/2,h/2,w/2+2,h/2+2);
    if(variant=="short-edge"){
      // Closed 5-edge rectangle with an explicit one-grid-unit raw edge.
      xy.insert(xy.begin()+2,{-int64_t(std::llround(w/2*1e6))+1,-int64_t(std::llround(h/2*1e6))});
      rings[0].point_count=5;
    }
    const uint32_t footprint_count=(uint32_t)rings.size();
    std::vector<ArchMechSlab> slabs;
    std::vector<ArchMechAttachment> attachments;
    std::vector<ArchMechBevelOverride> bevels;
    const double body=parameters[(product==AM_CLICKY?AM_F_plateT:AM_F_baseH)-1].mode==AM_LAYERS
      ? (parameters[(product==AM_CLICKY?AM_F_plateT:AM_F_baseH)-1].reference_layer==0?h0+(parameters[(product==AM_CLICKY?AM_F_plateT:AM_F_baseH)-1].layer_count-1)*lh:parameters[(product==AM_CLICKY?AM_F_plateT:AM_F_baseH)-1].layer_count*lh)
      : parameters[(product==AM_CLICKY?AM_F_plateT:AM_F_baseH)-1].value;
    const bool prepared=variant=="prepared"||variant=="roof-gap"||variant=="strap-roof-gap"||variant=="strap-floor-gap",colors=variant=="colors"||variant=="prepared";
    if(variant=="strap-roof-gap"){
      const double roof=parameters[AM_F_strapZ-1].value+parameters[AM_F_strapD-1].value/2+std::stod(opt("--roof-skin","0"));
      const auto corner=ring(-w/2,-h/2,-w/2+1,h/2);
      slabs.push_back({0,1,0,AM_SOURCE_BODY,0x30353bff,1,AM_USER,AM_BODY,0,roof,401,4010});
      slabs.push_back({corner,1,0,AM_SOURCE_ART,0xff2244ff,2,AM_USER,AM_ARTWORK,roof,body,402,4020});
    }
    if(variant=="strap-floor-gap"){
      const double bottom=parameters[AM_F_strapZ-1].value-parameters[AM_F_strapD-1].value/2;
      const auto spine=ring(-w/2,-h/2,-w/2+1,h/2);
      slabs.push_back({0,1,0,AM_SOURCE_BODY,0x30353bff,1,AM_USER,AM_BODY,0,.2,401,4010});
      slabs.push_back({0,1,0,AM_SOURCE_ART,0xff2244ff,2,AM_USER,AM_ARTWORK,bottom,body,402,4020});
      slabs.push_back({spine,1,0,AM_SOURCE_ART,0xff2244ff,2,AM_USER,AM_ARTWORK,.2,bottom,403,4030});
    }
    if(variant=="roof-gap"){
      const double roof=parameters[AM_F_legoHoleH-1].value+std::stod(opt("--roof-skin","0"));
      const auto corner=ring(-w/2,-h/2,-w/2+1,h/2);
      slabs.push_back({0,1,0,AM_SOURCE_BODY,0x30353bff,1,AM_USER,AM_BODY,0,roof,401,4010});
      slabs.push_back({corner,1,0,AM_SOURCE_ART,0xff2244ff,2,AM_USER,AM_ARTWORK,roof,body,402,4020});
    }
    if(colors){
      const uint32_t left=ring(-w/2,-h/2,0,h/2),right=ring(0,-h/2,w/2,h/2);
      if(prepared)slabs.push_back({0,1,0,AM_SOURCE_BODY,0x30353bff,1,AM_AUTO,0,0,body-1,101,1010});
      const double lo=prepared?body-1:body,hi=prepared?body:body+.8;
      slabs.push_back({left,1,0,AM_SOURCE_ART,0xff2244ff,2,AM_USER,AM_ARTWORK,lo,hi,102,1020});
      slabs.push_back({right,1,0,AM_SOURCE_ART,0x2266ffff,3,AM_USER,AM_ARTWORK,lo,hi,103,1030});
    }
    if(variant=="z-separated"||variant=="z-overlap"){
      slabs.push_back({0,1,0,AM_SOURCE_ART,0xff2244ff,2,AM_USER,AM_ARTWORK,body,body+1,201,2010});
      const double lo=variant=="z-separated"?body+2:body+.5;
      slabs.push_back({0,1,0,AM_SOURCE_ART,0x2266ffff,3,AM_USER,AM_ARTWORK,lo,lo+1,202,2020});
    }
    if(variant=="text"){
      const double x=w/2+13;
      const auto base=ring(x-8,-4,x+8,4),glyph=ring(x-5,-3,x+5,3);ring(x-3,-1,x+3,1,true);
      const auto dot=ring(x+5.5,1,x+7.5,3);
      slabs.push_back({base,1,0,AM_SOURCE_TEXT_BASE,0x3344aaff,4,AM_USER,AM_TEXT_BASE,0,1,301,3010,7001});
      slabs.push_back({glyph,2,0,AM_SOURCE_TEXT,0xeecc22ff,5,AM_USER,AM_TEXT,1,2.2,302,3020,7001});
      slabs.push_back({dot,1,0,AM_SOURCE_TEXT,0xeecc22ff,5,AM_USER,AM_TEXT,1,2.2,303,3030,7001});
      attachments.push_back({base,1,0,AM_TEXT_BASE,0,2.2,7001,70010});
    }
    std::vector<ArchMechParam> bindings;
    for(auto& p:parameters)if(arch_mech_source_field(p.field_id))bindings.push_back(p);
    if(opt("--stale","0")=="1")for(auto& p:bindings)if(p.field_id==AM_F_size)p.value+=1;
    if(opt("--missing","0")=="1")bindings.clear();
    std::vector<ArchMechMaterial> materials;
    if(opt("--override","0")=="1")materials.push_back({AM_STEM,0xaa11bbff,7,AM_USER,UINT64_C(9007199254740997)});
    if(opt("--bodyoverride","0")=="1")materials.push_back({AM_BODY,0x11aa77ff,5,AM_USER,UINT64_C(9007199254740998)});
    if(opt("--artoverride","0")=="1")materials.push_back({AM_ARTWORK,0x00ff00ff,8,AM_USER,9001});
    if(opt("--rimslab","0")=="1"&&!slabs.empty()){
      slabs.back().role=AM_RIM;slabs.back().origin=AM_AUTO;
      materials.push_back({AM_RIM,0xddcc00ff,6,AM_USER,9002});
    }
    if(opt("--badmaterial","0")=="1")materials.push_back({AM_BODY,0xaa11bbff,0,AM_USER,3});
    if(opt("--blockbevel","0")=="1"){bevels.push_back({102,8001,0,0,3,AM_USER,.6});bevels.push_back({103,8002,1,1,3,AM_USER,.4});}
    if(opt("--blockbevel","0")=="2")bevels.push_back({9999,8003,1,1,3,AM_USER,.4});
    ArchMechRequest r{};r.abi_version=2;r.product=product;r.parameters=parameters.data();r.parameter_count=(uint32_t)parameters.size();r.materials=materials.data();r.material_count=(uint32_t)materials.size();r.revision=42;
    r.schedule={1,0,0,0,(int64_t)std::llround(h0*1e6),(int64_t)std::llround(lh*1e6),777};
    r.source={2,uint32_t(prepared?AM_PREPARED_SLABS:AM_RAISED_BODY),(uint32_t)(xy.size()/2),(uint32_t)rings.size(),xy.data(),rings.data(),0,footprint_count,0,(uint32_t)slabs.size(),slabs.data(),UINT64_C(9007199254740999),88,bindings.data(),(uint32_t)bindings.size(),0};
    r.source.attachments=attachments.data();r.source.attachment_count=(uint32_t)attachments.size();r.source.eyelet_attachment_id=attachments.empty()?0:7001;
    r.source.bevel_overrides=bevels.data();r.source.bevel_override_count=(uint32_t)bevels.size();
    if(opt("--badattachment","0")=="1")r.source.eyelet_attachment_id=9999;
    r.mating_tolerance_mm=std::stod(opt("--tol","0.001"));r.export_tolerance_mm=std::stod(opt("--exporttol","0.004"));
    auto params_before=parameters;auto xy_before=xy;auto slabs_before=slabs;auto attachments_before=attachments;auto bevels_before=bevels;
    auto control=arch_mech_control_create(17);if(!control)throw std::runtime_error("control allocation");
    const auto cancel=opt("--cancel","none");
    if(cancel=="before")arch_mech_control_cancel(control,17);
    if(cancel=="stale"&&arch_mech_control_cancel(control,16)!=0)throw std::runtime_error("stale cancellation accepted");
#ifndef __EMSCRIPTEN__
    std::thread observer;
    if(cancel=="during")observer=std::thread([&]{while(arch_mech_control_stage(control)<3)std::this_thread::yield();arch_mech_control_cancel(control,17);});
#else
    if(cancel=="during")throw std::runtime_error("Use native observer or host shared-memory watchdog; this fixture has no pthreads");
#endif
    ArchMechResult* result=arch_mech_build_controlled(&r,control,cancel=="generation"?16:17);
#ifndef __EMSCRIPTEN__
    if(observer.joinable())observer.join();
#endif
    if(!result)throw std::runtime_error("result allocation");ArchMechView v{};if(!arch_mech_view(result,&v))throw std::runtime_error("result view");
    if(cancel=="stale"&&arch_mech_control_stage(control)!=6)throw std::runtime_error("current generation did not complete");
    const double progress=arch_mech_control_progress(control);if(!std::isfinite(progress)||progress<0||progress>1)throw std::runtime_error("progress range");
    auto repeated=arch_mech_build_controlled(&r,control,17);ArchMechView repeated_view{};arch_mech_view(repeated,&repeated_view);
    if(cancel!="generation"&&repeated_view.verdict!=AM_INVALID)throw std::runtime_error("single-use control reused");arch_mech_destroy(repeated);
    arch_mech_control_destroy(control);
    auto equalbytes=[](const auto& a,const auto& b){return a.size()==b.size()&&(a.empty()||std::memcmp(a.data(),b.data(),a.size()*sizeof(a[0]))==0);};
    const bool immutable=xy_before==xy&&equalbytes(params_before,parameters)&&equalbytes(slabs_before,slabs)&&equalbytes(attachments_before,attachments)&&equalbytes(bevels_before,bevels);
    std::vector<double> saved;if(v.vertex_count)saved.assign(v.vertices_xyz,v.vertices_xyz+v.vertex_count*3);
    auto invalid=r;invalid.abi_version=99;auto second=arch_mech_build(&invalid);ArchMechView failed{};arch_mech_view(second,&failed);
    const bool lifetime=failed.verdict!=AM_OK&&failed.vertex_count==0&&std::equal(saved.begin(),saved.end(),v.vertices_xyz);arch_mech_destroy(second);
    snapshot(name+".bin",v);metadata(name+".json",v,immutable,lifetime);
    if(opt("--stl","0")=="1")stls(name,v);
    std::cout<<"verdict="<<v.verdict<<" parts="<<v.part_count<<" triangles="<<v.triangle_count<<'\n';
    for(uint32_t i=0;i<v.diagnostic_count;i++)if(v.diagnostics[i].code<10)std::cout<<v.diagnostics[i].message<<'\n';
    arch_mech_destroy(result);return 0;
  }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
