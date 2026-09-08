import { FIELD_SCHEMA, PRODUCT_IDS, SOURCE_KINDS, RELATIONAL_CONSTRAINTS, getField, assertProduct, candidateDefault, normalizeField, fieldAvailability } from './schema.mjs';
import { CATALOG } from './catalog.mjs';
import { createSchedule, validateSchedule, heightMm } from './layers.mjs';
import { check, cloneData, deepFreeze, onlyKeys, assertRecord } from './safe.mjs';
export const PROJECT_KIND = 'web-3d-arch.project-domain';
export const PROJECT_VERSION = 1;
const active = FIELD_SCHEMA.filter(f=>f.lifecycle==='active'&&f.scope!=='schedule');
function makeEntry(field,product,schedule) {
  return {origin:'auto',value:normalizeField(field.id,candidateDefault(field.id,product),{schedule})};
}
export function createProject(options={}) {
  options=cloneData(options);
  onlyKeys(options,['product','schedule','sourceKind','content'],[]);
  const product=assertProduct(options.product??'keychain');
  const schedule=options.schedule ? validateSchedule(options.schedule) : createSchedule();
  const parameters={common:{},byProduct:Object.fromEntries(PRODUCT_IDS.map(p=>[p,{}]))};
  for(const f of active){
    if(f.scope==='common')parameters.common[f.id]=makeEntry(f,product,schedule);
    else for(const p of f.applicability.products)parameters.byProduct[p][f.id]=makeEntry(f,p,schedule);
  }
  return validateProject({kind:PROJECT_KIND,schemaVersion:PROJECT_VERSION,revision:0,product,
    sourceKind:options.sourceKind??'none',schedule,parameters,content:options.content??{},
    provenance:{catalogId:CATALOG.catalogId,catalogVersion:CATALOG.catalogVersion,modeDefaults:CATALOG.modeDefaults}});
}
/** Returns effective data including inactive/dependency-gated values. Call availability to decide participation. */
export function effectiveEntries(project,product=project.product) {
  assertProduct(product);
  return {...project.parameters.common,...project.parameters.byProduct[product],
    layerH:{origin:project.schedule.sources.layerHeight,value:project.schedule.layerHeight}};
}
export function effectiveValues(project,product=project.product) {
  return Object.fromEntries(Object.entries(effectiveEntries(project,product)).map(([id,entry])=>[id,entry.value]));
}
export function resolveFieldMm(project,id) {
  const f=getField(id),values=effectiveValues(project),value=values[id];
  check(value!==undefined,'inapplicable-field','Field is unavailable for this product.',{id});
  if(f.type!=='height')return value;
  if(value.heightMode==='auto'){
    check(id==='ringH'&&value.mode==='body-height'&&values.baseH,'unresolved-auto','Auto height lacks its declared dependency.');
    return heightMm(values.baseH,project.schedule);
  }
  return heightMm(value,project.schedule);
}
export function constraintIssues(project) {
  const values=effectiveValues(project),issues=[];
  const has=id=>Object.hasOwn(values,id)&&fieldAvailability(id,{product:project.product,sourceKind:project.sourceKind,values}).applicable;
  for(const constraint of RELATIONAL_CONSTRAINTS){
    if(!constraint.fields.every(has))continue;
    const [left,right]=constraint.fields.map(id=>resolveFieldMm(project,id));
    const valid=constraint.operator==='gt'?left>right:left>=right;
    if(!valid)issues.push({code:constraint.code,constraintId:constraint.id,fields:constraint.fields,message:constraint.message});
  }
  return issues;
}
export function validateProject(input) {
  const p=cloneData(input);
  onlyKeys(p,['kind','schemaVersion','revision','product','sourceKind','schedule','parameters','content','provenance']);
  check(p.kind===PROJECT_KIND&&p.schemaVersion===PROJECT_VERSION,'unsupported-project-version','Unknown project format/version must be kept read-only.');
  check(Number.isSafeInteger(p.revision)&&p.revision>=0&&p.revision<Number.MAX_SAFE_INTEGER,'revision','Invalid project revision.');
  assertProduct(p.product);
  check(SOURCE_KINDS.includes(p.sourceKind),'source-kind','Unknown source kind.');
  p.schedule=validateSchedule(p.schedule); assertRecord(p.content); assertRecord(p.provenance);
  onlyKeys(p.parameters,['common','byProduct']); onlyKeys(p.parameters.byProduct,PRODUCT_IDS);
  function validateEntries(entries,fields,product){
    onlyKeys(entries,fields.map(f=>f.id));
    for(const f of fields){
      const entry=entries[f.id]; onlyKeys(entry,['origin','value']);
      check(['auto','user'].includes(entry.origin),'parameter-origin','Parameter origin must be auto or user.',{id:f.id,product});
      entry.value=normalizeField(f.id,entry.value,{schedule:p.schedule});
    }
  }
  validateEntries(p.parameters.common,active.filter(f=>f.scope==='common'),p.product);
  for(const product of PRODUCT_IDS)
    validateEntries(p.parameters.byProduct[product],active.filter(f=>f.scope==='product'&&f.applicability.products.includes(product)),product);
  const issues=constraintIssues(p);
  check(issues.length===0,'parameter-conflict','Nominal parameter relationships conflict.',{issues});
  return deepFreeze(p);
}
export function switchProductDraft(project,targetProduct) {
  assertProduct(targetProduct);
  const next=cloneData(project); next.product=targetProduct;
  // Shared user entries retain their values. Product-specific entries remain owned by their product.
  for(const f of active){
    const entries=f.scope==='common'?next.parameters.common:next.parameters.byProduct[targetProduct];
    if(!f.applicability.products.includes(targetProduct))continue;
    const entry=entries[f.id];
    if(!entry||entry.origin==='auto')entries[f.id]=makeEntry(f,targetProduct,next.schedule);
  }
  return next;
}
