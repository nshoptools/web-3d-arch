#include <clipper2/clipper.h>
#include <fstream>
#include <stdexcept>
#include <cstdint>
using namespace Clipper2Lib;
int main(int argc,char**argv){
 if(argc!=3)return 2;
 try{
  std::ifstream in(argv[1]);std::ofstream out(argv[2]);uint32_t count=0,total=0;
  auto paths=[&](){uint32_t n;in>>n;if(!in||n>4096)throw std::runtime_error("path count");
   Paths64 p(n);for(auto&c:p){uint32_t m;in>>m;if(!in||m<3||m>200000-total)throw std::runtime_error("point count");total+=m;
    for(uint32_t i=0;i<m;++i){int64_t x,y;in>>x>>y;if(!in||x<-10000000000LL||x>10000000000LL||y<-10000000000LL||y>10000000000LL)throw std::runtime_error("point");c.emplace_back(x,y);}
   }return p;};
  auto viewport=paths();in>>count;if(!in||count>256)throw std::runtime_error("shape count");
  bool comma=false;out<<"[";auto dump=[&](const char*stage,uint32_t shape,const Paths64&p){if(comma)out<<",";comma=true;
   out<<"{\"stage\":\""<<stage<<"\",\"shape\":"<<shape<<",\"contours\":[";
   for(size_t i=0;i<p.size();++i){if(i)out<<",";out<<"[";for(size_t j=0;j<p[i].size();++j){if(j)out<<",";out<<"["<<p[i][j].x<<","<<p[i][j].y<<"]";}out<<"]";}out<<"]}";};
  for(uint32_t i=0;i<count;++i){uint32_t rule;in>>rule;if(rule>1)throw std::runtime_error("rule");auto p=paths();
   auto u=Union(p,rule?FillRule::EvenOdd:FillRule::NonZero);auto v=Intersect(u,viewport,FillRule::NonZero);auto r=Union(v,FillRule::NonZero);
   dump("union",i,u);dump("viewport",i,v);dump("again",i,r);}
  out<<"]\n";std::string trailing;if(in>>trailing)throw std::runtime_error("trailing input");if(!out)return 3;
 }catch(...){return 4;}return 0;
}
