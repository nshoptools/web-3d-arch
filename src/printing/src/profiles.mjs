import {check, PrintingError, canonical, verifySealed, sealed, xmlText} from './contracts.mjs';
export const ADAPTERS=Object.freeze({
 'export.3mf.bambu-project':Object.freeze({id:'export.3mf.bambu-project',version:'0.1.0',slicer:'BambuStudio',slicerVersion:'02.08.02.60',model:'Bambu Lab P1S',extruders:1,maxSlots:4,application:'BambuStudio-02.08.02.60',namespace:'http://schemas.bambulab.com/package/2021'}),
 'export.3mf.snapmaker-project':Object.freeze({id:'export.3mf.snapmaker-project',version:'0.1.0',slicer:'SnapmakerOrca',slicerVersion:'2.2.1',model:'Snapmaker U1',extruders:4,maxSlots:4,application:'OrcaSlicer-2.2.1',namespace:'http://schemas.bambulab.com/package/2021'})
});
// This is a deliberately bounded normalization schema, not a guess from length.
// Unknown arrays can be preserved for an unchanged snapshot; resizing them is rejected.
const filamentKeys=new Set(['filament_colour','filament_type','filament_diameter','filament_density','filament_cost','filament_settings_id','filament_ids','filament_vendor','filament_soluble','filament_support','filament_map']);
const fixedKeys=new Set(['printable_area','bed_exclude_area','start_end_points','wipe_tower_x','wipe_tower_y','compatible_printers','upward_compatible_machine','different_settings_to_system','inherits_group','filament_map_mode','flush_multiplier','flush_multiplier_fast']);
const extruderKeys=new Set(['nozzle_diameter','extruder_offset']);
export function classifyArrayKey(key,adapterId) {
  if(filamentKeys.has(key))return {kind:'filament'};
  if(extruderKeys.has(key)||['min_layer_height','max_layer_height'].includes(key))return {kind:'extruder'};
  if(key==='flush_volumes_matrix')return {kind:'matrix'};
  // Source represents each filament by a load/unload pair, not physical extruders.
  if(key==='flush_volumes_vector')return {kind:'multiple',factor:2};
  if(fixedKeys.has(key)||key.startsWith('machine_max_')||key.startsWith('machine_min_'))return {kind:'fixed'};
  if(['nozzle_temperature','nozzle_temperature_initial_layer','filament_flow_ratio'].includes(key))
    return adapterId==='export.3mf.bambu-project'?{kind:'multiple',factor:2}:{kind:'filament'};
  return {kind:'fixed',opaque:true};
}
export function normalizeSettings(settings, adapterId, slotSources, originalSlots, extruders) {
  check(Array.isArray(slotSources)&&slotSources.length>0&&slotSources.every(n=>Number.isInteger(n)&&n>=0&&n<originalSlots),'SLOT_REMAP');
  const changed=slotSources.length!==originalSlots||slotSources.some((n,i)=>n!==i);
  const out=structuredClone(settings), classification={};
  for(const [k,v] of Object.entries(settings)) if(Array.isArray(v)){
    const sem=classifyArrayKey(k,adapterId);classification[k]=sem;
    if(sem.opaque){check(!changed,'UNSUPPORTED_ARRAY_NORMALIZATION',k);continue;}
    if(sem.kind==='fixed')continue;
    if(sem.kind==='extruder'){check(v.length===extruders,'EXTRUDER_ARRAY',k);continue;}
    const size=sem.kind==='matrix'?originalSlots*originalSlots:originalSlots*(sem.factor??1);
    check(v.length===size,'PROFILE_ARRAY_CARDINALITY',k);
    if(sem.kind==='matrix')out[k]=slotSources.flatMap(i=>slotSources.map(j=>v[i*originalSlots+j]));
    else {const factor=sem.factor??1;out[k]=slotSources.flatMap(i=>v.slice(i*factor,(i+1)*factor));}
  }
  return {settings:out,classification};
}
export function validateMaterials(table, profile) {
  check(table?.schemaVersion===1&&Array.isArray(table.materials)&&table.materials.length>0&&table.materials.length<=64,'MATERIAL_COUNT');
  const byId=new Map(),slots=new Map(),normalized=[],aliases={};
  for(const m of table.materials){
    check(m&&typeof m.id==='string'&&m.id.length>0&&!byId.has(m.id),'MATERIAL_ID');
    xmlText(m.id);xmlText(m.name);xmlText(m.type);
    check(/^#[0-9a-fA-F]{6}(FF)?$/.test(m.color),'MATERIAL_COLOR');
    check(Number.isInteger(m.slot)&&m.slot>=1&&m.slot<=profile.printer.slotExtruders.length,'MATERIAL_SLOT_MISMATCH',m.id);
    check(m.extruder===profile.printer.slotExtruders[m.slot-1],'MATERIAL_EXTRUDER_MISMATCH',m.id);
    check(m.type===profile.settings.filament_type?.[m.slot-1],'MATERIAL_PROFILE_MISMATCH',m.id);
    const color=m.color.slice(0,7).toUpperCase();
    const previous=slots.get(m.slot);
    check(!previous||(previous.color===color&&previous.type===m.type),'MATERIAL_SLOT_CONFLICT',m.id);
    if(!previous){const n={...m,color,index:normalized.length};slots.set(m.slot,n);normalized.push(n);}
    const index=slots.get(m.slot).index;byId.set(m.id,index);aliases[m.id]=index;
  }
  return {materials:normalized,byId,aliases};
}
export async function validateProfile(snapshot, adapterId) {
  const adapter=ADAPTERS[adapterId];check(adapter,'UNSUPPORTED_EXPORTER',adapterId);
  const p=await verifySealed(snapshot,'printerProfile');
  check(p.schemaVersion===1 && typeof p.id==='string' && p.id.length>0,'PROFILE_VERSION');
  check(p.adapterId===adapterId && p.slicer?.id===adapter.slicer && p.slicer.version===adapter.slicerVersion,'UNSUPPORTED_SLICER_VERSION');
  check(p.printer?.model===adapter.model && p.settings?.printer_model===adapter.model,'PRINTER_PROFILE_MISMATCH');
  check(p.settings.version===adapter.slicerVersion,'UNSUPPORTED_SLICER_VERSION');
  const nd=p.printer.nozzleDiametersMm;
  check(Array.isArray(nd)&&nd.length===adapter.extruders&&nd.every(n=>n===0.4),'UNSUPPORTED_NOZZLE');
  check(Array.isArray(p.settings.nozzle_diameter)&&canonical(p.settings.nozzle_diameter.map(Number))===canonical(nd),'NOZZLE_PROFILE_MISMATCH');
  const map=p.printer.slotExtruders;
  check(Array.isArray(map)&&map.length>=1&&map.length<=adapter.maxSlots&&map.every(e=>Number.isInteger(e)&&e>=1&&e<=adapter.extruders),'MATERIAL_SLOT_MISMATCH');
  if(adapter.extruders===4)check(map.length===4&&new Set(map).size===4,'U1_FOUR_HEAD_MAPPING');
  check(String(p.settings.single_extruder_multi_material)===(adapter.extruders===1?'1':'0'),'EXTRUDER_MODE_MISMATCH');
  check(Array.isArray(p.settings.filament_colour)&&p.settings.filament_colour.length===map.length,'MATERIAL_SLOT_MISMATCH');
  check(Array.isArray(p.settings.filament_type)&&p.settings.filament_type.length===map.length&&p.settings.filament_type.every(t=>typeof t==='string'&&t.length>0),'MATERIAL_PROFILE_MISMATCH');
  check(Array.isArray(p.settings.filament_diameter)&&p.settings.filament_diameter.length===map.length&&p.settings.filament_diameter.every(d=>Number.isFinite(Number(d))&&Number(d)>0&&Number(d)<=5),'FILAMENT_DIAMETER');
  for(const c of p.settings.filament_colour)check(/^#[0-9a-fA-F]{6}(FF)?$/.test(c),'MATERIAL_COLOR');
  check(p.source&&/^[a-f0-9]{64}$/.test(p.source.sha256)&&typeof p.source.id==='string','PROFILE_PROVENANCE');
  check(p.rights==='internal-testing'||p.rights==='user-provided'||p.rights==='redistributable','PROFILE_RIGHTS');
  check(Array.isArray(p.printer.bedPolygonMm)&&p.printer.bedPolygonMm.length>=3&&p.printer.bedPolygonMm.length<=128,'BED_POLYGON');
  for(const xy of p.printer.bedPolygonMm)check(Array.isArray(xy)&&xy.length===2&&xy.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000),'BED_POLYGON');
  check(Number.isFinite(p.printer.maxZMm)&&p.printer.maxZMm>0&&p.printer.maxZMm<=10000,'BED_HEIGHT');
  // Settings retain all bytes semantically. A resize requires the separate explicit recipe.
  const normalized=normalizeSettings(p.settings,adapterId,map.map((_,i)=>i),map.length,adapter.extruders);
  return {profile:p,adapter,classification:normalized.classification};
}
export async function validateSchedule(snapshot, profileSnapshot) {
  const s=await verifySealed(snapshot,'schedule');
  check(s.schemaVersion===1&&s.kind==='constant-first-regular','UNSUPPORTED_SCHEDULE');
  check(s.profileId===profileSnapshot.payload.id&&s.profileHash===profileSnapshot.sha256,'SCHEDULE_PROFILE_MISMATCH');
  for(const k of ['firstLayerHeight','layerHeight']){
    check(Number.isFinite(s[k])&&s[k]>0&&s[k]<=Math.min(...profileSnapshot.payload.printer.nozzleDiametersMm),'SCHEDULE_RANGE');
    check(['user','profile'].includes(s.origin?.[k]),'SCHEDULE_PROVENANCE');
  }
  const settings=profileSnapshot.payload.settings;
  const lo=settings.min_layer_height,hi=settings.max_layer_height;
  check(Array.isArray(lo)&&Array.isArray(hi)&&lo.length===hi.length&&lo.length===profileSnapshot.payload.printer.nozzleDiametersMm.length,'SCHEDULE_CAPABILITY');
  for(let i=0;i<lo.length;i++)check(Number.isFinite(Number(lo[i]))&&Number.isFinite(Number(hi[i]))&&Number(lo[i])>0&&Number(hi[i])>=Number(lo[i])&&s.layerHeight>=Number(lo[i])&&s.layerHeight<=Number(hi[i]),'SCHEDULE_PROFILE_RANGE');
  return s;
}
export function layerZ(n,s) {check(Number.isSafeInteger(n)&&n>=0&&n<=1000000,'LAYER_INDEX');return n===0?0:s.firstLayerHeight+(n-1)*s.layerHeight;}
export function layerInterval(n0,n1,s){check(n1>=n0,'LAYER_INTERVAL');return layerZ(n1,s)-layerZ(n0,s);}
export async function remapProfile(snapshot,slotSources) {
  const {profile:p,adapter}=await validateProfile(snapshot,snapshot.payload.adapterId);
  check(adapter.extruders!==4||slotSources.length===4,'U1_FOUR_HEAD_MAPPING');
  const {settings,classification}=normalizeSettings(p.settings,p.adapterId,slotSources,p.printer.slotExtruders.length,adapter.extruders);
  const payload={...structuredClone(p),settings,printer:{...p.printer,slotExtruders:slotSources.map(i=>p.printer.slotExtruders[i])},
    normalization:{sourceHash:snapshot.sha256,slotSources,classification}};
  const result=await sealed(payload);await validateProfile(result,p.adapterId);return result;
}
export function adapterAttachments(adapter,profile,schedule,materials,partInfo,assemblyId) {
  const settings=structuredClone(profile.settings);
  settings.initial_layer_print_height=String(schedule.firstLayerHeight);
  settings.layer_height=String(schedule.layerHeight);
  for(const m of materials)settings.filament_colour[m.slot-1]=m.color;
  // Bambu and Orca use per-volume "extruder" for FILAMENT slot (one-based).
  // U1's plate filament_maps carries the physical tool; it must not be all 1.
  const meta=(k,v)=>'<metadata key="'+xmlText(k)+'" value="'+xmlText(String(v))+'"/>';
  const parts=partInfo.map(p=>'<part id="'+p.resourceId+'" subtype="normal_part">'+meta('name',p.name)+meta('extruder',p.slot)+
    meta('matrix','1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1')+'</part>').join('');
  let plate=meta('plater_id',1)+meta('plater_name','')+meta('locked','false');
  if(adapter.extruders===4)plate+=meta('filament_map_mode','Manual')+meta('filament_maps',profile.printer.slotExtruders.join(' '));
  plate+='<model_instance>'+meta('object_id',assemblyId)+meta('instance_id',0)+meta('identify_id',1)+'</model_instance>';
  return {
    '/Metadata/project_settings.config':JSON.stringify(settings),
    '/Metadata/model_settings.config':'<?xml version="1.0" encoding="UTF-8"?><config><object id="'+assemblyId+'">'+meta('name','web-3d-arch assembly')+meta('extruder',materials[0].slot)+parts+'</object><plate>'+plate+'</plate></config>'
  };
}
