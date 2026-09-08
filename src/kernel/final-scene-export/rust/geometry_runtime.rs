//! AFGM/1 manufacturing readback. Binary64 per material, no mesh verdict or STL.
use super::{wire::{self,Config,Options,Material,Result},check,failure,consume,Pin,Reservation,STATE,CONTROL,Ordering,ROOT_BYTE_CAP,OUTPUTS,Output,encode,job_cancelled,job_progress};
use std::{collections::BTreeMap,ffi::{c_char,CStr}};
use serde_json::json;
fn u64at(b:&[u8],i:usize)->u64{u64::from_le_bytes(b[i..i+8].try_into().unwrap())}
fn parse(b:&[u8])->Result<Config>{
 if b.len()<64||wire::u32at(b,0)!=0x4d474641||wire::u32at(b,4)!=1||wire::u32at(b,8)!=64{return Err("FINAL_GEOMETRY_WIRE_VERSION".into())}
 let n=wire::u32at(b,16)as usize;let generation=wire::u32at(b,20);let revision=u64at(b,24);
 if n==0||n>4096||b.len()!=64+n*24||wire::u32at(b,12)as usize!=b.len()||b[40..64].iter().any(|&x|x!=0){return Err("FINAL_GEOMETRY_WIRE_LENGTH_FLAGS".into())}
 if generation==0||generation==u32::MAX||revision==0||revision!=u64at(b,32){return Err("STALE_REVISION".into())}
 let mut mapping=Vec::with_capacity(n);for i in 0..n{let p=64+i*24;mapping.push(Material{part:wire::u32at(b,p),slot:wire::u32at(b,p+4),rgba:wire::u32at(b,p+8),source:wire::u32at(b,p+12),material_source:wire::u32at(b,p+16),reserved:wire::u32at(b,p+20)});}
 // Inspection preserves material overlap for the external checker. Payload
 // authority remains mandatory; this internal flag cannot grant exportability.
 let options=Options{version:1,size:208,format:2,inspection:1,error:0.004,vertices:200000,triangles:400000,groups:256,sections:1,points:1,output_bytes:16*1024*1024,working_bytes:128*1024*1024,..Options::default()};
 Ok(Config{options,mapping,filename:String::new(),generation,verdict:0,revision})
}
fn execute(snapshot:u32,b:&[u8],generation:u32)->Result<encode::Encoded>{
 check(generation,0)?;wire::layout()?;let config=parse(b)?;let pin=Pin::new(snapshot,config.revision)?;
 let _reservation=Reservation::new(196*1024*1024)?;let source_hash=encode::hash(pin.bytes());let scene=wire::Scene::decode(pin.bytes(),&config)?;
 let mut keys=BTreeMap::new();for m in &config.mapping{if m.slot==0||m.slot>65535||m.reserved!=0||m.rgba&255!=255{return Err("MATERIAL_MAPPING_INVALID".into())}keys.insert((m.slot,m.rgba,m.material_source),0u32);}
 if keys.len()>256{return Err("EXPORT_GROUP_LIMIT".into())}for(i,k)in keys.values_mut().enumerate(){*k=i as u32+1;}
 let dense:Vec<_>=config.mapping.iter().map(|m|Material{slot:keys[&(m.slot,m.rgba,m.material_source)],..*m}).collect();
 let control=crate::BuildControl{data:(&generation as *const u32).cast_mut().cast(),cancelled:job_cancelled,progress:job_progress};let mut error=[0 as c_char;513];
 let raw=unsafe{wire::arch_final_scene_prepare(&scene.view(),dense.as_ptr(),dense.len()as u32,&config.options,&control,error.as_mut_ptr(),513)};
 if raw.is_null(){return Err(unsafe{CStr::from_ptr(error.as_ptr())}.to_string_lossy().into_owned())}let owner=wire::Native(raw);let mut v=wire::View::default();
 if unsafe{wire::arch_final_scene_view(owner.0,&mut v)}!=1||v.version!=1||v.size!=size_of::<wire::View>()as u32||v.format!=2||v.nv>200000||v.nt>400000||v.ng as usize!=keys.len()||v.nm as usize!=config.mapping.len()||v.ns!=0||v.nc!=0||v.np!=0{return Err("FINAL_GEOMETRY_NATIVE_VIEW".into())}
 check(generation,810)?;
 let vertices=unsafe{wire::borrow(v.vertices,v.nv as usize*3)}?;let triangles=unsafe{wire::borrow(v.triangles,v.nt as usize*3)}?;let groups=unsafe{wire::borrow(v.groups,v.ng as usize)}?;let members=unsafe{wire::borrow(v.members,v.nm as usize)}?;
 let mut parts=Vec::with_capacity(groups.len());let mut metadata_groups=Vec::with_capacity(groups.len());let key_list:Vec<_>=keys.keys().copied().collect();
 for(i,g)in groups.iter().enumerate(){check(generation,820)?;if g.slot!=i as u32+1||g.m0 as usize+g.nm as usize>members.len(){return Err("FINAL_GEOMETRY_GROUP".into())}let key=key_list[i];let membership=&members[g.m0 as usize..g.m0 as usize+g.nm as usize];if membership.iter().any(|&m|m as usize>=config.mapping.len()){return Err("FINAL_GEOMETRY_GROUP".into())}
  parts.push(crate::Part{vertex_start:g.v0,vertex_count:g.nv,triangle_start:g.t0,triangle_count:g.nt,color_rgba:key.1,source_index:i as u32,contour_start:0,contour_count:0,volume_mm3:g.volume});
  metadata_groups.push(json!({"part":i,"slot":key.0,"rgba":key.1,"materialSource":key.2,"inputParts":membership.iter().map(|&m|config.mapping[m as usize].part).collect::<Vec<_>>(),"sourceIndices":membership.iter().map(|&m|config.mapping[m as usize].source).collect::<Vec<_>>()}));
 }
 let packed=crate::Snapshot::new(config.generation,vertices,triangles,&parts,&[],&[],&[],&[])?;
 if packed.bytes().len()>16*1024*1024{return Err("FINAL_GEOMETRY_OUTPUT_LIMIT".into())}
 let metadata=serde_json::to_vec(&json!({"version":"arch-final-scene-geometry/1","sourceSnapshotSha256":source_hash,"sourceSnapshotId":snapshot,"sourceSnapshotGeneration":config.generation,"revision":config.revision.to_string(),"format":"ARCH/1","geometry":"material-union","grouping":"slot-rgba-materialSource/1","groups":metadata_groups,"nativeWarningFlags":v.warnings,"meshVerdict":"unverified","coordinateFrame":"source-manufacturing-mm","boundsMm":v.bounds,"sourceUnchanged":true})).map_err(|_|"FINAL_GEOMETRY_METADATA")?;
 if metadata.len()>256*1024{return Err("FINAL_GEOMETRY_METADATA_LIMIT".into())}
 let bytes=packed.bytes().to_vec();check(generation,990)?;
 // Revalidate the immutable root authority at publication boundary too.
 let verify=Pin::new(snapshot,config.revision)?;if encode::hash(verify.bytes())!=source_hash{return Err("FINAL_GEOMETRY_SOURCE_CHANGED".into())}check(generation,999)?;
 Ok(encode::Encoded{bytes,metadata})
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_scene_geometry_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_scene_geometry(snapshot:u32,input:u32,generation:u32)->u32{
 let input=match consume(input){Ok(b)=>b,Err(e)=>return failure(&e,generation)};STATE.lock().unwrap().set_error("");
 let result=match execute(snapshot,&input.0,generation){Ok(o)=>o,Err(e)=>return failure(&e,generation)};drop(input);
 let charge=result.bytes.capacity()+result.metadata.capacity();let mut state=STATE.lock().unwrap();let mut outputs=OUTPUTS.lock().unwrap();
 if outputs.len()>=4||state.next==u32::MAX||state.bytes.checked_add(state.raster_reserved).and_then(|n|n.checked_add(charge)).is_none_or(|n|n>ROOT_BYTE_CAP){state.set_error("FINAL_OUTPUT_RESOURCE_LIMIT");CONTROL[1].store(3,Ordering::Release);return 0}
 if CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{state.set_error("STALE_GENERATION");return 0}
 if CONTROL[3].load(Ordering::Acquire)==generation{state.set_error("CANCELLED");CONTROL[1].store(4,Ordering::Release);return 0}
 let id=state.next;state.next+=1;state.bytes+=charge;outputs.insert(id,Output{bytes:result.bytes,metadata:result.metadata,leases:1,charge});CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);id
}
