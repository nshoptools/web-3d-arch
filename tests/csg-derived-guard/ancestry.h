#pragma once
#include <map>
// Test adapter uses exactly the pinned Manifold run/face ancestry contract.
struct Origin {uint32_t operand,part,first,count;};
static std::map<uint32_t,Origin> ancestry;
struct Data {
 std::vector<double> xyz;std::vector<uint32_t> tri,owners,groups,origins;std::vector<ArchMechPart> parts;
 void add(const Manifold&m,uint32_t owner,uint32_t group,uint32_t color){
  auto mesh=m.GetMeshGL64();check(m.Status()==Manifold::Error::NoError&&!m.IsEmpty(),"CSG output topology");
  std::vector<uint32_t>root(mesh.NumVert());std::iota(root.begin(),root.end(),0);
  auto find=[&](uint32_t i){while(root[i]!=i){root[i]=root[root[i]];i=root[i];}return i;};
  for(size_t k=0;k<mesh.mergeFromVert.size();k++)root[find(mesh.mergeFromVert[k])]=find(mesh.mergeToVert[k]);
  std::vector<uint32_t>map(root.size(),UINT32_MAX);ArchMechPart p{};p.vertex_start=xyz.size()/3;p.triangle_start=tri.size()/3;p.color_rgba=color;p.volume_mm3=m.Volume();
  for(uint32_t i=0;i<root.size();i++){auto j=find(i);if(map[j]==UINT32_MAX){map[j]=xyz.size()/3;for(int a=0;a<3;a++)xyz.push_back(mesh.vertProperties[j*mesh.numProp+a]);}map[i]=map[j];}
  for(auto ix:mesh.triVerts)tri.push_back(map[find(ix)]);
  p.vertex_count=xyz.size()/3-p.vertex_start;p.triangle_count=tri.size()/3-p.triangle_start;parts.push_back(p);owners.push_back(owner);groups.push_back(group);
  check(mesh.runIndex.size()==mesh.runOriginalID.size()+1&&mesh.faceID.size()==mesh.NumTri(),"native CSG ancestry");
  for(size_t run=0;run<mesh.runOriginalID.size();run++){
   auto it=ancestry.find(mesh.runOriginalID[run]);
   for(size_t f=mesh.runIndex[run]/3;f<mesh.runIndex[run+1]/3;f++){
    if(it==ancestry.end())origins.insert(origins.end(),{1,0,uint32_t(mesh.faceID[f]),uint32_t(mesh.Backside(run))});
    else {const auto& o=it->second;check(mesh.faceID[f]>=o.first&&mesh.faceID[f]<uint64_t(o.first)+o.count,"face ancestry range");
     origins.insert(origins.end(),{o.operand,o.part,uint32_t(mesh.faceID[f]),uint32_t(mesh.Backside(run))});}
   }
  }
 }
 ArchMechDerivedView view(){return {1,uint32_t(xyz.size()/3),uint32_t(tri.size()/3),uint32_t(parts.size()),xyz.data(),tri.data(),parts.data(),owners.data(),groups.data(),origins.data()};}
};
Manifold solid(const ArchMechView&v,uint32_t pi){const auto&p=v.parts[pi];manifold::MeshGL64 m;m.numProp=3;m.vertProperties.assign(v.vertices_xyz+3*p.vertex_start,v.vertices_xyz+3*(p.vertex_start+p.vertex_count));for(uint32_t i=3*p.triangle_start;i<3*(p.triangle_start+p.triangle_count);i++)m.triVerts.push_back(v.triangles[i]-p.vertex_start);m.faceID.resize(p.triangle_count);std::iota(m.faceID.begin(),m.faceID.end(),uint64_t(p.triangle_start));
 const auto original=Manifold::ReserveIDs(1);m.runOriginalID={original};m.runIndex={0,m.triVerts.size()};
 ancestry[original]={0,pi,p.triangle_start,p.triangle_count};return Manifold(m);}
