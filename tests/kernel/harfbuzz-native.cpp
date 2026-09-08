// Test-only native probe, linked to the exact same HB archive as the kernel.
// Input is a verified catalog font and already NFC-normalized UTF-16LE text.
#include <hb.h>
#include <hb-ot.h>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <vector>

static std::vector<char> read(const char* path,size_t cap){std::ifstream f(path,std::ios::binary|std::ios::ate);if(!f)throw std::runtime_error("INPUT_OPEN");auto n=f.tellg();if(n<0||static_cast<size_t>(n)>cap)throw std::runtime_error("INPUT_LIMIT");std::vector<char>b(static_cast<size_t>(n));f.seekg(0);if(!f.read(b.data(),n))throw std::runtime_error("INPUT_READ");return b;}
struct Path {std::ostringstream out;bool first=true;};
static void emit(void* data,char op,std::initializer_list<float> values){auto& p=*static_cast<Path*>(data);if(!p.first)p.out<<',';p.first=false;p.out<<"{\"type\":\""<<op<<"\",\"values\":[";bool first=true;for(float value:values){if(!first)p.out<<',';first=false;p.out<<std::setprecision(17)<<value;}p.out<<"]}";}
static void move(hb_draw_funcs_t*,void*d,hb_draw_state_t*,float x,float y,void*){emit(d,'M',{x,y});}
static void line(hb_draw_funcs_t*,void*d,hb_draw_state_t*,float x,float y,void*){emit(d,'L',{x,y});}
static void quadratic(hb_draw_funcs_t*,void*d,hb_draw_state_t*,float a,float b,float x,float y,void*){emit(d,'Q',{a,b,x,y});}
static void cubic(hb_draw_funcs_t*,void*d,hb_draw_state_t*,float a,float b,float c,float e,float x,float y,void*){emit(d,'C',{a,b,c,e,x,y});}
static void close(hb_draw_funcs_t*,void*d,hb_draw_state_t*,void*){emit(d,'Z',{});}
int main(int argc,char**argv){try{
  if(argc<4)throw std::runtime_error("font text-utf16le outline-or-color [tag=value...]");
  auto bytes=read(argv[1],32*1024*1024),raw=read(argv[2],8192);
  if(raw.size()%2)throw std::runtime_error("UTF16_LENGTH");
  std::vector<uint16_t> text;for(size_t i=0;i<raw.size();i+=2)text.push_back(static_cast<unsigned char>(raw[i])|(static_cast<unsigned char>(raw[i+1])<<8));
  auto*blob=hb_blob_create(bytes.data(),static_cast<unsigned>(bytes.size()),HB_MEMORY_MODE_READONLY,nullptr,nullptr);
  auto*face=hb_face_create(blob,0);auto*font=hb_font_create(face);hb_ot_font_set_funcs(font);
  auto upem=hb_face_get_upem(face);hb_font_set_scale(font,upem,upem);
  std::vector<hb_variation_t> variations;for(int i=4;i<argc;i++){hb_variation_t v;if(!hb_variation_from_string(argv[i],-1,&v))throw std::runtime_error("VARIATION");variations.push_back(v);}hb_font_set_variations(font,variations.data(),static_cast<unsigned>(variations.size()));
  auto*buffer=hb_buffer_create();hb_buffer_add_utf16(buffer,text.data(),static_cast<int>(text.size()),0,static_cast<int>(text.size()));
  hb_buffer_set_direction(buffer,HB_DIRECTION_LTR);hb_buffer_guess_segment_properties(buffer);hb_buffer_set_language(buffer,hb_language_from_string("vi",-1));hb_shape(font,buffer,nullptr,0);
  unsigned n=0;auto*infos=hb_buffer_get_glyph_infos(buffer,&n);auto*positions=hb_buffer_get_glyph_positions(buffer,&n);
  auto*draw=hb_draw_funcs_create();hb_draw_funcs_set_move_to_func(draw,move,nullptr,nullptr);hb_draw_funcs_set_line_to_func(draw,line,nullptr,nullptr);hb_draw_funcs_set_quadratic_to_func(draw,quadratic,nullptr,nullptr);hb_draw_funcs_set_cubic_to_func(draw,cubic,nullptr,nullptr);hb_draw_funcs_set_close_path_func(draw,close,nullptr,nullptr);
  std::cout<<"{\"version\":\""<<hb_version_string()<<"\",\"unitsPerEm\":"<<upem<<",\"glyphs\":[";
  for(unsigned i=0;i<n;i++){if(i)std::cout<<',';const auto& g=infos[i];const auto&p=positions[i];std::cout<<"{\"glyphId\":"<<g.codepoint<<",\"cluster\":"<<g.cluster<<",\"flags\":"<<hb_glyph_info_get_glyph_flags(&g)<<",\"xAdvance\":"<<p.x_advance<<",\"yAdvance\":"<<p.y_advance<<",\"xOffset\":"<<p.x_offset<<",\"yOffset\":"<<p.y_offset;
    if(std::string(argv[3])=="outline"){Path path;hb_font_draw_glyph(font,g.codepoint,draw,&path);std::cout<<",\"outline\":["<<path.out.str()<<']';}std::cout<<'}';}
  std::cout<<"]}\n";hb_draw_funcs_destroy(draw);hb_buffer_destroy(buffer);hb_font_destroy(font);hb_face_destroy(face);hb_blob_destroy(blob);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
