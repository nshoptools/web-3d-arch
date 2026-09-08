#include "internal.hpp"
#include "zip.h"
#include "xml_reader.hpp"
#include <charconv>
#include <cctype>
#include <functional>
#include <sstream>
#include <algorithm>

namespace archmi {
static const std::string CORE="http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
static const std::string MAT="http://schemas.microsoft.com/3dmanufacturing/material/2015/02";
static const std::string PROD="http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
static const std::string REL="http://schemas.openxmlformats.org/package/2006/relationships";
static const std::string CT="http://schemas.openxmlformats.org/package/2006/content-types";
static const std::string XML="http://www.w3.org/XML/1998/namespace";
static const std::string XMLNS="http://www.w3.org/2000/xmlns/";
static std::string path_ok(std::string s){
 need(!s.empty()&&s.size()<=512&&s.front()!='/'&&s.back()!='/',"ZIP_PATH");
 for(unsigned char c:s)need(c>=32&&c<127&&c!='\\'&&c!=':'&&c!='%',"ZIP_PATH");
 std::istringstream in(s);std::string part;
 while(std::getline(in,part,'/'))need(!part.empty()&&part!="."&&part!="..","ZIP_PATH");
 return s;
}
static std::string resolve(std::string base,std::string target){
 need(!target.empty(),"REL_TARGET");
 if(target.front()=='/'){target.erase(0,1);base="";}
 need(target.find(':')==std::string::npos&&target.find('\\')==std::string::npos&&target.find('%')==std::string::npos,"REL_EXTERNAL");
 return path_ok(base+target); // bounded subset: dot-segment URIs explicitly rejected
}
static double number(const std::string& s){
 need(!s.empty()&&s.size()<=128,"XML_NUMBER");double n=0;
 const char* first=s.data();if(*first=='+')++first;
 auto r=std::from_chars(first,s.data()+s.size(),n);
 need(r.ec==std::errc()&&r.ptr==s.data()+s.size()&&std::isfinite(n),"XML_NUMBER");return n;
}
static uint32_t integer(const std::string& s){
 need(!s.empty()&&s.size()<=10,"XML_INTEGER");uint32_t n=0;
 auto r=std::from_chars(s.data(),s.data()+s.size(),n);
 need(r.ec==std::errc()&&r.ptr==s.data()+s.size(),"XML_INTEGER");return n;
}
static void lexical_guard(const std::vector<uint8_t>& b){
 need(b.size()<=64u*1024u*1024u,"XML_BYTE_BOUND");
 // Bounded token preflight, not an XML decoder. Vetted namespace-aware Expat reader follows.
 size_t span=0;
 for(size_t i=0;i<b.size();++i){
  unsigned c=b[i];need(c!=0&&!(c<32&&c!=9&&c!=10&&c!=13),"XML_ENCODING_OR_CONTROL");
  if(c=='<'||c=='>')span=0;else need(++span<=8192,"XML_TOKEN_BOUND");
  if(c=='<'&&i+1<b.size()&&b[i+1]=='!'){
   bool comment=i+3<b.size()&&b[i+2]=='-'&&b[i+3]=='-';
   need(comment,"XML_DTD_ENTITY_CDATA_UNSUPPORTED");
  }
  if(c>=128){
   unsigned n=c>=0xf0?4:c>=0xe0?3:c>=0xc2?2:0;
   need(n&&i+n<=b.size(),"XML_UTF8");
   uint32_t cp=c&((1u<<(7-n))-1);
   for(unsigned j=1;j<n;++j){need((b[i+j]&0xc0)==0x80,"XML_UTF8");cp=(cp<<6)|(b[i+j]&63);}
   need((n==2?cp>=128:n==3?cp>=2048:cp>=65536)&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff),"XML_UTF8");i+=n-1;
  }
 }
}
struct XmlState{
 PackageFacts facts;std::map<uint32_t,std::vector<uint32_t>> graph;
 std::vector<uint32_t> builds;std::set<uint32_t> resources;
 std::vector<std::tuple<std::string,std::string,std::string>> relationships;
 std::map<std::string,std::string> defaults,overrides;
};
static void xml_guard(const std::string& path,const std::vector<uint8_t>& b,XmlState& st){
 lexical_guard(b);
 BoundedXmlReader reader(b);
 eXmlReaderNodeType type;uint32_t depth=0,nodes=0,currentObject=0,roots=0;
 bool model=path==st.facts.path,rels=path.size()>=5&&path.substr(path.size()-5)==".rels",types=path=="[Content_Types].xml";
 std::vector<std::string> stack;std::vector<std::map<std::string,uint32_t>> childCounts;std::string metadataName;
 const std::map<std::string,std::set<std::string>> allowed={
 {"model",{"metadata","resources","build"}},{"resources",{"object","basematerials","colorgroup"}},
 {"object",{"mesh","components","metadatagroup"}},{"mesh",{"vertices","triangles"}},{"vertices",{"vertex"}},
 {"triangles",{"triangle"}},{"components",{"component"}},{"build",{"item"}},
 {"basematerials",{"base"}},{"colorgroup",{"color"}},{"metadatagroup",{"metadata"}}};
 while(reader.Read(type)){
  need(++nodes<=2200000,"XML_NODE_BOUND");
  if(type==XMLREADERNODETYPE_STARTELEMENT){
   const char *local=nullptr,*ns=nullptr;reader.GetLocalName(&local,nullptr);reader.GetNamespaceURI(&ns,nullptr);
   std::string tag=local?local:"",uri=ns?ns:"";bool empty=reader.IsEmptyElement();
   if(depth==0)++roots;
   need(depth<32,"XML_DEPTH");
   std::map<std::string,std::string> a;std::set<std::string> full;
   if(reader.MoveToFirstAttribute())do{
    const char *key=nullptr,*val=nullptr,*ans=nullptr;reader.GetLocalName(&key,nullptr);reader.GetValue(&val,nullptr);reader.GetNamespaceURI(&ans,nullptr);
    std::string name=key?key:"",value=val?val:"",attrns=ans?ans:"";
    need(value.size()<=4096&&full.insert(attrns+"#"+name).second,"XML_ATTRIBUTE");
    bool uuid=attrns==PROD&&name=="UUID"&&(tag=="object"||tag=="component"||tag=="item"||tag=="build");
    need(attrns.empty()||attrns==XML||attrns==XMLNS||uuid,"UNSUPPORTED_ATTRIBUTE_NAMESPACE");
    if(uuid){need(value.size()==36,"PRODUCTION_UUID");for(size_t j=0;j<36;++j)need((j==8||j==13||j==18||j==23)?value[j]=='-':std::isxdigit(static_cast<unsigned char>(value[j]))!=0,"PRODUCTION_UUID");}
    if(!attrns.empty()&&attrns!=XMLNS){need(st.facts.attributes.size()<33024,"ATTRIBUTE_PROVENANCE_BOUND");st.facts.attributes.push_back({tag,attrns+"#"+name,value});}
    if(attrns.empty())a.emplace(name,value);
   }while(reader.MoveToNextAttribute());
   if(model){
    need((tag=="colorgroup"||tag=="color")?uri==MAT:uri==CORE,"UNSUPPORTED_ELEMENT_NAMESPACE");
    if(stack.empty())need(tag=="model","MODEL_ROOT");else {
     uint32_t count=++childCounts.back()[tag];
     if(tag=="resources"||tag=="build"||tag=="mesh"||tag=="components"||tag=="vertices"||tag=="triangles"||tag=="metadatagroup")need(count==1,"MODEL_DUPLICATE_STRUCTURE");
     if(tag=="mesh"||tag=="components")need(childCounts.back()["mesh"]+childCounts.back()["components"]==1,"OBJECT_CONTENT");

     auto it=allowed.find(stack.back());need(it!=allowed.end()&&it->second.count(tag),"UNSUPPORTED_MODEL_ELEMENT");
    }
    static const std::map<std::string,std::set<std::string>> attrs={
     {"model",{"unit","requiredextensions","recommendedextensions"}},{"metadata",{"name","preserve"}},
     {"resources",{}},{"build",{}},{"object",{"id","type","name","partnumber","pid","pindex","thumbnail"}},
     {"mesh",{}},{"vertices",{}},{"triangles",{}},{"components",{}},{"metadatagroup",{}},
     {"vertex",{"x","y","z"}},{"triangle",{"v1","v2","v3","pid","p1","p2","p3"}},
     {"component",{"objectid","transform"}},{"item",{"objectid","transform","partnumber","printable"}},
     {"basematerials",{"id"}},{"base",{"name","displaycolor"}},{"colorgroup",{"id"}},{"color",{"color"}}};
    auto permitted=attrs.find(tag);need(permitted!=attrs.end(),"UNSUPPORTED_MODEL_ELEMENT");
    for(auto& [key,value]:a)need(permitted->second.count(key),"UNSUPPORTED_MODEL_ATTRIBUTE");
    if(tag=="model"){
     if(a.count("unit")){st.facts.unit=a["unit"];st.facts.unitOrigin="file";}
     for(auto key:{"requiredextensions","recommendedextensions"})if(a.count(key)){
      std::istringstream words(a[key]);std::string prefix;while(words>>prefix){std::string name;need(reader.GetNamespaceURI(prefix,name)&&(name==MAT||name==PROD),"UNSUPPORTED_EXTENSION");}
     }
    }
    if(tag=="object"||tag=="basematerials"||tag=="colorgroup"){
     uint32_t id=integer(a["id"]);need(id&&st.resources.insert(id).second&&st.resources.size()<=256,"RESOURCE_ID_OR_BOUND");
     if(tag=="object"){currentObject=id;st.graph[id];st.facts.objects.insert(id);
      need(!a.count("type")||a["type"]=="model","UNSUPPORTED_OBJECT_TYPE");}
    }
    if(tag=="component"){need(currentObject>0,"COMPONENT_OWNER");st.graph[currentObject].push_back(integer(a["objectid"]));need(st.graph[currentObject].size()<=128,"COMPONENT_BOUND");}
    if(tag=="item"){
     need(!a.count("printable")||a["printable"]=="1"||a["printable"]=="true","UNSUPPORTED_NONPRINTABLE_ITEM");
     st.builds.push_back(integer(a["objectid"]));need(st.builds.size()<=128,"BUILD_BOUND");
    }
    if(tag=="vertex"){
     need(++st.facts.vertices<=MAX_VERTICES,"VERTEX_BUDGET");++st.facts.objectCounts[currentObject].first;
     for(auto key:{"x","y","z"}){double n=number(a[key]);need(std::abs(n)<=1e7,"SOURCE_COORDINATE_BOUND");
      st.facts.coordinateError=std::max(st.facts.coordinateError,std::abs(double(float(n))-n)+std::abs(n)*std::numeric_limits<double>::epsilon()*4);}
    }
    if(tag=="triangle"){++st.facts.objectCounts[currentObject].second;need(++st.facts.faces<=MAX_FACES,"FACE_BUDGET");for(auto key:{"v1","v2","v3"})integer(a[key]);}
    if(a.count("transform")){
     std::istringstream values(a["transform"]);Matrix m;std::string token;
     for(double& n:m){need(bool(values>>token),"TRANSFORM_LENGTH");n=number(token);
      st.facts.transformError=std::max(st.facts.transformError,std::abs(double(float(n))-n)+std::abs(n)*std::numeric_limits<double>::epsilon()*4);}
     need(!(values>>token),"TRANSFORM_LENGTH");matrix_check(m);
     Matrix rounded;double coefficientError=0;
     for(int i=0;i<12;++i){rounded[i]=double(float(m[i]));coefficientError=std::max(coefficientError,std::abs(rounded[i]-m[i])+std::abs(m[i])*4*std::numeric_limits<double>::epsilon());}
     matrix_check(rounded);
     const int terms[6][3]={{0,4,8},{1,5,6},{2,3,7},{2,4,6},{1,3,8},{0,5,7}};
     double determinantError=0;
     for(auto& term:terms){
      double a=std::abs(m[term[0]]),b=std::abs(m[term[1]]),c=std::abs(m[term[2]]),e=coefficientError;
      determinantError+=e*(a*b+a*c+b*c)+e*e*(a+b+c)+e*e*e+64*std::numeric_limits<double>::epsilon()*a*b*c;
     }
     need(std::abs(determinant(m))>determinantError&&determinant(m)*determinant(rounded)>0,"TRANSFORM_PRECISION_AMBIGUOUS");
    }
    if(tag=="metadata"){metadataName=a["name"];need(st.facts.metadata.size()<128,"METADATA_BOUND");st.facts.metadata.emplace_back(metadataName,"");}
   }else if(rels){
    need(uri==REL&&(tag=="Relationships"||tag=="Relationship"),"REL_NAMESPACE");
    need(stack.empty()?tag=="Relationships":stack.back()=="Relationships"&&tag=="Relationship","REL_STRUCTURE");
    if(tag=="Relationship"){
     need(!a.count("TargetMode")||a["TargetMode"]=="Internal","REL_EXTERNAL");
     std::string base;if(path!="_rels/.rels"){auto at=path.find("/_rels/");need(at!=std::string::npos,"REL_PATH");base=path.substr(0,at+1);}
     st.relationships.emplace_back(path,resolve(base,a["Target"]),a["Type"]);
    }
   }else if(types){
    need(uri==CT&&(tag=="Types"||tag=="Default"||tag=="Override"),"CONTENT_TYPES");
    need(stack.empty()?tag=="Types":stack.back()=="Types"&&(tag=="Default"||tag=="Override"),"CONTENT_TYPES_STRUCTURE");
    if(tag=="Default")need(st.defaults.emplace(a["Extension"],a["ContentType"]).second,"CONTENT_TYPE_DUPLICATE");
    if(tag=="Override")need(st.overrides.emplace(a["PartName"],a["ContentType"]).second,"CONTENT_TYPE_DUPLICATE");
   }
   if(!empty){++depth;stack.push_back(tag);childCounts.emplace_back();}
   else if(tag=="object")currentObject=0;
  }else if(type==XMLREADERNODETYPE_ENDELEMENT){
   need(depth>0&&!stack.empty(),"XML_DEPTH");if(stack.back()=="object")currentObject=0;stack.pop_back();childCounts.pop_back();--depth;
  }else if(type==XMLREADERNODETYPE_TEXT&&model&&!stack.empty()&&stack.back()=="metadata"){
   const char* value=nullptr;reader.GetValue(&value,nullptr);st.facts.metadata.back().second+=value?value:"";need(st.facts.metadata.back().second.size()<=4096,"METADATA_BOUND");
  }else if(type==XMLREADERNODETYPE_TEXT){
   const char* value=nullptr;reader.GetValue(&value,nullptr);
   if(value)for(const char* p=value;*p;++p)need(std::isspace(static_cast<unsigned char>(*p))!=0,"XML_UNEXPECTED_TEXT");
  }
 }
 need(depth==0&&roots==1,"XML_ROOT_COUNT");
}
PackageFacts guard_package(const std::vector<uint8_t>& b){
 need(b.size()>=22&&b.size()<=64u*1024u*1024u,"ZIP_BYTE_BOUND");
 need(b[0]=='P'&&b[1]=='K'&&b[2]==3&&b[3]==4,"ZIP_PREFIX");
 zip_error_t ze;zip_error_init(&ze);
 zip_source_t* zs=zip_source_buffer_create(b.data(),b.size(),0,&ze);need(zs,"ZIP_SOURCE");
 zip_t* raw=zip_open_from_source(zs,ZIP_RDONLY|ZIP_CHECKCONS,&ze);
 if(!raw){zip_source_free(zs);zip_error_fini(&ze);throw std::runtime_error("ZIP_CONSISTENCY");}
 zip_error_fini(&ze);std::unique_ptr<zip_t,decltype(&zip_discard)> z(raw,&zip_discard);
 auto count=zip_get_num_entries(z.get(),0);need(count>0&&count<=256,"ZIP_ENTRY_BOUND");
 std::map<std::string,std::vector<uint8_t>> xml;std::set<std::string> names,folded;
 uint64_t total=0;XmlState st;
 for(zip_uint64_t i=0;i<zip_uint64_t(count);++i){
  zip_stat_t s;zip_stat_init(&s);need(zip_stat_index(z.get(),i,0,&s)==0&&s.name,"ZIP_STAT");
  std::string name=path_ok(s.name),lower=name;std::transform(lower.begin(),lower.end(),lower.begin(),[](unsigned char c){return char(std::tolower(c));});
  need(folded.insert(lower).second,"ZIP_DUPLICATE_PATH");names.insert(name);st.facts.entries.push_back(name);
  need(s.comp_size<=b.size(),"ZIP_COMPRESSED_BOUND");total+=s.size;need(s.size<=64u*1024u*1024u&&total<=128u*1024u*1024u&&s.size<=std::max<uint64_t>(1,s.comp_size)*1000,"ZIP_DECOMPRESS_BOUND");
  need(s.encryption_method==ZIP_EM_NONE&&(s.comp_method==ZIP_CM_STORE||s.comp_method==ZIP_CM_DEFLATE),"ZIP_METHOD_ENCRYPTION");
  zip_uint8_t os;zip_uint32_t attr;need(zip_file_get_external_attributes(z.get(),i,0,&os,&attr)==0&&((attr>>16)&0xf000)!=0xa000,"ZIP_SYMLINK");
  zip_file_t* f=zip_fopen_index(z.get(),i,0);need(f,"ZIP_OPEN_ENTRY");std::vector<uint8_t> data;data.resize(size_t(s.size));uint64_t read=0;
  while(read<s.size){auto n=zip_fread(f,data.data()+read,std::min<uint64_t>(16384,s.size-read));if(n<=0){zip_fclose(f);throw std::runtime_error("ZIP_CRC_OR_SIZE");}read+=n;}
  uint8_t extra;auto tail=zip_fread(f,&extra,1);int close=zip_fclose(f);need(tail==0&&close==0,"ZIP_CRC_OR_SIZE");
  bool model=name.size()>=6&&name.substr(name.size()-6)==".model";
  if(model){need(st.facts.path.empty(),"MULTI_MODEL_PACKAGE_UNSUPPORTED");st.facts.path=name;}
  if(model||name=="[Content_Types].xml"||(name.size()>=5&&name.substr(name.size()-5)==".rels"))xml.emplace(name,std::move(data));
 }
 need(!st.facts.path.empty()&&xml.count("_rels/.rels")&&xml.count("[Content_Types].xml"),"PACKAGE_REQUIRED_PART");
 for(auto& [name,data]:xml)xml_guard(name,data,st);
 uint32_t rootLinks=0;
 for(auto& [owner,target,type]:st.relationships){need(names.count(target),"REL_TARGET_MISSING");if(type=="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"){need(owner=="_rels/.rels"&&target==st.facts.path,"MODEL_RELATIONSHIP");++rootLinks;}}
 need(rootLinks==1,"MODEL_RELATIONSHIP");
 for(auto& name:names)if(name!="[Content_Types].xml"){
  auto dot=name.rfind('.');need(st.overrides.count("/"+name)||(dot!=std::string::npos&&st.defaults.count(name.substr(dot+1))),"CONTENT_TYPE_MISSING");
 }
 auto modelMime=st.overrides.count("/"+st.facts.path)?st.overrides["/"+st.facts.path]:st.defaults["model"];
 need(modelMime=="application/vnd.ms-package.3dmanufacturing-3dmodel+xml","MODEL_CONTENT_TYPE");
 need(!st.builds.empty()&&st.facts.vertices>0&&st.facts.faces>0,"MODEL_EMPTY");
 uint32_t graphVisits=0;
 std::function<void(uint32_t,std::set<uint32_t>)> visit=[&](uint32_t id,std::set<uint32_t> seen){
  need(++graphVisits<=8192,"GRAPH_VISIT_BOUND");need(st.graph.count(id),"OBJECT_REFERENCE");need(seen.size()<32&&seen.insert(id).second,"COMPONENT_CYCLE");for(auto next:st.graph[id])visit(next,seen);
 };
 for(auto id:st.facts.objects)visit(id,{});
 for(auto id:st.builds)visit(id,{});
 return st.facts;
}
}
