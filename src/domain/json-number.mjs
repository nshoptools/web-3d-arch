import { check } from './safe.mjs';
// Compare decimal significands/exponents; never let JSON.parse erase low-order source digits.
function identity(token){
  const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  check(m,'json-number','Invalid JSON number.');
  let digits=(m[2]+(m[3]??'')).replace(/^0+/,'');
  if(!digits)return '0';
  let exponent=BigInt(m[4]??'0')-BigInt((m[3]??'').length);
  const trailing=digits.length-digits.replace(/0+$/,'').length;
  digits=digits.slice(0,digits.length-trailing); exponent+=BigInt(trailing);
  return m[1]+digits+'e'+exponent;
}
export function exactJsonNumber(token){
  check(token.length<=128,'json-number-size','Numeric token exceeds exact input budget.');
  const value=Number(token);
  check(Number.isFinite(value),'nonfinite','JSON number is outside finite storage range.');
  check(identity(token)===identity(String(value)),'json-number-loss','JSON number would lose source digits; retain the original document.');
  return value===0?0:value;
}
