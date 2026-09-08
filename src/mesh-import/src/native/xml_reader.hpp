#pragma once
// Bounded pull facade over Expat 2.8.4 SAX; no home-grown XML parser.
#include "internal.hpp"
#include <expat.h>
#include <exception>
#include <algorithm>
#include <cctype>
namespace archmi {
enum eXmlReaderNodeType {XMLREADERNODETYPE_STARTELEMENT,XMLREADERNODETYPE_ENDELEMENT,XMLREADERNODETYPE_TEXT};
class BoundedXmlReader {
 struct Name {std::string uri,local;};
 struct Attribute {Name name;std::string value;};
 struct Event {eXmlReaderNodeType type;Name name;std::string value;std::vector<Attribute> attrs;std::map<std::string,std::string> namespaces;};
 XML_Parser parser=nullptr;const std::vector<uint8_t>& input;size_t offset=0,next=0,attribute=0;
 std::vector<Event> queue;Event current;bool inAttribute=false,finished=false;uint32_t depth=0;
 std::map<std::string,std::string> namespaces{{"xml","http://www.w3.org/XML/1998/namespace"}};
 std::exception_ptr failure;
 static Name name(const char* text){std::string s=text;auto pos=s.find('\x1f');return pos==std::string::npos?Name{"",s}:Name{s.substr(0,pos),s.substr(pos+1)};}
 template<class F> void callback(F f) noexcept {try{f();}catch(...){failure=std::current_exception();XML_StopParser(parser,XML_FALSE);}}
 static void start(void* user,const XML_Char* tag,const XML_Char** attrs){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([&]{
   need(++r.depth<=32,"XML_DEPTH");Event e{XMLREADERNODETYPE_STARTELEMENT,name(tag),"",{},r.namespaces};
   for(size_t i=0;attrs[i];i+=2){need(e.attrs.size()<64,"XML_ATTRIBUTE_BOUND");e.attrs.push_back({name(attrs[i]),attrs[i+1]});}
   r.queue.push_back(std::move(e));
  });
 }
 static void end(void* user,const XML_Char* tag){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([&]{need(r.depth>0,"XML_DEPTH");--r.depth;r.queue.push_back({XMLREADERNODETYPE_ENDELEMENT,name(tag),"",{},r.namespaces});});
 }
 static void characters(void* user,const XML_Char* text,int length){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([&]{r.queue.push_back({XMLREADERNODETYPE_TEXT,{},std::string(text,size_t(length)),{},r.namespaces});});
 }
 static void ns(void* user,const XML_Char* prefix,const XML_Char* uri){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([&]{
   // lib3MF's native reader registers namespaces globally; disallow rebinding.
   need(r.depth==0&&r.namespaces.size()<32,"XML_SCOPED_NAMESPACE_UNSUPPORTED");
   std::string key=prefix?prefix:"",value=uri?uri:"";need(value.size()<=4096&&!r.namespaces.count(key),"XML_NAMESPACE_REBIND");
   r.namespaces[key]=value;
  });
 }
 static void pi(void* user,const XML_Char*,const XML_Char*){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([]{need(false,"XML_PROCESSING_INSTRUCTION_UNSUPPORTED");});
 }
 static void doctype(void* user,const XML_Char*,const XML_Char*,const XML_Char*,int){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([]{need(false,"XML_DTD_UNSUPPORTED");});
 }
 static void declaration(void* user,const XML_Char* version,const XML_Char* encoding,int){
  auto& r=*static_cast<BoundedXmlReader*>(user);r.callback([&]{
   need(version&&std::string(version)=="1.0","XML_VERSION");
   if(encoding){std::string e=encoding;std::transform(e.begin(),e.end(),e.begin(),[](unsigned char c){return char(std::tolower(c));});need(e=="utf-8","XML_ENCODING");}
  });
 }
 public:
 explicit BoundedXmlReader(const std::vector<uint8_t>& b):input(b){
  need(std::string(XML_ExpatVersion())=="expat_2.8.4","EXPAT_VERSION");
  parser=XML_ParserCreateNS("UTF-8",'\x1f');need(parser,"XML_ALLOC");
  XML_SetUserData(parser,this);XML_SetElementHandler(parser,start,end);XML_SetCharacterDataHandler(parser,characters);
  XML_SetNamespaceDeclHandler(parser,ns,nullptr);XML_SetProcessingInstructionHandler(parser,pi);
  XML_SetStartDoctypeDeclHandler(parser,doctype);XML_SetXmlDeclHandler(parser,declaration);
  XML_SetParamEntityParsing(parser,XML_PARAM_ENTITY_PARSING_NEVER);
 }
 ~BoundedXmlReader(){XML_ParserFree(parser);}
 bool Read(eXmlReaderNodeType& type){
  while(next==queue.size()){
   if(finished)return false;queue.clear();next=0;
   const size_t length=std::min<size_t>(8192,input.size()-offset);finished=offset+length==input.size();
   const auto status=XML_Parse(parser,reinterpret_cast<const char*>(input.data()+offset),int(length),finished?XML_TRUE:XML_FALSE);offset+=length;
   if(failure)std::rethrow_exception(failure);need(status==XML_STATUS_OK,"XML_WELLFORMED");
  }
  current=std::move(queue[next++]);inAttribute=false;attribute=0;type=current.type;return true;
 }
 bool IsEmptyElement(){return false;}
 bool MoveToFirstAttribute(){attribute=0;inAttribute=!current.attrs.empty();return inAttribute;}
 bool MoveToNextAttribute(){if(inAttribute&&++attribute<current.attrs.size())return true;inAttribute=false;return false;}
 void GetLocalName(const char** p,void*){*p=(inAttribute?current.attrs[attribute].name.local:current.name.local).c_str();}
 void GetNamespaceURI(const char** p,void*){*p=(inAttribute?current.attrs[attribute].name.uri:current.name.uri).c_str();}
 void GetValue(const char** p,void*){*p=(inAttribute?current.attrs[attribute].value:current.value).c_str();}
 bool GetNamespaceURI(const std::string& prefix,std::string& uri){auto it=current.namespaces.find(prefix);if(it==current.namespaces.end())return false;uri=it->second;return true;}
};
}
