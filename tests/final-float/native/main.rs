use arch_kernel::*;
use std::{fs,env,slice,sync::atomic::{AtomicU32,Ordering}};
use sha2::{Digest,Sha256};
unsafe extern "C" {
 fn arch_control_reset(g:u32)->u32;fn arch_control_ptr()->*const AtomicU32;
 fn arch_input_create(n:u32)->u32;fn arch_input_ptr(id:u32)->*mut u8;fn arch_input_release(id:u32)->u32;
 fn arch_snapshot_ptr(id:u32)->*const u8;fn arch_snapshot_len(id:u32)->u32;fn arch_snapshot_release(id:u32)->u32;
 fn arch_error_ptr()->*const u8;fn arch_error_len()->u32;
}
fn input(b:&[u8])->u32{unsafe{let id=arch_input_create(b.len()as u32);assert_ne!(id,0);std::ptr::copy_nonoverlapping(b.as_ptr(),arch_input_ptr(id),b.len());id}}
fn error()->String{unsafe{String::from_utf8_lossy(slice::from_raw_parts(arch_error_ptr(),arch_error_len()as usize)).into()}}
fn copy(p:*const u8,n:u32)->Vec<u8>{if n==0{return vec![]}unsafe{slice::from_raw_parts(p,n as usize).to_vec()}}
fn bytes(id:u32)->Vec<u8>{unsafe{copy(arch_snapshot_ptr(id),arch_snapshot_len(id))}}
fn field(b:&[u8],at:usize)->u32{u32::from_le_bytes(b[at..at+4].try_into().unwrap())}
fn w(b:&mut[u8],at:usize,n:u32){b[at..at+4].copy_from_slice(&n.to_le_bytes())}
fn hash(b:&[u8])->String{Sha256::digest(b).iter().map(|v|format!("{v:02x}")).collect()}
fn unhex(s:&str)->Vec<u8>{s.as_bytes().chunks(2).map(|p|u8::from_str_radix(std::str::from_utf8(p).unwrap(),16).unwrap()).collect()}
fn options(b:&[u8],revision:u64)->Vec<u8>{let n=field(b,28)as usize;let mut o=vec![0;256+n*24+5];for(i,v)in [1,208,1].into_iter().enumerate(){w(&mut o,i*4,v)}o[72..80].copy_from_slice(&0.004f64.to_le_bytes());for(i,v)in [200000,400000,256,256,200000,16*1024*1024,128*1024*1024,0].into_iter().enumerate(){w(&mut o,176+i*4,v)}for(i,v)in [0x58454641,1,field(b,16),0,1,0,n as u32,5].into_iter().enumerate(){w(&mut o,208+i*4,v)}o[240..248].copy_from_slice(&revision.to_le_bytes());o[248..256].copy_from_slice(&revision.to_le_bytes());for i in 0..n{let p=field(b,56)as usize+i*40;for(j,v)in [i as u32,1,field(b,p+16),field(b,p+20),i as u32+1,0].into_iter().enumerate(){w(&mut o,256+i*24+j*4,v)}}o[256+n*24..].copy_from_slice(b"float");o}
fn prepare_wire(o:&[u8])->Vec<u8>{let mut b=vec![0;64+o.len()];for(i,v)in [0x50434641,1,64,b.len()as u32,o.len()as u32].into_iter().enumerate(){w(&mut b,i*4,v)}b[32..40].copy_from_slice(&0.00001f64.to_le_bytes());b[40..48].copy_from_slice(&50_000_000u64.to_le_bytes());b[64..].copy_from_slice(o);b}
fn geometry_wire(o:&[u8])->Vec<u8>{let n=field(o,232)as usize;let mut b=vec![0;64+n*24];for(i,v)in [0x4d474641,1,64,b.len()as u32,n as u32,field(o,216)].into_iter().enumerate(){w(&mut b,i*4,v)}b[24..32].copy_from_slice(&o[240..248]);b[32..40].copy_from_slice(&o[248..256]);b[64..].copy_from_slice(&o[256..256+n*24]);b}
fn confirm_wire(m:&serde_json::Value)->Vec<u8>{let c=&m["confirmation"];let mut b=vec![0;128];for(i,v)in [0x43434641,1,128,0,c["sourceGeneration"].as_u64().unwrap()as u32].into_iter().enumerate(){w(&mut b,i*4,v)}b[24..32].copy_from_slice(&c["sourceRevision"].as_str().unwrap().parse::<u64>().unwrap().to_le_bytes());for(at,key)in [(32,"sourceHash"),(64,"proposalHash"),(96,"optionsHash")]{b[at..at+32].copy_from_slice(&unhex(c[key].as_str().unwrap()))}b}
fn next(g:&mut u32)->u32{*g+=1;assert_eq!(unsafe{arch_control_reset(*g)},1);*g}
fn main(){let args:Vec<_>=env::args().collect();assert_eq!(args.len(),5,"SOURCE.svg REQUEST OUT-DIRECTORY ASSEMBLY-REQUEST");let source=fs::read(&args[1]).unwrap();let request=fs::read(&args[2]).unwrap();let out=std::path::Path::new(&args[3]);fs::create_dir_all(out).unwrap();let mut g=0;let mut checks=Vec::new();
 macro_rules! ck{($c:expr,$s:expr)=>{{assert!($c,"{}: {}",$s,error());checks.push($s.to_string());}}}
 let h=arch_product_prepare_svg(input(&source),input(&request),0.2,0.,0.001,next(&mut g));ck!(h!=0,"actual product request");let head=copy(arch_product_request_head_ptr(h),192);let revision=u64::from_le_bytes(head[16..24].try_into().unwrap());let root=arch_product_build(h,g);ck!(root!=0,"actual product build");let before=bytes(root);fs::write(out.join("source.arch"),&before).unwrap();let o=options(&before,revision);let p=prepare_wire(&o);
 let gw=geometry_wire(&o);let readback=arch_final_scene_geometry(root,input(&gw),next(&mut g));ck!(readback!=0,"native binary64 material readback");let geometry=copy(arch_final_output_ptr(readback),arch_final_output_len(readback));ck!(field(&geometry,0)==0x48435241&&field(&geometry,28)>1,"readback ARCH1 material parts");fs::write(out.join("material-union.arch"),&geometry).unwrap();arch_final_output_release(readback);
 let mut bad_revision=gw.clone();bad_revision[24..32].copy_from_slice(&99u64.to_le_bytes());bad_revision[32..40].copy_from_slice(&99u64.to_le_bytes());ck!(arch_final_scene_geometry(root,input(&bad_revision),next(&mut g))==0&&error()=="STALE_REVISION","readback immutable source revision guard");
 let legacy=arch_export_final(root,input(&o),next(&mut g));ck!(legacy==0&&error()=="INVALID_SERIALIZATION:STL_FLOAT_COLLISION","unchanged legacy collision guard");
 let mut invalid=p.clone();invalid[48]=1;let i=input(&invalid);ck!(arch_final_float_prepare(root,i,next(&mut g))==0&&unsafe{arch_input_release(i)}==0,"reserved flags rejected and consumed");
 for (at,n)in [(32,f64::NAN),(32,f64::INFINITY),(32,0.),(32,1e-12)]{let mut b=p.clone();b[at..at+8].copy_from_slice(&n.to_le_bytes());ck!(arch_final_float_prepare(root,input(&b),next(&mut g))==0,"invalid or insufficient displacement rejected");}
 let mut small=p.clone();small[40..48].copy_from_slice(&1u64.to_le_bytes());ck!(arch_final_float_prepare(root,input(&small),next(&mut g))==0&&error()=="FLOAT_CONDITIONING_WORK_LIMIT","bounded proof work");
 let j=next(&mut g);unsafe{(*arch_control_ptr().add(3)).store(j,Ordering::Release)};ck!(arch_final_float_prepare(root,input(&p),j)==0&&error()=="CANCELLED","prepare cancellation no publication");

 // Barrier starts a real cancellation observer before entering proof work.
 // No timing sleeps, no altered native callback or geometry implementation.
 let proof_generation=next(&mut g);let address=unsafe{arch_control_ptr()}as usize;
 let stop=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));let observer_stop=stop.clone();
 let barrier=std::sync::Arc::new(std::sync::Barrier::new(2));let observer_barrier=barrier.clone();
 let observer=std::thread::spawn(move||{observer_barrier.wait();while !observer_stop.load(Ordering::Acquire){unsafe{let control=address as *const AtomicU32;if (*control.add(2)).load(Ordering::Acquire)>=870&&(*control.add(1)).load(Ordering::Acquire)==1{(*control.add(3)).store(proof_generation,Ordering::Release);return true}}std::thread::yield_now();}false});
 barrier.wait();let interrupted=arch_final_float_prepare(root,input(&p),proof_generation);stop.store(true,Ordering::Release);let observed=observer.join().unwrap();ck!(observed&&interrupted==0&&error()=="CANCELLED","actual mid-proof atomic cancellation without publication");
 let proposal=arch_final_float_prepare(root,input(&p),next(&mut g));ck!(proposal!=0,"prepared default clicky");ck!(arch_final_output_len(proposal)==0,"prepare never exposes file output");
 let m:serde_json::Value=serde_json::from_slice(&copy(arch_final_float_buffer_ptr(proposal,9),arch_final_float_buffer_len(proposal,9))).unwrap();fs::write(out.join("proposal.json"),serde_json::to_vec_pretty(&m).unwrap()).unwrap();for k in 1..=8{fs::write(out.join(format!("buffer-{k}.bin")),copy(arch_final_float_buffer_ptr(proposal,k),arch_final_float_buffer_len(proposal,k))).unwrap();}
 let c=confirm_wire(&m);let mut wrong=c.clone();wrong[64]^=1;ck!(arch_final_float_confirm(proposal,input(&wrong),next(&mut g))==0&&error()=="FLOAT_CONDITIONING_APPROVAL_HASH","wrong exact approval hash");
 for at in [16,24,32,96]{let mut b=c.clone();b[at]^=1;ck!(arch_final_float_confirm(proposal,input(&b),next(&mut g))==0,"stale source/revision/settings descriptor");}
 let j=next(&mut g);unsafe{(*arch_control_ptr().add(3)).store(j,Ordering::Release)};ck!(arch_final_float_confirm(proposal,input(&c),j)==0&&error()=="CANCELLED","confirm cancellation no output");
 // Native ABI exposes read-only pointers; deliberately violating that contract
 // must still fail the hash seal before serialization, then recover on restore.
 for kind in [3,4,5,6,7,8]{let raw=arch_final_float_buffer_ptr(proposal,kind)as *mut u8;unsafe{*raw^=1;}let bad=arch_final_float_confirm(proposal,input(&c),next(&mut g));unsafe{*raw^=1;}ck!(bad==0&&error()=="FLOAT_CONDITIONING_BUFFER_CHANGED","borrowed buffer mutation fails closed");}
 let good=arch_final_float_confirm(proposal,input(&c),next(&mut g));ck!(good!=0,"explicit confirmation serializes STL");let stl=copy(arch_final_output_ptr(good),arch_final_output_len(good));fs::write(out.join("confirmed.stl"),&stl).unwrap();fs::write(out.join("confirmed.json"),copy(arch_final_output_metadata_ptr(good),arch_final_output_metadata_len(good))).unwrap();
 let repeat=arch_final_float_confirm(proposal,input(&c),next(&mut g));ck!(repeat!=0&&copy(arch_final_output_ptr(repeat),arch_final_output_len(repeat))==stl,"confirmation idempotent bytes with independent output lease");arch_final_output_release(repeat);
 ck!(bytes(root)==before,"original source bytes unchanged");ck!(unsafe{arch_snapshot_release(proposal)}==0&&arch_final_output_release(proposal)==0&&arch_final_float_release(good)==0,"cross-kind handles cannot release allocations");
 ck!(unsafe{arch_snapshot_release(root)}==1&&!unsafe{arch_snapshot_ptr(root)}.is_null(),"proposal internal reader keeps original alive");
 let after_release=arch_final_float_confirm(proposal,input(&c),next(&mut g));ck!(after_release!=0,"confirm after primary source reader release");arch_final_output_release(after_release);
 ck!(arch_final_float_release(proposal)==1&&arch_final_float_release(proposal)==0,"proposal primary release idempotence");ck!(unsafe{arch_snapshot_ptr(root)}.is_null(),"last proposal reader releases original");
 ck!(arch_final_float_confirm(proposal,input(&c),next(&mut g))==0&&error()=="FLOAT_PROPOSAL_HANDLE_INVALID","retired token rejected");ck!(copy(arch_final_output_ptr(good),arch_final_output_len(good))==stl,"finished file outlives proposal and original");arch_final_output_release(good);
 let assembly_request=fs::read(&args[4]).unwrap();let ah=arch_product_prepare_svg(input(&source),input(&assembly_request),0.2,0.,0.001,next(&mut g));ck!(ah!=0,"assembly request remains buildable");let ahead=copy(arch_product_request_head_ptr(ah),192);let ar=u64::from_le_bytes(ahead[16..24].try_into().unwrap());let assembly=arch_product_build(ah,g);ck!(assembly!=0,"assembly snapshot remains publishable");let ao=options(&bytes(assembly),ar);ck!(arch_final_float_prepare(assembly,input(&prepare_wire(&ao)),next(&mut g))==0&&error()=="ASSEMBLY_VIEW","R3 assembly authority blocks conditioning");ck!(arch_final_scene_geometry(assembly,input(&geometry_wire(&ao)),next(&mut g))==0&&error()=="ASSEMBLY_VIEW","R3 assembly authority blocks readback");unsafe{arch_snapshot_release(assembly);}
 ck!((0..5).all(|k|arch_final_test_stats(k)==0),"all root bytes/readers/outputs returned to zero");
 fs::write(out.join("result.json"),serde_json::to_vec_pretty(&serde_json::json!({"checks":checks,"count":checks.len(),"sourceSha256":hash(&before),"stlSha256":hash(&stl),"proposalHash":m["confirmation"]["proposalHash"]})).unwrap()).unwrap();println!("{} native root checks passed",checks.len());
}
