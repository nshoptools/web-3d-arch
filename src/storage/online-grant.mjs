import {check} from './common.mjs';
const issued=new WeakSet();
/** Trusted application boundary. JSON/imported metadata cannot supply executable authorization. */
export function createOnlineGrant(identity,{assertCurrent,preflight}){
 check(typeof assertCurrent==='function'&&typeof preflight==='function','ONLINE_AUTHORIZER_REQUIRED','Live authorization callbacks required.');
 const grant=Object.freeze({...identity,kind:'authenticated-online',assertCurrent,preflight,
  toJSON(){throw new Error('ONLINE_GRANT_NOT_SERIALIZABLE');}});
 issued.add(grant);return grant;
}
export const isOnlineGrant=value=>!!value&&issued.has(value);
