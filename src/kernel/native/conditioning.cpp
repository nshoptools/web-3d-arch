#include "conditioning-internal.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <numeric>
#include <set>
#include <stdexcept>
#include <tuple>
#include <vector>
using namespace Clipper2Lib;
namespace arch_condition {
namespace {
constexpr uint32_t NONE=UINT32_MAX;
static_assert(std::numeric_limits<float>::is_iec559 && std::numeric_limits<float>::digits==24 && std::numeric_limits<double>::is_iec559 && std::numeric_limits<double>::digits==53,"IEEE binary32/binary64 required");
using Key=std::pair<int64_t,int64_t>;
[[noreturn]] void reject(const char* e){throw std::runtime_error(e);}
Key key(const Point64& p){return {p.x,p.y};}
struct Edge {uint32_t a,b,region,other=NONE;};
struct Ring {uint32_t region;std::vector<uint32_t> ids;};
struct Chain {std::vector<uint32_t> ids, kept;};
struct Graph {
 std::vector<Point64> points;
 std::vector<Edge> edges;
 std::vector<Ring> rings;
 std::vector<std::vector<uint32_t>> incident;
 std::vector<uint32_t> component,anchors;
 std::vector<bool> pin;
 std::vector<Chain> chains;
};
struct Box {int64_t l,t,r,b;};
Box edge_box(const Point64& a,const Point64& b){return {std::min(a.x,b.x),std::min(a.y,b.y),std::max(a.x,b.x),std::max(a.y,b.y)};}
bool inside(const Box& b,const Point64& p){return b.l<=p.x&&p.x<=b.r&&b.t<=p.y&&p.y<=b.b;}
bool on(const Point64& p,const Point64& a,const Point64& b){return inside(edge_box(a,b),p)&&CrossProductSign(a,b,p)==0;}
uint32_t other(const Edge& e,uint32_t v){return e.a==v?e.b:e.a;}
auto pair_of(const Edge& e){return std::minmax(e.region,e.other);}
int ring_sign(const std::vector<uint32_t>& ids,const std::vector<Point64>& ps) {
 auto it=std::min_element(ids.begin(),ids.end(),[&](auto a,auto b){return key(ps[a])<key(ps[b]);});
 auto i=static_cast<size_t>(it-ids.begin()),n=ids.size();
 return CrossProductSign(ps[ids[(i+n-1)%n]],ps[*it],ps[ids[(i+1)%n]]);
}
Graph make_graph(const std::vector<Paths64>& regions,Context& c){
 Graph g;std::map<Key,uint32_t> ids;
 uint64_t occurrences=0;
 for(const auto& region:regions)for(const auto& path:region) {
  occurrences+=path.size();if(occurrences>400000)reject("CONDITIONING_INPUT_LIMIT");
  for(const auto& p:path){c.tick();ids.emplace(key(p),0);}
 }
 if(ids.size()>200000)reject("CONDITIONING_INPUT_LIMIT");
 for(auto& entry:ids){entry.second=static_cast<uint32_t>(g.points.size());g.points.emplace_back(entry.first.first,entry.first.second);}
 g.incident.resize(ids.size());g.pin.resize(ids.size(),false);
 std::map<std::pair<uint32_t,uint32_t>,uint32_t> edges;
 for(uint32_t r=0;r<regions.size();++r){
  std::set<uint32_t> region_points;
  for(const auto& path:regions[r]){
   Ring ring{r,{}};
   for(const auto& p:path){
    auto id=ids.at(key(p));ring.ids.push_back(id);
    if(!region_points.insert(id).second)reject("PLANAR_POINT_CONTACT");
   }
   for(size_t i=0;i<ring.ids.size();++i){
    c.tick();auto a=ring.ids[i],b=ring.ids[(i+1)%ring.ids.size()];
    if(a==b)reject("CONDITIONING_ZERO_EDGE");
    auto k=std::minmax(a,b);auto found=edges.find(k);
    if(found==edges.end()){
     auto e=static_cast<uint32_t>(g.edges.size());edges.emplace(k,e);
     g.edges.push_back({a,b,r,NONE});g.incident[a].push_back(e);g.incident[b].push_back(e);
    }else{
     auto& e=g.edges[found->second];
     if(e.a!=b||e.b!=a||e.region==r||e.other!=NONE)reject("NON_MANIFOLD_PLANAR_EDGE");
     e.other=r;
    }
   }
   // Pin deterministic extrema of every face walk, including void/hole walks.
   for(int axis=0;axis<2;++axis)for(int sign:{-1,1}){
    auto cmp=[&](auto a,auto b){
     auto va=axis?g.points[a].y:g.points[a].x,vb=axis?g.points[b].y:g.points[b].x;
     if(va!=vb)return sign<0?va<vb:va>vb;return a<b;
    };
    g.pin[*std::min_element(ring.ids.begin(),ring.ids.end(),cmp)]=true;
   }
   g.rings.push_back(std::move(ring));
  }
 }
 for(uint32_t v=0;v<g.points.size();++v){
  const auto& inc=g.incident[v];
  if(inc.size()!=2||pair_of(g.edges[inc[0]])!=pair_of(g.edges[inc[1]]))g.pin[v]=true;
 }
 g.component.assign(g.points.size(),NONE);
 for(uint32_t v=0;v<g.points.size();++v)if(g.component[v]==NONE){
  auto component=static_cast<uint32_t>(g.anchors.size());g.anchors.push_back(v);g.pin[v]=true;
  std::vector<uint32_t> pending{v};g.component[v]=component;
  while(!pending.empty()){
   auto p=pending.back();pending.pop_back();c.tick();
   for(auto ei:g.incident[p]){auto q=other(g.edges[ei],p);if(g.component[q]==NONE){g.component[q]=component;pending.push_back(q);}}
  }
 }
 std::vector<bool> seen(g.edges.size(),false);
 for(uint32_t v=0;v<g.points.size();++v)if(g.pin[v])for(auto ei:g.incident[v])if(!seen[ei]){
  Chain chain;chain.ids.push_back(v);auto p=v,e=ei;
  for(;;){
   c.tick();if(seen[e])reject("CONDITIONING_CHAIN_INVARIANT");seen[e]=true;
   auto q=other(g.edges[e],p);chain.ids.push_back(q);
   if(g.pin[q])break;
   auto next=g.incident[q];e=next[0]==e?next[1]:next[0];p=q;
  }
  g.chains.push_back(std::move(chain));
 }
 if(std::find(seen.begin(),seen.end(),false)!=seen.end())reject("CONDITIONING_CHAIN_INVARIANT");
 c.ledger.source_vertices=static_cast<uint32_t>(g.points.size());
 c.ledger.source_edges=static_cast<uint32_t>(g.edges.size());
 c.ledger.source_occurrences=static_cast<uint32_t>(occurrences);
 c.ledger.loops=static_cast<uint32_t>(g.rings.size());c.ledger.chains=static_cast<uint32_t>(g.chains.size());
 c.ledger.pins=static_cast<uint32_t>(std::count(g.pin.begin(),g.pin.end(),true));
 c.ledger.components=static_cast<uint32_t>(g.anchors.size());
 return g;
}
// Full active-interval scan is intentionally work-bounded, including Y rejects.
// Pathological broad phases fail instead of hiding quadratic latency.
void intersections(const std::vector<Point64>& ps,const std::vector<Edge>& es,Context& c){
 std::vector<Box> boxes;for(const auto& e:es)boxes.push_back(edge_box(ps[e.a],ps[e.b]));
 std::vector<uint32_t> order(es.size());std::iota(order.begin(),order.end(),0);
 std::sort(order.begin(),order.end(),[&](auto a,auto b){return std::tie(boxes[a].l,boxes[a].t,a)<std::tie(boxes[b].l,boxes[b].t,b);});
 std::vector<uint32_t> active;
 for(auto i:order){
  c.tick();size_t retained=0;const auto& e=es[i];auto a=ps[e.a],b=ps[e.b];
  for(auto j:active){
   c.tick();if(boxes[j].r<boxes[i].l)continue;active[retained++]=j;
   if(boxes[j].b<boxes[i].t||boxes[i].b<boxes[j].t)continue;
   ++c.ledger.intersection_pairs;
   const auto& f=es[j];auto x=ps[f.a],y=ps[f.b];
   bool shared=e.a==f.a||e.a==f.b||e.b==f.a||e.b==f.b;
   int ax=CrossProductSign(a,b,x),ay=CrossProductSign(a,b,y),xa=CrossProductSign(x,y,a),xb=CrossProductSign(x,y,b);
   if(shared){
    // Adjacent edges may only meet at their common endpoint; no folded overlap.
    if((f.a!=e.a&&f.a!=e.b&&on(x,a,b))||(f.b!=e.a&&f.b!=e.b&&on(y,a,b))||
       (e.a!=f.a&&e.a!=f.b&&on(a,x,y))||(e.b!=f.a&&e.b!=f.b&&on(b,x,y)))
      reject("CONDITIONING_TOPOLOGY_INTERSECTION");
   }else if((ax*ay<0&&xa*xb<0)||(!ax&&on(x,a,b))||(!ay&&on(y,a,b))||
             (!xa&&on(a,x,y))||(!xb&&on(b,x,y)))reject("CONDITIONING_TOPOLOGY_INTERSECTION");
  }
  active.resize(retained);active.push_back(i);
 }
}
int winding(const Point64& p,const std::vector<uint32_t>& ring,const std::vector<Point64>& ps,Context& c){
 int w=0;
 for(size_t i=0;i<ring.size();++i){
  c.tick();auto a=ps[ring[i]],b=ps[ring[(i+1)%ring.size()]];
  if(on(p,a,b))reject("CONDITIONING_NESTING_CONTACT");
  if(a.y<=p.y&&b.y>p.y&&CrossProductSign(a,b,p)>0)++w;
  if(a.y>p.y&&b.y<=p.y&&CrossProductSign(a,b,p)<0)--w;
 }
 return w;
}
Box ring_box(const std::vector<uint32_t>& ids,const std::vector<Point64>& ps){
 Box b{INT64_MAX,INT64_MAX,INT64_MIN,INT64_MIN};
 for(auto i:ids){b.l=std::min(b.l,ps[i].x);b.t=std::min(b.t,ps[i].y);b.r=std::max(b.r,ps[i].x);b.b=std::max(b.b,ps[i].y);}return b;
}
void embedding(const Graph& g,const std::vector<Point64>& before,const std::vector<Point64>& after,
 const std::vector<Ring>& old_rings,const std::vector<Ring>& rings,
 const std::vector<Edge>& edges,const std::vector<bool>& keep,bool original_chains,Context& c){
 std::set<Key> unique;
 for(uint32_t v=0;v<after.size();++v)if(keep[v]&&!unique.insert(key(after[v])).second)reject("CONDITIONING_VERTEX_COLLISION");
 intersections(after,edges,c);
 for(uint32_t i=0;i<rings.size();++i){
  c.tick();
  if(rings[i].ids.size()<3||!ring_sign(rings[i].ids,after)||ring_sign(old_rings[i].ids,before)!=ring_sign(rings[i].ids,after))
    reject("CONDITIONING_TOPOLOGY_ORIENTATION");
 }
 // Port IDs are chain IDs, so the cyclic order comparison survives subdivision.
 using Port=std::pair<uint32_t,uint32_t>;
 std::vector<std::vector<Port>> old_ports(g.points.size()),new_ports(g.points.size());
 for(uint32_t i=0;i<g.chains.size();++i){
  const auto& chain=g.chains[i];const auto& from=chain.ids;const auto& to=chain.kept;
  // For the float pass both embeddings use the already-conditioned chains.
  const auto& old=original_chains?from:to;
  for(int side:{0,1}){
   auto p=side?to.back():to.front();
   old_ports[p].push_back({i,side?old[old.size()-2]:old[1]});
   new_ports[p].push_back({i,side?to[to.size()-2]:to[1]});
  }
 }
 auto cyclic=[&](std::vector<Port> ports,uint32_t v,const std::vector<Point64>& ps){
  auto upper=[&](uint32_t p){auto d=ps[p]-ps[v];return d.y>0||(d.y==0&&d.x>=0);};
  std::sort(ports.begin(),ports.end(),[&](auto a,auto b){
   bool ah=upper(a.second),bh=upper(b.second);if(ah!=bh)return ah>bh;
   int cr=CrossProductSign(ps[v],ps[a.second],ps[b.second]);return cr?cr>0:a.first<b.first;
  });
  std::vector<uint32_t> out;for(auto p:ports)out.push_back(p.first);
  if(!out.empty())std::rotate(out.begin(),std::min_element(out.begin(),out.end()),out.end());return out;
 };
 for(uint32_t v=0;v<g.points.size();++v)if(g.pin[v]){
  c.tick();if(cyclic(old_ports[v],v,before)!=cyclic(new_ports[v],v,after))reject("CONDITIONING_PORT_ORDER");
 }
 // Compare every disconnected component's pinned witness against every face walk.
 // BBoxes may skip an exact ray test, but every attempted pair consumes work.
 std::vector<Box> ob,nb;
 for(size_t i=0;i<rings.size();++i){ob.push_back(ring_box(old_rings[i].ids,before));nb.push_back(ring_box(rings[i].ids,after));}
 for(auto anchor:g.anchors)for(size_t j=0;j<rings.size();++j){
  c.tick();if(g.component[anchor]==g.component[rings[j].ids[0]])continue;
  bool a=inside(ob[j],before[anchor]),b=inside(nb[j],after[anchor]);
  if(!a&&!b)continue;++c.ledger.nesting_tests;
  auto old=a?winding(before[anchor],old_rings[j].ids,before,c):0;
  auto next=b?winding(after[anchor],rings[j].ids,after,c):0;
  if(old!=next)reject("CONDITIONING_NESTING_CHANGED");
 }
}
} // namespace
void Context::tick(uint64_t amount){
 if(amount>options.max_work_units-ledger.work_units)reject("CONDITIONING_WORK_LIMIT");
 auto old=ledger.work_units;ledger.work_units+=amount;
 if((old>>10)!=(ledger.work_units>>10)||old==0){
  if(control&&control->cancelled&&control->cancelled(control->data))reject("CANCELLED");
  if(control&&control->progress)control->progress(control->data,progress);
 }
}
void validate_options(const ArchConditionOptions* o){
 if(!o||o->version!=1||o->bytes!=48||o->reserved||o->prior_verified>1||o->budget_class<1||o->budget_class>3||
    o->chord_linf_nm>1414||o->max_output_points<3||o->max_output_points>32768||
    o->max_part_points<3||o->max_part_points>8192||o->max_work_units<1||o->max_work_units>100000000||
    o->total_budget_nm<1||o->prior_bound_nm>4000||
    o->total_budget_nm>(o->budget_class==1?2000u:o->budget_class==2?1000u:4000u))
  reject("CONDITIONING_INVALID_OPTIONS");
 if(!o->prior_verified)reject("CONDITIONING_UPSTREAM_UNVERIFIED");
 if(o->prior_bound_nm>o->total_budget_nm)reject("CONDITIONING_BUDGET_EXCEEDED");
}
void graph(std::vector<Paths64>& regions,Context& c){
 auto g=make_graph(regions,c);intersections(g.points,g.edges,c);
 std::vector<bool> keep=g.pin;
 uint32_t actual=0;
 for(auto& chain:g.chains){
  const auto& ids=chain.ids;
  std::vector<std::pair<size_t,size_t>> pending{{0,ids.size()-1}};
  while(!pending.empty()){
   auto [a,b]=pending.back();pending.pop_back();c.tick();
   if(b==a+1){keep[ids[a]]=keep[ids[b]]=true;continue;}
   int64_t n=static_cast<int64_t>(b-a),max_num=0;
   auto start=g.points[ids[a]],delta=g.points[ids[b]]-start;
   for(size_t i=a+1;i<b;++i){
    c.tick();auto p=g.points[ids[i]]-start;auto k=static_cast<int64_t>(i-a);
    // |coordinate|<=1e10, n<=200000: all products/differences fit signed i64.
    max_num=std::max({max_num,std::abs(p.x*n-delta.x*k),std::abs(p.y*n-delta.y*k)});
   }
   if(max_num<=int64_t(c.options.chord_linf_nm)*n&&ids[a]!=ids[b]){
    actual=std::max(actual,static_cast<uint32_t>((max_num+n-1)/n));
    keep[ids[a]]=keep[ids[b]]=true;
   }else{
    auto mid=a+(b-a)/2;pending.push_back({mid,b});pending.push_back({a,mid});
   }
  }
  for(auto id:ids)if(keep[id])chain.kept.push_back(id);
 }
 c.ledger.output_vertices=static_cast<uint32_t>(std::count(keep.begin(),keep.end(),true));
 if(c.ledger.output_vertices>c.options.max_output_points)reject("CONDITIONING_OUTPUT_LIMIT");
 auto rings=g.rings;std::vector<Edge> edges;
 for(const auto& chain:g.chains){
  // Recover material incidences from the first source edge; no label reassignment.
  auto a=chain.ids[0],b=chain.ids[1];auto ei=*std::find_if(g.incident[a].begin(),g.incident[a].end(),[&](auto i){return other(g.edges[i],a)==b;});
  auto source=g.edges[ei];if(source.a!=a)std::swap(source.region,source.other);
  for(size_t j=0;j+1<chain.kept.size();++j)edges.push_back({chain.kept[j],chain.kept[j+1],source.region,source.other});
 }
 std::vector<uint32_t> part_points(regions.size(),0);
 for(auto& ring:rings){
  ring.ids.erase(std::remove_if(ring.ids.begin(),ring.ids.end(),[&](auto id){return !keep[id];}),ring.ids.end());
  if(ring.ids.size()<3)reject("CONDITIONING_TOPOLOGY_COLLAPSE");
  part_points[ring.region]+=static_cast<uint32_t>(ring.ids.size());
  if(part_points[ring.region]>c.options.max_part_points)reject("CONDITIONING_PART_LIMIT");
  c.ledger.output_occurrences+=static_cast<uint32_t>(ring.ids.size());
 }
 embedding(g,g.points,g.points,g.rings,rings,edges,keep,true,c);
 // Float32 XY is exactly representable on a 2^-43 mm lattice in this domain:
 // nonzero retained grid input has magnitude >=1e-6 mm; f32 ULP >=2^-43.
 // Lift to int64 without rounding; exact Clipper orientation predicates remain safe.
 auto lifted=g.points;
 for(uint32_t i=0;i<g.points.size();++i)if(keep[i]){
  double x=std::ldexp(double(float(double(g.points[i].x)/1e6)),43);
  double y=std::ldexp(double(float(double(g.points[i].y)/1e6)),43);
  if(std::abs(x)>1e17||std::abs(y)>1e17||x!=std::trunc(x)||y!=std::trunc(y))reject("CONDITIONING_FLOAT_RANGE");
  lifted[i]=Point64(static_cast<int64_t>(x),static_cast<int64_t>(y));
 }
 embedding(g,g.points,lifted,rings,rings,edges,keep,false,c);
 c.ledger.conditioning_linf_nm=actual;
 c.ledger.conditioning_euclidean_nm=static_cast<uint32_t>((uint64_t(actual)*1414213563ULL+999999999ULL)/1000000000ULL);
 c.ledger.output_edges=static_cast<uint32_t>(edges.size());
 c.ledger.changed=c.ledger.output_vertices!=c.ledger.source_vertices;
 c.ledger.part_count=static_cast<uint32_t>(std::count_if(regions.begin(),regions.end(),[](const auto& r){return !r.empty();}));
 
 auto& proof=c.proof;proof.assign(144,0);
 auto u32=[&](uint32_t x){for(int j=0;j<4;++j)proof.push_back(uint8_t(x>>(8*j)));};
 auto i64=[&](int64_t x){for(int j=0;j<8;++j)proof.push_back(uint8_t(uint64_t(x)>>(8*j)));};
 auto set32=[&](size_t pos,uint32_t x){for(int j=0;j<4;++j)proof[pos+j]=uint8_t(x>>(8*j));};
 auto section=[&](uint32_t id,uint32_t stride,uint32_t count){
  while(proof.size()%8)proof.push_back(0);
  size_t p=16+(id-1)*16;set32(p,id);set32(p+4,stride);set32(p+8,count);set32(p+12,static_cast<uint32_t>(proof.size()));
 };
 section(1,16,static_cast<uint32_t>(g.points.size()));for(const auto& p:g.points){i64(p.x);i64(p.y);}
 section(2,16,static_cast<uint32_t>(g.edges.size()));for(const auto& e:g.edges){u32(e.a);u32(e.b);u32(e.region);u32(e.other);}
 section(3,16,static_cast<uint32_t>(g.rings.size()));uint32_t cursor=0;
 for(const auto& ring:g.rings){u32(ring.region);u32(cursor);u32(static_cast<uint32_t>(ring.ids.size()));u32(g.component[ring.ids[0]]);cursor+=static_cast<uint32_t>(ring.ids.size());}
 section(4,4,cursor);for(const auto& ring:g.rings)for(auto id:ring.ids)u32(id);
 section(5,4,c.ledger.pins);for(uint32_t i=0;i<g.pin.size();++i)if(g.pin[i])u32(i);
 section(6,16,static_cast<uint32_t>(g.chains.size()));uint32_t sc=0,kc=0;
 for(const auto& chain:g.chains){u32(sc);u32(static_cast<uint32_t>(chain.ids.size()));u32(kc);u32(static_cast<uint32_t>(chain.kept.size()));sc+=static_cast<uint32_t>(chain.ids.size());kc+=static_cast<uint32_t>(chain.kept.size());}
 section(7,4,sc);for(const auto& chain:g.chains)for(auto id:chain.ids)u32(id);
 section(8,4,kc);for(const auto& chain:g.chains)for(auto id:chain.kept)u32(id);
 if(proof.size()>32*1024*1024)reject("CONDITIONING_PROOF_LIMIT");
 set32(0,0x48504743);set32(4,1);set32(8,static_cast<uint32_t>(proof.size()));set32(12,8);

 for(auto& r:regions)r.clear();
 for(const auto& ring:rings){Path64 path;for(auto id:ring.ids)path.push_back(g.points[id]);regions[ring.region].push_back(std::move(path));}
}
void mesh(const ArchSceneView& v,Context& c){
 c.progress=960;
 // Pin Manifold's actual output to the certified XY vertices and the input slab's
 // two Z planes (checked in geometry.cpp). Any unaccounted relocation is refused.
 std::set<std::pair<double,double>> xy;
 for(uint32_t i=0;i<v.point_count;++i)xy.emplace(double(v.points_xy[i*2])/1e6,double(v.points_xy[i*2+1])/1e6);
 double max_l1=0;
 for(uint32_t i=0;i<v.vertex_count;++i){
  c.tick();const double* p=v.vertices_xyz+3*i;
  if(!xy.count({p[0],p[1]}))reject("CONDITIONING_MESH_RELOCATED");
  double sum=0;for(int a=0;a<3;++a)sum+=std::abs(p[a]-double(float(p[a])));
  max_l1=std::max(max_l1,sum);
 }
 for(uint32_t pi=0;pi<v.part_count;++pi){
  const auto& p=v.parts[pi];std::set<std::array<float,3>> welded;
  std::set<std::pair<double,double>> required,actual_xy;
  for(uint32_t ci=p.contour_start;ci<p.contour_start+p.contour_count;++ci){
   const auto& ring=v.contours[ci];
   for(uint32_t j=ring.index_start;j<ring.index_start+ring.index_count;++j){auto id=v.contour_indices[j];required.emplace(double(v.points_xy[2*id])/1e6,double(v.points_xy[2*id+1])/1e6);}
  }
  for(uint32_t j=p.vertex_start;j<p.vertex_start+p.vertex_count;++j){
   c.tick();const double* xyz=v.vertices_xyz+3*j;
   actual_xy.emplace(xyz[0],xyz[1]);
   if(!welded.insert({float(xyz[0]),float(xyz[1]),float(xyz[2])}).second)reject("CONDITIONING_FLOAT_VERTEX_COLLISION");
  }
  if(required!=actual_xy||p.vertex_count!=2*required.size())reject("CONDITIONING_MESH_BOUNDARY_CHANGED");
 }
 for(uint32_t i=0;i<v.triangle_count;++i){
  c.tick();double p[3][3],q[3][3],n[3],m[3];
  for(int j=0;j<3;++j)for(int a=0;a<3;++a){p[j][a]=v.vertices_xyz[3*v.triangles[3*i+j]+a];q[j][a]=double(float(p[j][a]));}
  for(int a=0;a<3;++a){int b=(a+1)%3,d=(a+2)%3;n[a]=(p[1][b]-p[0][b])*(p[2][d]-p[0][d])-(p[1][d]-p[0][d])*(p[2][b]-p[0][b]);m[a]=(q[1][b]-q[0][b])*(q[2][d]-q[0][d])-(q[1][d]-q[0][d])*(q[2][b]-q[0][b]);}
  double len=std::hypot(m[0],m[1],m[2]),dot=n[0]*m[0]+n[1]*m[1]+n[2]*m[2];
  if(!std::isfinite(len)||len<=0||!std::isfinite(dot)||dot<=0)reject("CONDITIONING_FLOAT_TRIANGLE_UNSAFE");
 }
 c.ledger.mesh_conversion_nm=1; // conservative XY divide + Z subtract/translate rounding envelope
 c.ledger.float32_nm=static_cast<uint32_t>(std::ceil(max_l1*1e6))+1;
 c.ledger.prior_nm=c.options.prior_bound_nm;c.ledger.budget_nm=c.options.total_budget_nm;
 c.ledger.total_nm=c.ledger.prior_nm+c.ledger.conditioning_euclidean_nm+c.ledger.mesh_conversion_nm+c.ledger.float32_nm;
 if(c.ledger.total_nm>c.ledger.budget_nm)reject("CONDITIONING_BUDGET_EXCEEDED");
}
} // namespace arch_condition