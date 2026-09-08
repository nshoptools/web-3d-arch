import { check, onlyKeys, cloneData, deepFreeze } from './safe.mjs';
import { decimalUnits, unitsDecimal, parseDecimal } from './decimal.mjs';
import { dataHash } from './hash.mjs';
export const MAX_LAYER_INDEX = 1000000;
export const SCHEDULE_VERSION = 1;
export function createSchedule(input = {}) {
  input = cloneData(input);
  onlyKeys(input, ['firstLayerHeight','layerHeight','sources','profileId'], []);
  const firstLayerHeight = parseDecimal(input.firstLayerHeight ?? 0.20).value;
  const layerHeight = parseDecimal(input.layerHeight ?? 0.20).value;
  check(firstLayerHeight > 0 && firstLayerHeight <= 1, 'first-layer-domain', 'First layer must be positive and at most 1 mm (storage policy; profile support unverified).');
  check(layerHeight >= 0.08 && layerHeight <= 0.30, 'layer-domain', 'Regular layer height must be within 0.08–0.30 mm.');
  const sources = input.sources ?? { firstLayerHeight: 'user', layerHeight: 'user' };
  onlyKeys(sources, ['firstLayerHeight','layerHeight']);
  for (const source of Object.values(sources)) check(['user','profile'].includes(source), 'schedule-source', 'Schedule source must be user or profile.');
  const profileId = input.profileId ?? null;
  check(profileId === null || (typeof profileId === 'string' && profileId.length > 0 && profileId.length <= 200), 'profile-id', 'Invalid profile ID.');
  check(!Object.values(sources).includes('profile') || profileId !== null, 'profile-id', 'Profile-sourced heights require a profile ID.');
  const body = { version: SCHEDULE_VERSION, kind: 'first-plus-regular', firstLayerHeight, layerHeight, sources, profileId };
  return deepFreeze({ ...body, hash: dataHash(body) });
}
export function validateSchedule(schedule) {
  schedule = cloneData(schedule);
  onlyKeys(schedule, ['version','kind','firstLayerHeight','layerHeight','sources','profileId','hash']);
  check(schedule.version === 1 && schedule.kind === 'first-plus-regular', 'unsupported-schedule', 'Adaptive or unknown schedules must be retained without execution.');
  const canonical = createSchedule({ firstLayerHeight: schedule.firstLayerHeight, layerHeight: schedule.layerHeight, sources: schedule.sources, profileId: schedule.profileId });
  check(canonical.hash === schedule.hash, 'schedule-hash', 'Schedule hash does not match its content.');
  return canonical;
}
export function layerIndex(n) {
  check(Number.isSafeInteger(n) && n >= 0 && n <= MAX_LAYER_INDEX, 'layer-index', 'Layer index must be a nonnegative bounded integer.');
  return n;
}
function zUnits(n, schedule) {
  layerIndex(n);
  const z = n === 0 ? 0n : decimalUnits(schedule.firstLayerHeight) + BigInt(n-1) * decimalUnits(schedule.layerHeight);
  check(z <= 10000n * 1000000n, 'z-range', 'Layer boundary exceeds 10,000 mm.');
  return z;
}
export function layerBoundary(n, schedule) { schedule = validateSchedule(schedule); return unitsDecimal(zUnits(n,schedule)); }
export function layerSpan(start, count, schedule) {
  schedule = validateSchedule(schedule); layerIndex(start); layerIndex(count);
  return unitsDecimal(zUnits(start+count,schedule) - zUnits(start,schedule));
}
export function validateDatum(datum, referenceLayer) {
  datum = cloneData(datum); layerIndex(referenceLayer);
  check(datum && ['bed','feature'].includes(datum.kind), 'datum-required', 'Choose a bed or stable feature datum.');
  if (datum.kind === 'bed') {
    onlyKeys(datum, ['kind']);
    check(referenceLayer === 0, 'bed-reference', 'A bed datum must start at layer index 0.');
  } else {
    onlyKeys(datum, ['kind','featureId']);
    check(typeof datum.featureId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(datum.featureId),
      'feature-id', 'A feature datum needs a stable ID.');
    check(!['__proto__','constructor','prototype'].includes(datum.featureId), 'unsafe-key', 'Unsafe feature ID.');
  }
  return datum;
}
export function normalizeHeight(value, { allowLayers = true, autoModes = [] } = {}) {
  value = cloneData(value);
  check(value && typeof value === 'object', 'height-mode', 'Height requires an explicit heightMode.');
  if (value.heightMode === 'auto') {
    onlyKeys(value, ['heightMode','mode']);
    check(autoModes.includes(value.mode), 'auto-mode', 'This field does not support the requested auto mode.');
    return deepFreeze(value);
  }
  if (value.heightMode === 'mm') {
    onlyKeys(value, ['heightMode','mm','datum','referenceLayer'], ['heightMode','mm']);
    const result = { heightMode:'mm', mm:parseDecimal(value.mm).value };
    if (Object.hasOwn(value,'datum') || Object.hasOwn(value,'referenceLayer')) {
      result.datum = validateDatum(value.datum, value.referenceLayer); result.referenceLayer = value.referenceLayer;
    }
    return deepFreeze(result);
  }
  check(value.heightMode === 'layers' && allowLayers, 'height-mode', 'Layer mode is unsupported for this field.');
  onlyKeys(value, ['heightMode','layers','datum','referenceLayer']);
  layerIndex(value.layers);
  return deepFreeze({ ...value, datum: validateDatum(value.datum,value.referenceLayer) });
}
export function heightMm(value, schedule) {
  value = normalizeHeight(value);
  if (value.heightMode === 'mm') return value.mm;
  return layerSpan(value.referenceLayer, value.layers, schedule);
}
export function previewMmToLayers(mm, schedule, binding) {
  schedule = validateSchedule(schedule); binding = cloneData(binding);
  onlyKeys(binding, ['datum','referenceLayer']);
  const datum = validateDatum(binding.datum,binding.referenceLayer);
  const mmUnits = decimalUnits(mm);
  check(mmUnits >= 0n, 'negative-layer-span', 'Layer thickness cannot be negative.');
  const start = binding.referenceLayer, target = zUnits(start,schedule) + mmUnits;
  check(target <= 10000n * 1000000n, 'z-range', 'Target exceeds 10,000 mm.');
  const first = decimalUnits(schedule.firstLayerHeight), regular = decimalUnits(schedule.layerHeight);
  const floorEnd = target < first ? 0 : Number(1n + (target-first)/regular);
  const ceilEnd = zUnits(floorEnd,schedule) === target ? floorEnd : floorEnd+1;
  const loDistance = target-zUnits(floorEnd,schedule), hiDistance = zUnits(ceilEnd,schedule)-target;
  const nearestEnd = loDistance < hiDistance ? floorEnd : loDistance > hiDistance ? ceilEnd
    : (floorEnd-start)%2 === 0 ? floorEnd : ceilEnd;
  const option = (rounding,end) => {
    const layers = end-start; layerIndex(layers);
    const actual = zUnits(end,schedule)-zUnits(start,schedule);
    return { rounding, value:{heightMode:'layers',layers,datum,referenceLayer:start}, mm:unitsDecimal(actual), deltaMm:unitsDecimal(actual-mmUnits) };
  };
  return deepFreeze({ original:{heightMode:'mm',mm:parseDecimal(mm).value}, scheduleHash:schedule.hash,
    options:[option('floor',floorEnd),option('ceil',ceilEnd),option('nearest-ties-even',nearestEnd)],
    requiresAcceptance:true, geometryVerified:false, datumVerified:datum.kind === 'bed' ? 'declared' : 'requires-feature-resolution' });
}
export function describeHeight(value, schedule) {
  if (value.heightMode === 'auto') return { mode:'auto', resolution:'requires-field-resolver' };
  const mm = heightMm(value,schedule);
  if (value.heightMode === 'layers') return { mode:'layers', mm, datum:value.datum, referenceLayer:value.referenceLayer, scheduleHash:schedule.hash, geometryVerified:false };
  return { mode:'mm', mm, scheduleHash:schedule.hash, manufacturing:
    Object.hasOwn(value,'datum') ? previewMmToLayers(mm,schedule,{datum:value.datum,referenceLayer:value.referenceLayer})
    : {status:'unverified',reason:'datum-required'}, geometryVerified:false };
}
