// Node-only fixture loading; no product profile is bundled by this module.
import {fixtureProfile} from '../../src/printing/tests/profile-fixtures.mjs';
import {sealed,canonical,sha256} from '../../src/printing/src/contracts.mjs';
export {environment,clone,APP,BAMBU,U1,modulePins} from './context-fixture.mjs';
export async function profiles(base){return {bambu:await fixtureProfile(base,'bambu'),u1:await fixtureProfile(base,'u1')};}
export async function checkedProfile(profile,modify){const p=structuredClone(profile.payload);modify(p);return sealed(p);}
export {sealed,canonical,sha256};
