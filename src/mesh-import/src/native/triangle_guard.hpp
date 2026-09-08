#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <numeric>
#include <queue>
#include <set>
#include <functional>
#include <vector>
/* Validation only, not a triangulator or Boolean. Conservative separating
 * plane proof for every potentially touching triangle pair. Rounded-outward
 * intervals enclose elementary operations on the supplied binary64 vertices.
 * A missed separator is UNVERIFIED, never a tolerance-based "no intersection".
 * Budgeted sweep, followed by finite candidate separating axes. False rejects
 * are allowed: no claim that all disjoint triangles find a certificate.
 */
namespace archcsg_guard {
struct I { double lo,hi; };
inline I point(double a){return {a,a};}
inline I add(I a,I b){
 if(a.lo==0&&a.hi==0)return b;if(b.lo==0&&b.hi==0)return a;
 return {std::nextafter(a.lo+b.lo,-INFINITY),std::nextafter(a.hi+b.hi,INFINITY)};
}
inline I sub(I a,I b){
 if(a.lo==a.hi&&b.lo==b.hi&&a.lo==b.lo)return point(0);
 return add(a,{-b.hi,-b.lo});
}
inline I mul(I a,I b){
 if((a.lo==0&&a.hi==0)||(b.lo==0&&b.hi==0))return point(0);
 double x[]={a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi};
 return {std::nextafter(*std::min_element(x,x+4),-INFINITY),std::nextafter(*std::max_element(x,x+4),INFINITY)};
}
using V=std::array<I,3>;using D=std::array<double,3>;
inline V sub(V a,V b){return {sub(a[0],b[0]),sub(a[1],b[1]),sub(a[2],b[2])};}
inline V cross(V a,V b){return {sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))};}
inline I dot(V a,V b){return add(add(mul(a[0],b[0]),mul(a[1],b[1])),mul(a[2],b[2]));}
inline V exact(D a){return {point(a[0]),point(a[1]),point(a[2])};}
inline D center(V a){return {a[0].lo/2+a[0].hi/2,a[1].lo/2+a[1].hi/2,a[2].lo/2+a[2].hi/2};}
inline D normalized(D a){double m=std::max({std::abs(a[0]),std::abs(a[1]),std::abs(a[2])});if(m>0&&std::isfinite(m))for(auto&x:a)x/=m;return a;}
struct T {std::array<uint32_t,3> ids;std::array<V,3> p;D lo,hi;};
template<class Tick>
bool pair(const T&a,const T&b,Tick tick){
 std::vector<uint32_t> shared;
 for(auto i:a.ids)for(auto j:b.ids)if(i==j)shared.push_back(i);
 if(shared.size()==3)return false;
 if(shared.size()==2){
  V base{},edge{},av{},bv{};
  for(int i=0;i<3;i++)if(a.ids[i]==shared[0])base=a.p[i];
  for(int i=0;i<3;i++)if(a.ids[i]==shared[1])edge=sub(a.p[i],base);
  for(int i=0;i<3;i++)if(a.ids[i]!=shared[0]&&a.ids[i]!=shared[1])av=sub(a.p[i],base);
  for(int i=0;i<3;i++)if(b.ids[i]!=shared[0]&&b.ids[i]!=shared[1])bv=sub(b.p[i],base);
  // Noncoplanar planes intersect only on the shared edge. In the coplanar
  // case opposite open half planes cannot overlap away from that edge.
  auto det=dot(cross(edge,av),bv);
  return det.lo>0||det.hi<0||dot(cross(edge,av),cross(edge,bv)).hi<0;
 }
 std::array<V,3> ap=a.p,bp=b.p;
 if(shared.size()==1){
  V base{};for(int i=0;i<3;i++)if(a.ids[i]==shared[0])base=a.p[i];
  for(auto&p:ap)p=sub(p,base);for(auto&p:bp)p=sub(p,base);
 }
 std::array<V,3> ae,be;
 for(int i=0;i<3;i++){ae[i]=sub(ap[(i+1)%3],ap[i]);be[i]=sub(bp[(i+1)%3],bp[i]);}
 auto an=cross(ae[0],ae[1]),bn=cross(be[0],be[1]);
 std::vector<D> axes{{1,0,0},{0,1,0},{0,0,1},normalized(center(an)),normalized(center(bn))};
 for(int i=0;i<3;i++){
  axes.push_back(normalized(center(cross(an,ae[i]))));
  axes.push_back(normalized(center(cross(bn,be[i]))));
  for(int j=0;j<3;j++)axes.push_back(normalized(center(cross(ae[i],be[j]))));
 }
 D cent{};for(int k=0;k<3;k++)for(int i=0;i<3;i++)cent[k]+=center(ap[i])[k]-center(bp[i])[k];
 axes.push_back(normalized(cent));
 std::set<D> tested;
 auto separates=[&](D axis){
  // Exact duplicate/zero directions add no separating certificate. Canonical
  // scaling/sign only proposes an axis; rounded-outward projections below
  // remain the sole acceptance proof. No vertex or tolerance is changed.
  axis=normalized(axis);
  for(auto x:axis)if(x!=0){if(x<0)for(auto&y:axis)y=-y;break;}
  if((axis[0]==0&&axis[1]==0&&axis[2]==0)||!tested.insert(axis).second)return false;
  tick();
  auto n=exact(axis);
  if(shared.empty()){
   I aa{INFINITY,-INFINITY},bb=aa;
   for(int i=0;i<3;i++){auto x=dot(ap[i],n),y=dot(bp[i],n);aa.lo=std::min(aa.lo,x.lo);aa.hi=std::max(aa.hi,x.hi);bb.lo=std::min(bb.lo,y.lo);bb.hi=std::max(bb.hi,y.hi);}
   return aa.hi<bb.lo||bb.hi<aa.lo;
  }
  I aa{INFINITY,-INFINITY},bb=aa;
  for(int i=0;i<3;i++){
   if(a.ids[i]!=shared[0]){auto x=dot(ap[i],n);aa.lo=std::min(aa.lo,x.lo);aa.hi=std::max(aa.hi,x.hi);}
   if(b.ids[i]!=shared[0]){auto x=dot(bp[i],n);bb.lo=std::min(bb.lo,x.lo);bb.hi=std::max(bb.hi,x.hi);}
  }
  return (aa.hi<0&&bb.lo>=0)||(aa.hi<=0&&bb.lo>0)||(bb.hi<0&&aa.lo>=0)||(bb.hi<=0&&aa.lo>0);
 };
 std::vector<D> unique;std::set<D> seen;
 for(auto n:axes){n=normalized(n);for(auto x:n)if(x!=0){if(x<0)for(auto&y:n)y=-y;break;}
  if((n[0]!=0||n[1]!=0||n[2]!=0)&&seen.insert(n).second)unique.push_back(n);}
 axes=std::move(unique);
 for(auto n:axes)if(separates(n))return true;
 // Supporting-axis bisectors help vertex-only contacts in triangulated fans.
 // The rounded proposal axis is subsequently treated as exact binary64;
 // only interval projection, not its construction, grants the certificate.
 if(shared.size()==1)for(size_t i=0;i<axes.size();i++)for(size_t j=i+1;j<axes.size();j++)for(int sign:{-1,1}){
  D n;for(int k=0;k<3;k++)n[k]=axes[i][k]+sign*axes[j][k];if(separates(n))return true;
 }
 return false;
}
template<class Tick>
bool check(const std::vector<double>&xyz,const std::vector<uint32_t>&tri,Tick tick){
 std::vector<T> faces;faces.reserve(tri.size()/3);
 for(size_t i=0;i<tri.size();i+=3){
  T t;t.lo={INFINITY,INFINITY,INFINITY};t.hi={-INFINITY,-INFINITY,-INFINITY};
  for(int j=0;j<3;j++){
   t.ids[j]=tri[i+j];
   for(int k=0;k<3;k++){double x=xyz[size_t(t.ids[j])*3+k];t.p[j][k]=point(x);t.lo[k]=std::min(t.lo[k],x);t.hi[k]=std::max(t.hi[k],x);}
  }faces.push_back(t);
 }
 // Pick the sweep axis with the fewest CLOSED interval overlaps. This
 // changes enumeration cost only; every potentially touching pair still
 // reaches the same interval separator test. Equal endpoints are retained.
 // Sorting/heap operations are O(n log n); n and each scan are budgeted.
 int axis=0;uint64_t best=UINT64_MAX;
 for(int k=0;k<3;k++){
  std::vector<size_t> order(faces.size());std::iota(order.begin(),order.end(),0);
  std::stable_sort(order.begin(),order.end(),[&](size_t a,size_t b){return faces[a].lo[k]<faces[b].lo[k];});
  std::priority_queue<double,std::vector<double>,std::greater<double>> ends;
  uint64_t score=0;
  for(auto i:order){tick();while(!ends.empty()&&ends.top()<faces[i].lo[k])ends.pop();score+=ends.size();ends.push(faces[i].hi[k]);}
  if(score<best){best=score;axis=k;}
 }
 std::stable_sort(faces.begin(),faces.end(),[&](auto&a,auto&b){return a.lo[axis]<b.lo[axis];});
 for(size_t i=0;i<faces.size();i++)for(size_t j=i+1;j<faces.size()&&faces[j].lo[axis]<=faces[i].hi[axis];j++){
  tick();auto&a=faces[i];auto&b=faces[j];
  if(a.hi[0]<b.lo[0]||b.hi[0]<a.lo[0]||a.hi[1]<b.lo[1]||b.hi[1]<a.lo[1]||a.hi[2]<b.lo[2]||b.hi[2]<a.lo[2])continue;
  if(!pair(a,b,tick))return false;
 }
 return true;
}
}
