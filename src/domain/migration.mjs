import { CATALOG } from './catalog.mjs';
import { getField, normalizeField, assertProduct } from './schema.mjs';
import { check, cloneData, deepFreeze, parseJsonStrict, errorRecord } from './safe.mjs';
import { parseDecimal, decimalUnits, unitsDecimal, isOnGrid } from './decimal.mjs';
import { validateSchedule } from './layers.mjs';
import { sha256 } from './hash.mjs';
import { exactJsonNumber } from './json-number.mjs';
// Rational arithmetic: alternating cosine series bounds, not a floating-point precision claim.
const gcd = (a,b) => { a=a<0n?-a:a; b=b<0n?-b:b; while(b){const r=a%b;a=b;b=r;} return a; };
const rat = (n,d=1n) => { const g=gcd(n,d); return {n:n/g,d:d/g}; };
const mul = (a,b) => rat(a.n*b.n,a.d*b.d);
const add = (a,b) => rat(a.n*b.d+b.n*a.d,a.d*b.d);
const negate = a => ({n:-a.n,d:a.d});
function sagittaSeries(x, terms) {
  const x2=mul(x,x); let term=rat(1n), sum=rat(0n);
  for(let k=1;k<=terms;k++){
    term=mul(term,rat(x2.n,x2.d*BigInt((2*k-1)*(2*k))));
    sum=add(sum,k%2===1 ? term : negate(term));
  }
  return sum;
}
/** Bounds ONLY an inscribed regular full-circle polygon at the supplied radius.
 * No inference about the historical generator, transformed ellipse, chamfer or slot. */
export function circularTessellationBound(diameterMm, segments) {
  const d=decimalUnits(diameterMm);
  check(d>0n,'diameter-required','Circle diameter must be positive.');
  check(Number.isSafeInteger(segments) && segments>=6 && segments<=1000000,'segment-domain','Bound supports 6–1,000,000 equal-angle segments.');
  // Strict decimal enclosure of pi; exact rational operations preserve the enclosure.
  const piLower=3141592653589793238462643383279502884n, piDen=10n**36n;
  const lower=mul(rat(d,2n),sagittaSeries(rat(piLower,piDen*BigInt(segments)),8));
  const upper=mul(rat(d,2n),sagittaSeries(rat(piLower+1n,piDen*BigInt(segments)),7));
  const lowerUnits=lower.n/lower.d;
  const upperUnits=(upper.n+upper.d-1n)/upper.d;
  return deepFreeze({convention:'circle-inscribed-equal-angle',conventionVersion:'1',
    diameterMm:parseDecimal(diameterMm).value,segments,lowerMm:unitsDecimal(lowerUnits),upperMm:unitsDecimal(upperUnits),
    deviationSign:'inward',quantization:'outward enclosure to 0.000001 mm',geometryVerified:false,
    exclusions:['historical-generator-convention','nonuniform-scale','slot','chamfer','mesh-topology','manufactured-fit']});
}
function legacyValue(id,input) {
  const field=CATALOG.fields.find(f=>f.id===id);
  check(field,'unknown-field','Unknown legacy parameter ID.',{id});
  if(field.kieu==='c'){check(typeof input==='boolean','boolean-required','Expected a boolean.',{id});return input;}
  if(field.kieu==='s'){check(field.mien.includes(input),'enum-domain','Unknown legacy enum.',{id});return input;}
  const value=parseDecimal(input).value;
  check(value>=field.mien[0]&&value<=field.mien[1],'field-domain','Legacy value outside candidate domain.',{id});
  // Candidate steps are provenance for dimensions; integer controls retain an actual grid.
  if(field.donVi!=='mm'&&field.donVi!=='°'&&field.donVi!=='%')
    check(isOnGrid(value,field.mien[0],field.buoc),'field-grid','Legacy count is off its discrete grid.',{id});
  return value;
}
export function previewStrapMigration(segments, {diameterMm,confirmedConvention=null} = {}) {
  segments=legacyValue('strapSeg',segments); legacyValue('strapD',diameterMm);
  const bound=circularTessellationBound(diameterMm,segments);
  const conventionConfirmed=confirmedConvention==='circle-inscribed-equal-angle';
  return deepFreeze({legacy:{id:'strapSeg',value:segments,unit:'segments'},targetId:'strapTolerance',
    bound,proposedValue:conventionConfirmed ? {mode:'selected',maxDeviationMm:bound.upperMm,capabilityId:bound.convention,capabilityVersion:'1'} : null,
    requiresAcceptance:true,blockers:conventionConfirmed ? [] : ['Historical tessellation convention must be established; count alone is insufficient.'],
    budgets:{exportMm:0.004,matingMm:0.001,withinExportTarget:bound.upperMm<=0.004,withinMatingTarget:bound.upperMm<=0.001},
    numericIdentity:false,geometryVerified:false,fit:'unverified'});
}
/** Dry run, never mutates a project or auto-commits a migration.
 * Unknown versions/fields retain original JSON byte-for-byte (as JS text).
 */
