// Generated only from controller-metadata.json by prepare-fixture.py.
static void controller_metadata(ArchMechResult& out,ArchMechRequest& q){
q.abi_version=2;q.product=0;q.revision=1;
q.source.source_id=14492980766699310678ull;q.source.provenance_id=15511711636994161846ull;
q.mating_tolerance_mm=0.001;q.export_tolerance_mm=0.004;
out.revision=q.revision;out.export_blocked=0;
{ArchMechPartInfo p{};
p.feature_index=0;
p.role=0;
p.slot=4;
p.origin=0;
p.assembly_group=0;
p.provenance_id=12286827315462731885ull;
const double transform[16]={1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0};std::copy(transform,transform+16,p.preview_transform);out.part_info.push_back(p);}
{ArchMechPartInfo p{};
p.feature_index=1;
p.role=1;
p.slot=1;
p.origin=0;
p.assembly_group=0;
p.provenance_id=13440901658734445464ull;
const double transform[16]={1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0};std::copy(transform,transform+16,p.preview_transform);out.part_info.push_back(p);}
{ArchMechPartInfo p{};
p.feature_index=2;
p.role=1;
p.slot=2;
p.origin=0;
p.assembly_group=0;
p.provenance_id=10195264654605867423ull;
const double transform[16]={1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0};std::copy(transform,transform+16,p.preview_transform);out.part_info.push_back(p);}
{ArchMechPartInfo p{};
p.feature_index=3;
p.role=0;
p.slot=4;
p.origin=0;
p.assembly_group=0;
p.provenance_id=12286827315462731885ull;
const double transform[16]={1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0};std::copy(transform,transform+16,p.preview_transform);out.part_info.push_back(p);}
{ArchMechFeature f{};std::strcpy(f.id,"source:slab:17418185339274325469");
f.kind=2;
f.parameter_id=25;
f.role=0;
f.group=0;
f.source_id=17418185339274325469ull;
f.provenance_id=15511711636994161846ull;
const double dims[6]={0.0,2.4,0.0,0.0,0.0,0.0};std::copy(dims,dims+6,f.dimensions);out.features.push_back(f);}
{ArchMechFeature f{};std::strcpy(f.id,"source:slab:1418539335897375248");
f.kind=2;
f.parameter_id=25;
f.role=1;
f.group=0;
f.source_id=1418539335897375248ull;
f.provenance_id=9231262781575937352ull;
const double dims[6]={2.4,3.2,0.0,0.0,0.0,0.0};std::copy(dims,dims+6,f.dimensions);out.features.push_back(f);}
{ArchMechFeature f{};std::strcpy(f.id,"source:slab:14704399586199030131");
f.kind=2;
f.parameter_id=25;
f.role=1;
f.group=0;
f.source_id=14704399586199030131ull;
f.provenance_id=15944002440517866284ull;
const double dims[6]={2.4,3.2,0.0,0.0,0.0,0.0};std::copy(dims,dims+6,f.dimensions);out.features.push_back(f);}
{ArchMechFeature f{};std::strcpy(f.id,"mech:keyring");
f.kind=0;
f.parameter_id=35;
f.role=0;
f.group=0;
f.source_id=14492980766699310678ull;
f.provenance_id=44ull;
const double dims[6]={9.33793123216848e-16,15.2499990016222,0.0,2.4,8.0,4.0};std::copy(dims,dims+6,f.dimensions);out.features.push_back(f);}
{ArchMechFeature f{};std::strcpy(f.id,"mech:keyring:bore");
f.kind=1;
f.parameter_id=36;
f.role=0;
f.group=0;
f.source_id=14492980766699310678ull;
f.provenance_id=45ull;
const double dims[6]={9.33793123216848e-16,15.2499990016222,0.0,2.4,4.0,0.0};std::copy(dims,dims+6,f.dimensions);out.features.push_back(f);}
}
