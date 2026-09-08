// Included in mechanics.cpp: reuse its actual final-volume/interval guards.
struct ArchMechGuard {
 ArchMechRequest scalars{};
 std::vector<CavityGuard> cavities;
 std::vector<TunnelGuard> tunnels;
 CrossSection footprint;
 double body_z=0,body_h=0,rot=0,secondary_x=0;
 std::vector<ArchMechPartInfo> info;
 struct Face {uint32_t part,face,group,rgba;std::array<double,9> xyz;};
 std::vector<Face> protected_faces; // Constructed mechanical faces only.
 struct SourceDatum {
  uint32_t owner,group,rgba,feature; double z; int orientation;
  uint64_t source_id,provenance_id;
 };
 std::vector<SourceDatum> source_datums;
 std::vector<uint32_t> source_face_datums; // Original GLOBAL face -> datum index.
 bool source_datums_verified=true;
 using ExactFace=std::pair<uint32_t,std::array<double,9>>;
 std::array<std::vector<ExactFace>,3> exact_group_faces;
 std::vector<std::vector<ExactFace>> exact_part_faces;
 uint64_t charge=0;
 uint32_t export_blocked=1;
};
static std::array<double,9> oriented_face(const double* xyz,const uint32_t* tri){
 std::array<std::array<double,3>,3> v;
 for(int k=0;k<3;k++)for(int a=0;a<3;a++)v[k][a]=xyz[3*size_t(tri[k])+a];
 int first=0;for(int k=1;k<3;k++)if(v[k]<v[first])first=k;
 std::array<double,9> out;for(int k=0;k<3;k++)for(int a=0;a<3;a++)out[3*k+a]=v[(first+k)%3][a];
 return out;
}

// Enclose the exact determinant of the represented binary64 XY coordinates.
// Every elementary operation rounds outward by one representable neighbour.
// A strictly signed interval proves positive represented facet area; an interval
// containing zero is unresolved. This is NOT a whole-pipeline error estimate.
static int datum_orientation(const std::array<double,9>& f){
 struct Interval {double lo,hi;};
 const double inf=std::numeric_limits<double>::infinity();
 auto sub=[&](Interval a,Interval b){return Interval{
  std::nextafter(a.lo-b.hi,-inf),std::nextafter(a.hi-b.lo,inf)};};
 auto mul=[&](Interval a,Interval b){
  const std::array<double,4> v={a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi};
  return Interval{std::nextafter(*std::min_element(v.begin(),v.end()),-inf),
   std::nextafter(*std::max_element(v.begin(),v.end()),inf)};
 };
 auto delta=[&](int a,int b){return sub({f[a],f[a]},{f[b],f[b]});};
 const auto det=sub(mul(delta(3,0),delta(7,1)),mul(delta(4,1),delta(6,0)));
 return det.lo>0?1:det.hi<0?-1:0;
}
