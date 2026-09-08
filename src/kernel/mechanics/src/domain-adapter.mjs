import {FIELD_MAP} from './catalog-map.mjs';
export const MECHANICS_SEMANTICS_VERSION=3;
export const SOURCE_HEIGHT_SEMANTICS_VERSION=2;
const PRODUCT_IDS=['keychain','clicky','strap','lego','charm'];
const fieldById=new Map(FIELD_MAP.map(f=>[f.id,f]));
const origins={auto:0,user:1,profile:2};
// The IDs name actual local manufacturing faces, resolved geometrically again
// in the C++ executor. A caller may use bed only when the face really is Z=0.
export const DATUMS=Object.freeze({
  'source:body.bottom':1,'mech:cap:plate.underside':2,'mech:mx:post.tip':3,
  'mech:mx:collar.bottom':4,'mech:tray:floor.top':5,'mech:tray:pin-pocket.top':6,
  'mech:tray:body-pocket.top':7,'mech:charm:flange.top':8,'mech:charm:neck.top':9,
  'source:attachment.bottom':10,'mech:cap:skirt.bottom':11,
  'source:art.bottom':128,'source:rim.bottom':129,'source:flat.bottom':130,
  'source:recess.top':131,'source:core-cap.top':132,'source:text.bottom':133,
  'source:text-base.bottom':134,
});
export class MechanicsContractError extends Error {constructor(code,field){super(`${code}${field?': '+field:''}`);this.code=code;this.field=field;}}
const requireValue=(condition,code,field)=>{if(!condition)throw new MechanicsContractError(code,field);};
const nm=v=>{requireValue(Number.isFinite(v),'NONFINITE');const scaled=v*1e6;const rounded=Math.round(scaled);requireValue(Math.abs(scaled-rounded)<1e-5&&Number.isSafeInteger(rounded),'NON_GRID_SCHEDULE');return BigInt(rounded);};

/** Dependency injection keeps the candidate self-contained and avoids a second
 * domain schema. Pass src/domain/index.mjs (already integrated in main).
 * Output is typed metadata/parameter buffers; the source geometry remains owned
 * by the parent. This function never changes a project or applies a proposal.
 */
