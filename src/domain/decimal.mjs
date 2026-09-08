import { check, fail } from './safe.mjs';
export const DECIMAL_SCALE = 1000000n;
export const DECIMAL_PLACES = 6;
// Explicit storage policy: nm grid for mm, no silent rounding. UI step is separate.
function parts(input, maxPlaces = 36) {
  check(typeof input === 'number' || typeof input === 'string', 'decimal-type', 'Expected decimal text or a finite number.');
  if (typeof input === 'number') check(Number.isFinite(input), 'nonfinite', 'NaN and Infinity are not decimal values.');
  const raw = typeof input === 'string' ? input.trim() : String(input);
  check(raw.length > 0 && raw.length <= 128, 'decimal-length', 'Decimal input is empty or too long.');
  check(/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw), 'decimal-syntax',
    'Use one comma or dot as decimal separator; grouping, exponents and partial input are not accepted.');
  const normalized = raw.replace(',', '.');
  const negative = normalized[0] === '-';
  const unsigned = normalized.replace(/^[+-]/, '');
  let [whole, fraction = ''] = unsigned.split('.');
  whole = (whole || '0').replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  check(fraction.length <= maxPlaces, 'decimal-precision', 'Decimal exceeds supported exact precision.', { maxPlaces });
  const coefficient = BigInt(whole + fraction) * (negative ? -1n : 1n);
  const canonical = (coefficient < 0n ? '-' : '') + whole + (fraction ? '.' + fraction : '');
  return { coefficient, places: fraction.length, canonical: coefficient === 0n ? '0' : canonical };
}
export function parseDecimal(input) {
  const p = parts(input, DECIMAL_PLACES);
  const value = Number(p.canonical);
  check(Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / Number(DECIMAL_SCALE),
    'decimal-range', 'Decimal exceeds the exact storage range.');
  // Ensure canonical Number JSON spelling does not lose source digits.
  check(parts(value, DECIMAL_PLACES).canonical === p.canonical, 'decimal-loss', 'Decimal cannot be stored without losing digits.');
  return { value: value === 0 ? 0 : value, canonical: p.canonical };
}
export function decimalUnits(input) {
  const { canonical } = parseDecimal(input);
  const p = parts(canonical);
  return p.coefficient * (10n ** BigInt(DECIMAL_PLACES - p.places));
}
export function unitsDecimal(units) {
  check(typeof units === 'bigint', 'integer-required', 'Internal decimal units must be BigInt.');
  const a = units < 0n ? -units : units;
  const text = (units < 0n ? '-' : '') + (a / DECIMAL_SCALE) + '.' + (a % DECIMAL_SCALE).toString().padStart(6, '0');
  return parseDecimal(text).value;
}
export function compareDecimal(a, b) { const d = decimalUnits(a) - decimalUnits(b); return d < 0n ? -1 : d > 0n ? 1 : 0; }
export function addDecimal(a, b) { return unitsDecimal(decimalUnits(a) + decimalUnits(b)); }
export function subtractDecimal(a, b) { return unitsDecimal(decimalUnits(a) - decimalUnits(b)); }
export function isOnGrid(value, min, step) { return (decimalUnits(value) - decimalUnits(min)) % decimalUnits(step) === 0n; }
export function roundRatio(n, d, rounding) {
  check(d > 0n, 'invalid-divisor', 'Divisor must be positive.');
  let q = n / d, r = n % d;
  if (r < 0n) { q--; r += d; }
  if (rounding === 'floor') return q;
  if (rounding === 'ceil') return q + (r > 0n ? 1n : 0n);
  if (rounding === 'nearest-ties-even') return q + (2n * r > d || (2n * r === d && q % 2n !== 0n) ? 1n : 0n);
  fail('rounding-required', 'Choose floor, ceil or nearest-ties-even explicitly.');
}
/** Explicit quantization only; parsing never rounds. */
export function quantizeDecimal(input, grid, rounding) {
  const p = parts(input), g = decimalUnits(grid);
  check(g > 0n, 'grid-required', 'Grid must be positive.');
  const denominator = 10n ** BigInt(p.places);
  const q = roundRatio(p.coefficient * DECIMAL_SCALE, denominator * g, rounding);
  return unitsDecimal(q * g);
}
