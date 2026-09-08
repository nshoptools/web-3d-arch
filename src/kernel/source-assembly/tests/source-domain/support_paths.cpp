// Pure predicate/vertex-selection fixture; I/O only. Independent oracle is JS.
#include "support_regularization.h"
#include <fstream>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>
static void path_json(std::ostream&f,const Clipper2Lib::Path64&p){f<<"[";for(size_t i=0;i<p.size();i++){if(i)f<<",";f<<"["<<p[i].x<<","<<p[i].y<<"]";}f<<"]";}
int main(int argc,char**argv){try{
 if(argc!=4)throw std::runtime_error("support_paths INPUT OUTPUT WORK_LIMIT");std::ifstream in(argv[1]);if(!in)throw std::runtime_error("input");uint64_t limit=std::stoull(argv[3]);size_t count=0;in>>count;if(count>1024)throw std::runtime_error("count");
 std::vector<Clipper2Lib::Path64> all;for(size_t k=0;k<count;k++){size_t n=0;in>>n;if(n<3||n>200000)throw std::runtime_error("point budget");Clipper2Lib::Path64 p(n);for(auto&q:p)in>>q.x>>q.y;if(!in)throw std::runtime_error("read");all.push_back(std::move(p));}
 std::vector<arch_source_detail::SupportRegularization> results;uint64_t work=0;
 for(auto&p:all)results.push_back(arch_source_detail::regularize_support_path(p,[&](){if(++work>limit)throw std::runtime_error("TEST_WORK_LIMIT");}));
 std::ofstream f(argv[2]);f<<std::setprecision(17)<<"{\"work\":"<<work<<",\"rings\":[";
 for(size_t k=0;k<count;k++){if(k)f<<",";auto&r=results[k];f<<"{\"original\":";path_json(f,all[k]);f<<",\"proposal\":";path_json(f,Clipper2Lib::SimplifyPath(all[k],2.0,true));f<<",\"result\":";path_json(f,r.path);f<<",\"boundGrid\":"<<r.bound_grid<<",\"proposedBoundGrid\":"<<r.proposed_bound_grid<<",\"refinements\":"<<r.restored_chords<<"}";}f<<"]}";
 if(!f)throw std::runtime_error("write");return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
