import { CATALOG } from './catalog.mjs';
import { check, assertKey, cloneData, deepFreeze, onlyKeys } from './safe.mjs';
import { parseDecimal, decimalUnits, unitsDecimal, isOnGrid } from './decimal.mjs';
import { normalizeHeight, heightMm, validateSchedule } from './layers.mjs';
export const SCHEMA_VERSION = 1;
export const PRODUCT_IDS = deepFreeze(Object.keys(CATALOG.productIds));
export const SOURCE_KINDS = deepFreeze(['none','raster','svg','emoji','text','mesh']);
export const GROUPS = deepFreeze([
  ['color','Màu & chi tiết'],['shape','Kích thước & dáng'],['height','Chiều cao'],
  ['keyring','Lỗ móc khoá'],['brick','Ngàm Lego'],['charm','Charm dép'],
  ['strap','Lỗ luồn dây đeo'],['cap','Thân clicky'],['stem','Trụ cắm MX'],
  ['tray','Khay lắp switch'],['imported_mesh','Khối nhập thêm']
].map(([id,label])=>({id,label})));
const groupIds = new Map(GROUPS.map(g=>[g.label,g.id]));
// One explicit semantic decision per catalog ID. Z means eligible for EXPLICIT layer conversion.
// C means coordinate/difference retained in mm and never snapped. U means unresolved control semantics.
const semanticRows = `
k|count|Target material/color count; segmentation and profile slot capacity are separate.|segmentation-palette
res|enum|Raster processing resolution in pixels; never mechanical precision.|
smooth|index|Raster region smoothing candidate strength index.|smoothing-definition
minA|index|Small raster region merge candidate threshold; area unit not established.|area-threshold-unit
denoise|index|Raster denoise candidate strength index.|denoise-definition
eps|index|Contour simplification candidate index; not a physical tolerance.|contour-tolerance-map
tension|index|Curve smoothing candidate index; not a curvature guarantee.|curve-tension-map
size|length|Long edge of source-derived design in mm, before required fit adjustments.|source-bounds
outline|enum|Base footprint construction family.|footprint-geometry
cornerR|length|Rounded-frame XY corner radius in mm.|corner-bounds
offset|length|Outward footprint offset distance in mm.|offset-topology
weld|length|Candidate bridging distance for disconnected features in mm.|bridge-definition
minFeature|length|Minimum retained source feature width in mm.|feature-measure
fillHoles|boolean|Fill base interior holes; does not discard original source holes.|base-hole-scope
topBevel|boolean|Enable top bevel default on generated blocks.|bevel-geometry
topBevelR|length|Physical top edge radius/chamfer size; not layer count.|bevel-shape-metric
topBevelShape|enum|Round/chamfer45/stepped bevel family.|bevel-shape-contract
bevelGop|boolean|Union eligible disconnected regions before bevel.|bevel-union-scope
bevelChu|boolean|Apply bevel to text strokes and text base.|text-bevel-support
topBevelSeg|count|Integer number of visible bevel steps, not mesh precision.|step-datum
layerH|schedule|Regular layer height alias into the authoritative project schedule.|
layerStep|count|Quick increment in layer counts; UI preference without geometric effect.|
baseH|Z|Body/base nominal thickness; layer conversion requires an explicit lower surface datum.|body-datum
plateT|Z|Keycap top plate thickness measured from its lower surface.|cap-plate-datum
artMode|enum|Raised/recessed/flat1/flat2 artwork composition family.|art-mode-formulas
flatTop|Z|Upper color thickness in flat artwork modes.|flat-color-datum
artH|Z|Artwork relief height or recess depth; mode selects sign and reference surface.|art-relief-datum
rimOn|boolean|Enable distinct colored support under artwork.|rim-scope
rimH|Z|Colored artwork support thickness, separate from body thickness.|rim-datum
splitObj|boolean|Enable individual artwork object heights in raised mode.|object-height-schema
layerBand|boolean|Use height bands for material allocation.|band-region-mapping
bandCore|boolean|Use base material for eligible inner core volume.|core-material-partition
bandCap|Z|Thickness of upper color over a base-material core.|core-cap-datum
ringOn|boolean|Enable the keychain eyelet.|
ringOuterD|length|Nominal eyelet outside diameter; must exceed bore diameter.|eyelet-strength
ringInnerD|length|Nominal eyelet bore diameter.|eyelet-fit
ringTren|enum|Attach eyelet to image or text semantic host.|eyelet-host-resolution
ringAngle|angle|Eyelet position angle in degrees around chosen host.|eyelet-angle-frame
ringOverlap|length|Eyelet/body overlap distance in mm.|eyelet-contact
ringH|Z|Eyelet thickness; explicit auto body-height enum replaces legacy numeric zero.|eyelet-datum
legoOn|boolean|Enable bottom connector bores.|
legoPitch|length|Nominal center-to-center connector grid pitch.|hardware-fit
legoHoleD|length|Nominal bore diameter before separately specified clearance.|hardware-fit
legoHoleH|Z|Nominal bore depth from bore opening face; not implicitly nine layers.|bore-datum
legoThua|enum|Full/checkerboard/quarter grid mask.|grid-mask-phase
legoHoDu|length|Positive extra clearance in sparse-grid mode; side/diameter convention pending.|clearance-convention
legoWall|length|Nominal lateral wall thickness around bores.|bore-wall-topology
legoRong|boolean|Hollow base while retaining walls around bores.|hollow-roof
legoOffX|length|Grid translation on design X in mm.|grid-frame
legoOffY|length|Grid translation on design Y in mm.|grid-frame
legoXeOn|boolean|Enable cross-shaped flexure cuts around bores.|flexure-fatigue
legoXeW|length|Cross-cut width in mm.|flexure-fatigue
legoTaiOn|boolean|Enable breakaway alignment tabs.|tab-strength
legoTaiW|length|Tab width in mm.|
legoTaiL|length|Tab length in mm.|
legoTaiCo|length|Breakaway neck width; must not exceed tab width.|tab-strength
legoRanhOn|boolean|Enable semicircular perimeter groove.|groove-geometry
legoRanhR|length|Groove circle radius in mm.|groove-clearance
legoRanhZ|C|Groove center coordinate; legacy zero has no proven auto meaning.|groove-datum-zero
charmGan|enum|Separate or integral retaining button assembly.|charm-assembly
charmCoD|length|Nominal neck diameter through sandal hole.|hardware-fit
charmCoH|Z|Nominal neck height matching strap thickness; retain mm.|charm-neck-datum
charmVanhD|length|Nominal retaining flange diameter; exceeds neck diameter.|hardware-fit
charmVanhH|Z|Nominal retaining flange thickness; retain mm.|charm-flange-datum
charmVat|length|Lead-in bevel distance at retaining flange.|charm-bevel-metric
charmChotD|length|Nominal separate-button mating pin diameter.|hardware-fit
charmChotH|Z|Nominal insertion depth of separate pin/socket pair.|charm-pin-datum
charmClr|length|Positive socket-pin clearance; radial/diametral convention pending.|clearance-convention
charmRap|boolean|Assembly view preference; does not change manufacturing geometry.|
charmOffX|length|Button displacement in design X in mm.|button-frame
charmOffY|length|Button displacement in design Y in mm.|button-frame
strapD|length|Nominal circular hole diameter, used in explicit tessellation-bound migration.|hardware-fit
strapAngle|angle|Tube direction angle in degrees; frame must be resolved.|tube-angle-frame
strapZ|C|Tube center coordinate in mm; never layer-snapped.|tube-center-datum
strapOff|length|Signed displacement of hole from design center.|tube-offset-axis
strapSlot|length|Additional slot extension; zero means circular, never auto.|slot-length-convention
strapSlotDir|enum|Slot extension direction on design axes.|slot-frame
strapCham|length|Hole entry chamfer distance; zero disables bevel.|tube-bevel-metric
strapSeg|replacement|Legacy segment count retained as provenance; migrate only with declared circular tessellation convention.|tessellation-convention
rotObj|angle|Whole design rotation in degrees.|object-rotation-frame
skirtH|Z|Nominal cap skirt height; zero meaning unresolved, preserved without claiming auto.|skirt-zero-semantics
wallT|length|Nominal keycap side-wall thickness.|wall-topology
rib|length|Nominal reinforcement rib thickness; zero disables ribs.|rib-topology
crossL|length|Nominal MX cross branch length.|hardware-fit
crossW|length|Nominal MX cross branch width.|hardware-fit
clr|length|Positive MX cavity enlargement; one-sided versus total-width convention pending.|clearance-convention
socketD|Z|Nominal MX socket depth 5.50 mm; no implicit layer conversion.|socket-datum
postH|Z|Nominal MX post height 7.00 mm.|post-datum
postD1|length|Nominal main post diameter.|hardware-fit
postD2|length|Nominal collar diameter at cap.|
collarH|Z|Nominal collar height 1.85 mm; retain fractional layer amount.|collar-datum
stemH|Z|Nominal switch stem projection above switch top plane.|switch-top-datum
linkBody|boolean|Auto material sharing for body/skirt/post/ribs; preserve user role overrides.|role-material-schema
housing|boolean|Include a separately printable switch tray.|
autoSize|boolean|Permit a proposed atomic fit adjustment; not an automatic scalar setter.|fit-adjustment-command
plateHole|length|Nominal switch-body cavity width 14.05 mm.|hardware-fit
hSocketD|Z|Nominal body-cavity depth measured from opening.|tray-socket-datum
hMouth|length|Tray cavity mouth width supporting switch shoulder.|hardware-fit
hRecess|Z|Nominal switch recess depth from tray reference plane.|tray-recess-datum
pinW|length|Nominal switch-pin cavity width.|hardware-fit
pinD|Z|Nominal switch-pin cavity depth 1.7 mm, retained exactly.|tray-pin-datum
hFloor|Z|Nominal closed tray floor thickness.|tray-floor-datum
hWall|length|Nominal outer tray wall thickness.|
hBossW|length|Nominal wall thickness around switch cavity.|
gap|length|Positive cap-to-tray wall gap; side/total convention pending.|clearance-convention
rimOver|C|Signed wall-top difference relative to cap top in mm; zero is coplanar.|wall-top-datum
travel|length|Nominal physical switch travel, never quantized to print layers.|hardware-fit
hStopOn|boolean|Enable end-of-travel anti-tilt ledge.|travel-stop-interaction
hStopW|length|Stop ledge width in mm.|travel-stop-interaction
hRingOn|boolean|Enable hanging eyelet on tray.|
hRingH|Z|Nominal tray eyelet height; explicit datum pending.|tray-eyelet-datum
hRingOuterD|length|Tray eyelet outside diameter; must exceed bore.|
hRingInnerD|length|Tray eyelet bore diameter.|eyelet-fit
hRingAngle|angle|Tray eyelet angle around tray host.|tray-eyelet-frame
hRingOverlap|length|Tray eyelet overlap distance into rim.|tray-eyelet-contact
assemble|boolean|Keycap/tray assembly view preference; no manufacturing transform.|
impOn|boolean|Enable imported STL/OBJ feature on all five products.|mesh-input-oracle
impOp|enum|Separate part / union / subtract feature on mesh-scene branch.|mesh-csg
impScale|ratio|Uniform scale percentage applied to declared source units.|mesh-transform-units
impX|length|Imported part X translation in mm; preserve original bytes.|mesh-transform-bounds
impY|length|Imported part Y translation in mm; preserve original bytes.|mesh-transform-bounds
impZ|C|Imported mesh Z translation in mm; never snap vertices to layers.|mesh-transform-bounds
impRX|angle|Imported mesh rotation around X, in degrees.|mesh-transform-order
impRY|angle|Imported mesh rotation around Y, in degrees.|mesh-transform-order
impRZ|angle|Imported mesh rotation around Z, in degrees.|mesh-transform-order
impVox|replacement|Retired voxel cell size, replaced by a separately selected mesh error-bound capability.|mesh-tolerance-definition
`.trim().split('\n').map(line=>line.split('|'));
const semantics = new Map(semanticRows.map(([id,category,meaning,blocker])=>[id,{category,meaning,blocker}]));
check(semantics.size === 126, 'schema-coverage', 'Semantic decisions must cover exactly 126 unique fields.');
const deps = new Map();
function requireValues(ids, conditions) { for (const id of ids.split(' ')) deps.set(id,conditions); }
requireValues('cornerR', [{id:'outline',oneOf:['round']}]);
requireValues('topBevelR topBevelShape bevelGop bevelChu', [{id:'topBevel',equals:true}]);
requireValues('topBevelSeg', [{id:'topBevel',equals:true},{id:'topBevelShape',oneOf:['bac']}]);
requireValues('flatTop', [{id:'artMode',oneOf:['phang','phang2']}]);
requireValues('artH', [{id:'artMode',oneOf:['noi','chim']}]);
requireValues('splitObj', [{id:'artMode',oneOf:['noi']}]);
requireValues('rimH', [{id:'rimOn',equals:true}]);
requireValues('bandCore', [{id:'layerBand',equals:true}]);
requireValues('bandCap', [{id:'layerBand',equals:true},{id:'bandCore',equals:true}]);
requireValues('ringOuterD ringInnerD ringTren ringAngle ringOverlap ringH', [{id:'ringOn',equals:true}]);
requireValues('legoPitch legoHoleD legoHoleH legoThua legoWall legoRong legoOffX legoOffY legoXeOn legoTaiOn legoRanhOn', [{id:'legoOn',equals:true}]);
requireValues('legoHoDu', [{id:'legoOn',equals:true},{id:'legoThua',oneOf:['nua','tu']}]);
requireValues('legoXeW', [{id:'legoOn',equals:true},{id:'legoXeOn',equals:true}]);
requireValues('legoTaiW legoTaiL legoTaiCo', [{id:'legoOn',equals:true},{id:'legoTaiOn',equals:true}]);
requireValues('legoRanhR legoRanhZ', [{id:'legoOn',equals:true},{id:'legoRanhOn',equals:true}]);
requireValues('charmChotD charmChotH charmClr charmRap', [{id:'charmGan',oneOf:['roi']}]);
requireValues('strapSlotDir', [{id:'strapSlot',greaterThan:0}]);
requireValues('autoSize plateHole hSocketD hMouth hRecess pinW pinD hFloor hWall hBossW gap rimOver travel hStopOn hRingOn assemble', [{id:'housing',equals:true}]);
requireValues('hStopW', [{id:'housing',equals:true},{id:'hStopOn',equals:true}]);
requireValues('hRingH hRingOuterD hRingInnerD hRingAngle hRingOverlap', [{id:'housing',equals:true},{id:'hRingOn',equals:true}]);
requireValues('impOp impScale impX impY impZ impRX impRY impRZ', [{id:'impOn',equals:true}]);
requireValues('meshJoinTolerance', [{id:'impOn',equals:true},{id:'impOp',oneOf:['han','tru']}]);
const uiOnly = new Set(['layerStep','charmRap','assemble']);
const sourceOnly = {
  res:['raster'], smooth:['raster'], minA:['raster'], denoise:['raster'],
  eps:['raster','svg','emoji','text'], tension:['raster','svg','emoji','text']
};
export const RELATIONAL_CONSTRAINTS = deepFreeze([
  {id:'eyelet-positive-wall',code:'positive-wall-required',fields:['ringOuterD','ringInnerD'],operator:'gt',message:'Eyelet outside diameter must exceed the bore.'},
  {id:'tray-eyelet-positive-wall',code:'positive-wall-required',fields:['hRingOuterD','hRingInnerD'],operator:'gt',message:'Tray eyelet outside diameter must exceed the bore.'},
  {id:'charm-retaining-flange',code:'positive-wall-required',fields:['charmVanhD','charmCoD'],operator:'gt',message:'Retaining flange diameter must exceed neck diameter.'},
  {id:'mx-cross-aspect',code:'positive-wall-required',fields:['crossL','crossW'],operator:'gt',message:'Cross branch length must exceed branch width.'},
  {id:'connector-positive-roof',code:'bore-through-base',fields:['baseH','legoHoleH'],operator:'gt',message:'Bore depth must leave positive nominal base thickness; no printable minimum roof is claimed.'},
  {id:'tab-neck-within-width',code:'tab-neck-width',fields:['legoTaiW','legoTaiCo'],operator:'gte',message:'Neck width must not exceed tab width.'},
  {id:'tray-mouth-cavity',code:'mouth-cavity-width',fields:['hMouth','plateHole'],operator:'gte',message:'Mouth must be at least as wide as body cavity.'}
]);
export const FIELD_SCHEMA = deepFreeze(CATALOG.fields.map(legacy=>{
  const semantic = semantics.get(legacy.id);
  check(semantic, 'schema-coverage', 'Missing semantic disposition.',{id:legacy.id});
  const group = groupIds.get(legacy.nhom), category = semantic.category;
  const products = group === 'imported_mesh' ? [...PRODUCT_IDS] : legacy.apChoLoai === 'tất cả' ? [...PRODUCT_IDS] : [...legacy.apChoLoai];
  const type = category === 'Z' ? 'height' : category === 'schedule' ? 'decimal' : legacy.kieu === 'c' ? 'boolean' : legacy.kieu === 's' ? 'enum' : 'decimal';
  const autoModes = legacy.id === 'ringH' ? ['body-height'] : [];
  let defaultValue = legacy.macDinh;
  if (type === 'height') defaultValue = legacy.id === 'ringH' && defaultValue === 0
    ? {heightMode:'auto',mode:'body-height'} : {heightMode:'mm',mm:defaultValue};
  if (category === 'schedule') defaultValue = 0.20;
  const integer = ['count','index','replacement'].includes(category) && legacy.donVi !== 'mm';
  const domain = type === 'boolean' ? {kind:'boolean'} : type === 'enum' ? {kind:'enum',values:legacy.mien}
    : {kind:'range', min: category === 'schedule' ? 0.08 : legacy.mien[0],
       max:category === 'schedule' ? 0.30 : legacy.mien[1], quantum:integer ? legacy.buoc : 0.000001, integer};
  return {
    id:legacy.id, version:1, group, type, unit:category === 'schedule' || type === 'height' ? 'mm'
      : legacy.id === 'res' ? 'px' : legacy.donVi ?? (category === 'index' ? 'candidate-index' : 'dimensionless'),
    domain, defaultValue, semanticScope:semantic.meaning,
    constraints:RELATIONAL_CONSTRAINTS.filter(c=>c.fields.includes(legacy.id)).map(c=>c.id),
    scope:category === 'schedule' ? 'schedule' : products.length === PRODUCT_IDS.length ? 'common' : 'product',
    applicability:{products,sources:sourceOnly[legacy.id] ?? [...SOURCE_KINDS],dependencies:deps.get(legacy.id) ?? []},
    valueDependencies:legacy.id === 'ringH' ? ['baseH'] : [],
    heightPolicy: type === 'height' ? {scheduleDependency:'schedule.hash',defaultMode:'mm',layers:'explicit-datum-and-rounding-only',autoModes}
      : {layers:'forbidden',coordinate:category === 'C'},
    disposition:{kind:category === 'replacement' ? 'replace-capability' : legacy.donVi === 'mm' || ['Z','C','schedule'].includes(category) ? 'keep-mm' : 'keep-value',
      target:legacy.id === 'impVox' ? 'meshJoinTolerance' : legacy.id === 'strapSeg' ? 'strapTolerance' : legacy.id,
      numericMapping:category === 'replacement' ? 'none' : legacy.id === 'ringH' ? 'zero-to-explicit-auto-enum' : 'identity',
      reason:semantic.meaning, specRefs:['MOD-03','GEO-02',...(group === 'imported_mesh' ? ['GEO-04'] : [])]},
    lifecycle:category === 'replacement' ? 'migration-only' : 'active',
    blockers:semantic.blocker ? [{id:'O-02/'+semantic.blocker,reason:semantic.meaning}] : [],
    verification:{data:'executable',geometry:uiOnly.has(legacy.id) ? 'not-applicable' : 'unsupported',fit:'unverified'},
    ui:{label:legacy.nhan,advanced:legacy.nangCao,widget:legacy.kieu,increment:legacy.id === 'clr' ? 0.02 : legacy.buoc,
      catalogIncrement:legacy.buoc,visibleRow:!['bevelChu','charmRap','assemble'].includes(legacy.id),manufacturingEffect:!uiOnly.has(legacy.id)},
    legacy:{catalogId:CATALOG.catalogId,catalogVersion:CATALOG.catalogVersion,default:legacy.macDinh,domain:legacy.mien,
      layerHint:legacy.bamLopIn,productHint:legacy.apChoLoai}
  };
}).concat(['meshJoinTolerance','strapTolerance'].map(id=>({
  id,version:1,group:id === 'strapTolerance' ? 'strap' : 'imported_mesh',type:'tolerance',unit:'mm',
  domain:{kind:'tagged-union',modes:['unselected','selected'],minExclusive:0,quantum:0.000001},
  defaultValue:{mode:'unselected'},semanticScope:id === 'strapTolerance' ? 'Maximum radial inward deviation for a declared circular tessellation convention.'
    : 'Requested upper bound on mesh surface deviation; requires a versioned kernel capability and ledger.',
  scope:id === 'strapTolerance' ? 'product' : 'common',
  applicability:{products:id === 'strapTolerance' ? ['strap'] : [...PRODUCT_IDS],sources:[...SOURCE_KINDS],dependencies:deps.get(id) ?? []},
  heightPolicy:{layers:'forbidden'},disposition:{kind:'replace-capability',target:id,numericMapping:'none',reason:'Explicit selection; no inherited numeric tolerance.',specRefs:['GEO-02','GEO-04','MOD-03']},
  constraints:[],valueDependencies:[],lifecycle:'active',blockers:[{id:id === 'strapTolerance' ? 'O-02/tessellation-convention' : 'O-01/mesh-tolerance-definition',reason:'Selected values are requests, not measured geometry evidence.'}],
  verification:{data:'executable',geometry:'unsupported',fit:'unverified'},
  ui:{label:id === 'strapTolerance' ? 'Sai lệch thành lỗ tối đa' : 'Sai lệch bề mặt ghép tối đa',advanced:true,widget:'number',increment:0.000001}
}))));
const byId = new Map(FIELD_SCHEMA.map(f=>[f.id,f]));
export const MODE_DEFAULTS = deepFreeze(cloneData(CATALOG.modeDefaults));
export const CAPABILITIES = deepFreeze([
  {id:'domain.parameters',status:'supported',version:1},
  {id:'domain.layer-schedule',status:'supported',version:1},
  {id:'domain.product-switch',status:'supported',version:1},
  {id:'import-as-part',status:'unsupported',reason:'This module does not parse or verify meshes.'},
  {id:'csg-union',status:'unsupported',reason:'O-01/O-02 kernel, tolerance and topology verification pending.'},
  {id:'csg-subtract',status:'unsupported',reason:'O-01/O-02 kernel, tolerance and topology verification pending.'},
  {id:'geometry.generate',status:'unsupported',reason:'Storage validation is not geometry verification.'},
  {id:'hardware.fit',status:'unverified',reason:'O-03 measurements/coupons absent.'},
  {id:'profile.compatibility',status:'unverified',reason:'O-06 adapter and slicer evidence required.'}
]);
export function getField(id) {
  assertKey(id);
  const field = byId.get(id); check(field, 'unknown-field', 'Unknown stable parameter ID.', {id}); return field;
}
export function assertProduct(product) { check(PRODUCT_IDS.includes(product), 'unknown-product', 'Unknown product type; do not reset the project.', {product}); return product; }
export function normalizeField(id, input, { schedule, allowLegacy = false } = {}) {
  const field = getField(id); input = cloneData(input);
  check(allowLegacy || field.lifecycle === 'active', 'replaced-field', 'Legacy control is migration-only.', {id,replacement:field.disposition.target});
  if (field.type === 'boolean') { check(typeof input === 'boolean','boolean-required','Boolean values are not coerced.',{id}); return input; }
  if (field.type === 'enum') { check(typeof input === 'string' && field.domain.values.includes(input),'enum-domain','Unknown enum member.',{id}); return input; }
  if (field.type === 'tolerance') {
    check(input && ['unselected','selected'].includes(input.mode),'tolerance-mode','Choose an explicit tolerance mode.');
    if (input.mode === 'unselected') { onlyKeys(input,['mode']); return input; }
    onlyKeys(input,['mode','maxDeviationMm','capabilityId','capabilityVersion']);
    const maxDeviationMm = parseDecimal(input.maxDeviationMm).value;
    check(maxDeviationMm > 0,'tolerance-domain','A tolerance bound must be strictly positive.');
    check(input.capabilityId === (id === 'strapTolerance' ? 'circle-inscribed-equal-angle' : 'mesh-surface-deviation') &&
      typeof input.capabilityVersion === 'string' && input.capabilityVersion.length > 0 && input.capabilityVersion.length <= 100,
      'tolerance-capability','An explicit versioned tolerance convention is required.');
    return deepFreeze({...input,maxDeviationMm});
  }
  let value;
  if (field.type === 'height') {
    value = normalizeHeight(input,{autoModes:field.heightPolicy.autoModes});
    if (value.heightMode === 'auto') return value;
    check(schedule,'schedule-required','Height validation requires the project schedule.');
    validateSchedule(schedule);
  } else value = parseDecimal(input).value;
  const scalar = field.type === 'height' ? heightMm(value,schedule) : value;
  check(id !== 'ringH' || scalar !== 0, 'zero-height-use-auto', 'Use the explicit body-height auto enum instead of a zero-height eyelet.');
  check(scalar >= field.domain.min && scalar <= field.domain.max,'field-domain','Value is outside the inclusive field domain.',{id,value:scalar,min:field.domain.min,max:field.domain.max});
  // Layer values have integer layer semantics, not the former millimeter step.
  if (!(field.type === 'height' && value.heightMode === 'layers'))
    check(isOnGrid(scalar,field.domain.min,field.domain.quantum),'field-grid','Value is off the explicit storage grid.',{id,quantum:field.domain.quantum});
  return value;
}
export function candidateDefault(id, product) {
  const field = getField(id); assertProduct(product);
  const preset = MODE_DEFAULTS.find(p=>p.mode === product).preset;
  const raw = Object.hasOwn(preset,id) ? preset[id] : field.legacy?.default;
  if (raw === undefined) return cloneData(field.defaultValue);
  if (field.type === 'height') return id === 'ringH' && raw === 0 ? {heightMode:'auto',mode:'body-height'} : {heightMode:'mm',mm:raw};
  if (field.scope === 'schedule') return parseDecimal(raw).value;
  return cloneData(raw);
}
export function fieldAvailability(id, {product,sourceKind='none',values={},capabilities=[]}) {
  const field = getField(id); assertProduct(product);
  check(SOURCE_KINDS.includes(sourceKind),'source-kind','Unknown source kind.');
  values = cloneData(values);
  const reasons = [];
  if (field.lifecycle !== 'active') reasons.push({gate:'replacement',target:field.disposition.target});
  if (!field.applicability.products.includes(product)) reasons.push({gate:'product',product});
  if (!field.applicability.sources.includes(sourceKind)) reasons.push({gate:'source',sourceKind});
  for (const condition of field.applicability.dependencies) {
    const current = values[condition.id];
    const satisfied = Object.hasOwn(condition,'equals') ? current === condition.equals
      : condition.oneOf ? condition.oneOf.includes(current) : typeof current === 'number' && current > condition.greaterThan;
    if (!satisfied) reasons.push({gate:'dependency',...condition});
  }
  if (id === 'ringTren' && values.ringTren === 'chu' && !capabilities.includes('text-host'))
    reasons.push({gate:'capability',capability:'text-host'});
  return {id,applicable:reasons.length === 0,reasons,valueRetained:true,geometryVerified:false,blockers:field.blockers};
}

/** Increment relative to the exact current value, never snap to min + k * UI step. */
export function stepFieldValue(id,current,direction,{schedule,layerStep=1}={}) {
  const field=getField(id);
  check(direction===1||direction===-1,'step-direction','Step direction must be +1 or -1.');
  const value=normalizeField(id,current,{schedule});
  check(field.type==='decimal'||field.type==='height','step-type','This parameter is not a numeric step control.');
  if(field.type==='height'&&value.heightMode==='layers'){
    normalizeField('layerStep',layerStep);
    return normalizeField(id,{...value,layers:value.layers+direction*layerStep},{schedule});
  }
  check(!(field.type==='height'&&value.heightMode==='auto'),'auto-step','Choose an explicit mm/layer value before stepping auto height.');
  const increment=field.ui.increment;
  check(typeof increment==='number'&&increment>0,'step-unavailable','Choose a schedule chip or explicit value for this field.');
  const old=field.type==='height'?value.mm:value;
  const next=unitsDecimal(decimalUnits(old)+BigInt(direction)*decimalUnits(increment));
  return normalizeField(id,field.type==='height'?{...value,mm:next}:next,{schedule});
}