export function planLegacyMigration(raw,schedule) {
  check(typeof raw==='string','json-required','Migration accepts original JSON text for lossless provenance.');
  let input;
  try { input=parseJsonStrict(raw); }
  catch(error){return deepFreeze({status:'blocked',raw,issues:[errorRecord(error)],geometryVerified:false});}
  if(input?.catalogVersion!==CATALOG.catalogVersion)
    return deepFreeze({status:'read-only',raw,reason:'unknown-catalog-version',geometryVerified:false});
  try {
    input=cloneData(parseJsonStrict(raw,exactJsonNumber)); assertProduct(input.product); schedule=validateSchedule(schedule);
    check(input.values&&typeof input.values==='object'&&!Array.isArray(input.values),'values-required','Expected legacy values record.');
    const rows=[],proposedValues={},issues=[];
    for(const [id,rawValue] of Object.entries(input.values)){
      try {
        const field=getField(id),value=legacyValue(id,rawValue);
        if(id==='impVox'){
          rows.push({id,disposition:'replace-capability',targetId:'meshJoinTolerance',legacyValue:value,legacyUnit:'mm',proposedValue:{mode:'unselected'},
            numericMapping:'none',requiresSelection:true,reason:'Voxel cell size is not a mesh surface-error bound.'});
          proposedValues.meshJoinTolerance={mode:'unselected'};
        }else if(id==='strapSeg'){
          const diameter=input.values.strapD;
          rows.push({id,disposition:'replace-capability',targetId:'strapTolerance',legacyValue:value,proposedValue:{mode:'unselected'},numericMapping:'none',
            preview:diameter===undefined ? null : previewStrapMigration(value,{diameterMm:diameter}),
            requiresSelection:true,reason:'Radius and tessellation convention are required, then an accepted bounded tolerance.'});
          proposedValues.strapTolerance={mode:'unselected'};
        }else if(id==='layerH'){
          rows.push({id,disposition:'keep-mm',targetId:'schedule.layerHeight',legacyValue:value,
            proposedValue:parseDecimal(value).value,requiresAcceptance:true,reason:'No legacy first-layer value exists. Supplied snapshot schedule stays authoritative until explicitly changed.'});
        }else{
          const next=field.type==='height' ? id==='ringH'&&value===0 ? {heightMode:'auto',mode:'body-height'} : {heightMode:'mm',mm:value} : value;
          proposedValues[id]=normalizeField(id,next,{schedule});
          rows.push({id,disposition:field.disposition.kind,legacyValue:rawValue,proposedValue:proposedValues[id],
            requiresAcceptance:true,reason:field.semanticScope,blockers:field.blockers});
        }
      }catch(error){
        issues.push({id,...errorRecord(error)});
        rows.push({id,disposition:'retained-unresolved',legacyValue:rawValue,requiresSelection:true});
      }
    }
    const extraKeys=Object.keys(input).filter(k=>!['catalogVersion','product','values'].includes(k));
    if(extraKeys.length)issues.push({code:'unknown-envelope-properties',keys:extraKeys,reason:'Original document is retained; no unknown data is discarded.'});
    return deepFreeze({status:issues.length ? 'blocked' : 'preview',source:{raw,sha256:sha256(raw),catalogVersion:input.catalogVersion},
      product:input.product,schedule,rows,proposedValues,issues,requiresAcceptance:true,geometryVerified:false,fit:'unverified'});
  }catch(error){return deepFreeze({status:'blocked',raw,issues:[errorRecord(error)],geometryVerified:false});}
}
