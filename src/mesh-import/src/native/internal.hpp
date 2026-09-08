#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "mesh_import.h"
#include <array>
#include <vector>
#include <map>
#include <set>
#include <string>
#include <memory>
#include <stdexcept>
#include <cmath>
#include <limits>
namespace archmi {
constexpr uint32_t MAX_SOURCE=64000000,MAX_FACES=400000,MAX_VERTICES=1000000,MAX_PARTS=128,MAX_MATERIALS=16;
constexpr uint32_t NO_MATERIAL=0xffffffff;
using Matrix=std::array<double,12>;
const Matrix IDENTITY{1,0,0,0,1,0,0,0,1,0,0,0};
inline void need(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
inline std::string quoted(const std::string& s){
 std::string o="\"";const char* hex="0123456789abcdef";
 for(unsigned char c:s){if(c=='"'||c=='\\'){o+='\\';o+=char(c);}else if(c<32){o+="\\u00";o+=hex[c>>4];o+=hex[c&15];}else o+=char(c);}return o+'"';
}
inline double determinant(const Matrix& a){return a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);}
inline void matrix_check(const Matrix& a){for(double v:a)need(std::isfinite(v)&&std::abs(v)<=10000,"TRANSFORM_DOMAIN");need(std::abs(determinant(a))>1e-12,"TRANSFORM_SINGULAR");}
struct Material{std::string id,name;uint32_t rgba;};
struct Detail{std::string id,name,partnumber,topology="unverified";int manifold=-1;uint32_t object=0;std::vector<Matrix> transforms;bool reflected=false;};
struct PackageFacts{
 std::string path,unit="millimeter",unitOrigin="format-default";
 double coordinateError=0,transformError=0;
 uint32_t vertices=0,faces=0;
 std::vector<std::pair<std::string,std::string>> metadata;
 std::vector<std::string> entries;
 std::vector<std::array<std::string,3>> attributes;
 std::set<uint32_t> objects;
 std::map<uint32_t,std::pair<uint32_t,uint32_t>> objectCounts;
};
struct Context{
 std::shared_ptr<std::vector<uint8_t>> original;
 std::vector<std::shared_ptr<std::vector<uint8_t>>> operands;
 std::string operandReports="[]";
 std::vector<uint32_t> source_vertices,source_faces,source_material_refs;
 std::vector<std::string> sourceMaterialNames,sourceLibraries;
 std::vector<double> vertices;std::vector<uint32_t> triangles,face_materials;
 std::vector<ArchmiPart> parts;std::vector<Detail> details;std::vector<Material> materials;
 std::string sourceId,sourceName;
 std::string format,state="staging",diagnostic,report,operation="import/v1",unit,unitOrigin;
 uint32_t leases=1;bool frozen=false,publishable=false;
 double numericError=0;PackageFacts facts;
};
PackageFacts guard_package(const std::vector<uint8_t>&);
void decode_3mf(Context&);
void validate(Context&,double);
std::shared_ptr<const Context> csg_source(uint32_t);
void report(Context&);
}
