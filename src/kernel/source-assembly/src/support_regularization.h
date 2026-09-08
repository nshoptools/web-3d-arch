#pragma once
#include <clipper2/clipper.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>

// Derived support only, on the source child's 1 nm integer grid. Never use
// this filter for original artwork or a shared material boundary.
namespace arch_source_detail {
constexpr double support_limit_grid = 2.0;
struct SupportRegularization {
  Clipper2Lib::Path64 path;
  double bound_grid = 0;
  double proposed_bound_grid = 0;
  size_t proposed_vertices = 0, restored_chords = 0, tested_vertices = 0;
};

// Outward-rounded binary64 intervals. Integer differences within the source
// domain (|coordinate| <= 1e10) are exact. Each elementary operation encloses
// its real result; the positive denominator is at least one. This avoids
// accepting a chord on a guessed epsilon or a local/infinite-line metric.
struct SupportInterval {double lo,hi;};
inline double support_down(double x){return std::nextafter(x,-std::numeric_limits<double>::infinity());}
inline double support_up(double x){return std::nextafter(x,std::numeric_limits<double>::infinity());}
inline SupportInterval support_add(SupportInterval a,SupportInterval b){return {support_down(a.lo+b.lo),support_up(a.hi+b.hi)};}
inline SupportInterval support_sub(SupportInterval a,SupportInterval b){return {support_down(a.lo-b.hi),support_up(a.hi-b.lo)};}
inline SupportInterval support_mul(SupportInterval a,SupportInterval b){
  const std::array<double,4> p={a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi};
  return {support_down(*std::min_element(p.begin(),p.end())),support_up(*std::max_element(p.begin(),p.end()))};
}
inline double support_distance_upper(const Clipper2Lib::Point64& a,
                                     const Clipper2Lib::Point64& b,
                                     const Clipper2Lib::Point64& p) {
  const double dx=double(b.x-a.x),dy=double(b.y-a.y);
  const double qx=double(p.x-a.x),qy=double(p.y-a.y);
  const SupportInterval x{dx,dx},y{dy,dy},u{qx,qx},v{qy,qy};
  const auto den=support_add(support_mul(x,x),support_mul(y,y));
  if(!(den.lo>0))throw std::logic_error("SUPPORT_ZERO_CHORD");
  const auto dot=support_add(support_mul(u,x),support_mul(v,y));
  const auto quotient=support_mul(dot,{support_down(1/den.hi),support_up(1/den.lo)});
  const SupportInterval t{std::clamp(quotient.lo,0.,1.),std::clamp(quotient.hi,0.,1.)};
  const auto rx=support_sub(u,support_mul(x,t)),ry=support_sub(v,support_mul(y,t));
  const double squared=support_add(support_mul(rx,rx),support_mul(ry,ry)).hi;
  return support_up(std::sqrt(std::max(0.,squared)));
}
// Clipper2's local SimplifyPath is a proposal, not a whole-chain bound.
// Refine an over-budget chord at its worst original vertex, using an explicit
// stack and caller work budget. Never increase epsilon or introduce a point.
// A continuous chain within distance e of a finite chord is also at
// bidirectional Hausdorff distance <= e: its continuous projection covers
// the chord. The vertex maximum bounds every original edge by convexity.
// Caller checks unique points, >=3 vertices and the total point budget.
// step is a bounded work/cancellation observation, not a geometry operation.
template<class Step>
SupportRegularization regularize_support_path(const Clipper2Lib::Path64& original,
                                              Step step) {
  SupportRegularization out;
  const auto proposal=Clipper2Lib::SimplifyPath(original,support_limit_grid,true);
  out.proposed_vertices=proposal.size();
  if(proposal.size()<3){out.path=original;out.restored_chords=1;return out;}
  std::vector<size_t> retained;retained.reserve(proposal.size());
  size_t next=0;
  for(size_t i=0;i<original.size()&&next<proposal.size();i++){
    step();
    if(original[i]==proposal[next]){retained.push_back(i);++next;}
  }
  if(next!=proposal.size())throw std::logic_error("SUPPORT_LIBRARY_VERTEX_ORDER");
  out.path.reserve(original.size());
  std::vector<std::pair<size_t,size_t>> stack;
  for(size_t i=0;i<retained.size();i++){
    const auto begin=retained[i];auto end=retained[(i+1)%retained.size()];
    if(end<=begin)end+=original.size();
    stack.emplace_back(begin,end);bool proposed=true;
    while(!stack.empty()){
      const auto [a,b]=stack.back();stack.pop_back();
      double chord_bound=0;size_t split=a;
      for(size_t j=a+1;j<b;j++){
        step();++out.tested_vertices;
        const auto d=support_distance_upper(original[a%original.size()],original[b%original.size()],original[j%original.size()]);
        if(d>chord_bound){chord_bound=d;split=j;}
      }
      if(proposed){out.proposed_bound_grid=std::max(out.proposed_bound_grid,chord_bound);proposed=false;}
      if(chord_bound<=support_limit_grid){
        out.path.push_back(original[a%original.size()]);out.bound_grid=std::max(out.bound_grid,chord_bound);
      }else{
        if(split<=a||split>=b)throw std::logic_error("SUPPORT_REFINEMENT_PROGRESS");
        ++out.restored_chords;
        // Right first on the LIFO stack preserves original cyclic order.
        stack.emplace_back(split,b);stack.emplace_back(a,split);
      }
    }
  }
  return out;
}
}