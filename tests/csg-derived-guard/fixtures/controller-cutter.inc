// Exact parsed binary64 coordinates from the checked authored ASCII STL.
static Manifold controller_cutter(){manifold::MeshGL64 m;m.numProp=3;
m.vertProperties={-22.4192,-12.003949,-0.25,-22.0192,-11.603949,-0.25,-22.0192,-12.003949,-0.25,-22.4192,-11.603949,-0.25,-22.4192,-12.003949,2.65,-22.0192,-12.003949,2.65,-22.0192,-11.603949,2.65,-22.4192,-11.603949,2.65};
m.triVerts={0,1,2,0,3,1,4,5,6,4,6,7,0,2,5,0,5,4,2,1,6,2,6,5,1,3,7,1,7,6,3,0,4,3,4,7};m.faceID.resize(m.NumTri());std::iota(m.faceID.begin(),m.faceID.end(),uint64_t(0));
const auto id=Manifold::ReserveIDs(1);m.runOriginalID={id};m.runIndex={0,m.triVerts.size()};
ancestry[id]={1,0,0,uint32_t(m.NumTri())};return Manifold(m);}
