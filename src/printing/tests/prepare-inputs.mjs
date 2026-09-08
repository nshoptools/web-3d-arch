import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureProfile} from './profile-fixtures.mjs';
import {request} from './analytic-fixtures.mjs';
const [repo,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
for(const kind of ['bambu','u1']){
 const profile=await fixtureProfile(repo,kind);await writeFile(join(out,kind+'-profile.json'),JSON.stringify(profile));
 for(const shape of ['cube','adjacent','ring'])await writeFile(join(out,kind+'-'+shape+'.request.json'),JSON.stringify(await request(profile,shape)));
}