export function createMechanicsDomainAdapter(domain){
  requireValue(typeof domain.validateProject==='function'&&typeof domain.effectiveEntries==='function','DOMAIN_API');
  return function encode(project,{matingToleranceMm=.001,exportToleranceMm=.004}={}){
    const p=domain.validateProject(project),entries=domain.effectiveEntries(p),provenance=[];
    const sourceRef=record=>{provenance.push(Object.freeze(record));return BigInt(provenance.length);};
    sourceRef({kind:'catalog',...p.provenance});
    const records=[],inactive=[],delegated=[];
    for(const [id,entry] of Object.entries(entries)){
      const f=fieldById.get(id);requireValue(f,'UNKNOWN_PARAMETER',id);
      const schema=domain.getField(id);
      if(schema.lifecycle==='migration-only'){inactive.push({id,value:entry.value,origin:entry.origin,reason:'migration-only'});continue;}
      const r={fieldId:f.abiId,mode:0,origin:origins[entry.origin],datum:0,referenceLayer:0,layerCount:0,value:0,provenanceId:sourceRef({kind:'parameter',id,origin:entry.origin,value:entry.value,catalogVersion:p.provenance.catalogVersion??'1.0.1',product:p.product})};
      requireValue(r.origin!==undefined,'PARAMETER_ORIGIN',id);
      if(schema.type==='height'){
        const value=entry.value;
        if(value.heightMode==='auto'){requireValue(id==='ringH'&&value.mode==='body-height','AUTO_MODE',id);r.mode=3;}
        else if(value.heightMode==='mm'){r.mode=1;r.value=value.mm;
          if(value.datum){r.referenceLayer=value.referenceLayer;r.datum=value.datum.kind==='bed'?0:DATUMS[value.datum.featureId];requireValue(r.datum!==undefined,'ORPHAN_DATUM',id);}
        }
        else {
          requireValue(value.heightMode==='layers','HEIGHT_MODE',id);r.mode=2;r.layerCount=value.layers;r.referenceLayer=value.referenceLayer;
          r.datum=value.datum.kind==='bed'?0:DATUMS[value.datum.featureId];requireValue(r.datum!==undefined,'ORPHAN_DATUM',id);
        }
      }else if(schema.type==='tolerance'){
        if(entry.value.mode==='unselected'){inactive.push({id,value:entry.value,origin:entry.origin,reason:'engine request provides an explicit tolerance; legacy value was not mapped'});continue;}
        requireValue(id==='strapTolerance','PARENT_MESH_EXECUTOR_REQUIRED',id);
        requireValue(entry.value.capabilityId==='circle-inscribed-equal-angle'&&entry.value.capabilityVersion==='1','TOLERANCE_CONVENTION_VERSION',id);
        // Domain v1's migrated bound is inward-inscribed. Mechanics bore v1 is
        // circumscribed. Reusing that number as a different convention is forbidden.
        throw new MechanicsContractError('STRAP_TOLERANCE_CONVENTION_REQUIRES_EXPLICIT_MIGRATION',id);
      }else if(schema.type==='enum'){r.value=f.enum?.indexOf(entry.value);requireValue(r.value>=0,'ENUM_VALUE',id);}
      else if(schema.type==='boolean')r.value=entry.value?1:0;
      else r.value=entry.value;
      if(id==='legoRanhZ'&&entry.origin==='auto'&&entry.value===0)r.mode=4;
      requireValue(Number.isFinite(r.value),'NONFINITE',id);
      records.push(Object.freeze(r));if(f.sourceBinding)delegated.push(Object.freeze({...r}));
    }
    requireValue(matingToleranceMm>=.000001&&matingToleranceMm<=.001,'MATING_TOLERANCE');
    requireValue(exportToleranceMm>=.000001&&exportToleranceMm<=.004,'EXPORT_TOLERANCE');
    const parameterBytes=new Uint8Array(records.length*40),view=new DataView(parameterBytes.buffer);
    records.forEach((r,i)=>{const o=i*40;[r.fieldId,r.mode,r.origin,r.datum,r.referenceLayer,r.layerCount].forEach((x,j)=>view.setUint32(o+4*j,x,true));view.setFloat64(o+24,r.value,true);view.setBigUint64(o+32,r.provenanceId,true);});
    const schedule=Object.freeze({version:1,firstSource:p.schedule.sources.firstLayerHeight==='profile'?1:0,regularSource:p.schedule.sources.layerHeight==='profile'?1:0,
      firstNm:nm(p.schedule.firstLayerHeight),regularNm:nm(p.schedule.layerHeight),provenanceId:sourceRef({kind:'schedule',...p.schedule})});
    return Object.freeze({abiVersion:2,mechanicsSemanticsVersion:MECHANICS_SEMANTICS_VERSION,sourceHeightSemanticsVersion:SOURCE_HEIGHT_SEMANTICS_VERSION,product:PRODUCT_IDS.indexOf(p.product),revision:p.revision,schedule,records:Object.freeze(records),parameterBytes,sourceRecipeBindings:Object.freeze(delegated),
      provenance:Object.freeze(provenance),inactive:Object.freeze(inactive),matingToleranceMm,exportToleranceMm,fitQualification:'unqualified',requiresSourceContext:true});
  };
}

/** Build the domain's existing atomic command; caller previews/commits it using
 * revision/hash checks after the user accepts the native proposal. */
export function proposalCommand(proposals){
  requireValue(Array.isArray(proposals)&&proposals.length>0,'NO_PROPOSAL');
  return {id:'parameters.set',args:{changes:proposals.map(p=>{
    requireValue(p.applicable===1||p.applicable===true,'PROPOSAL_EXCEEDS_DOMAIN',p.field);
    requireValue(fieldById.has(p.field)&&Number.isFinite(p.after),'PROPOSAL_FIELD',p.field);
    return {id:p.field,value:p.mode===1?{heightMode:'mm',mm:p.after}:p.after};
  })}};
}
