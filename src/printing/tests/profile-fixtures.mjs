import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {check,parseJson,sealed,sha256} from '../src/contracts.mjs';
export function parseFixtureLiteral(text,variable) {
  check(['MAU3MF_BAMBU','MAU3MF_U1'].includes(variable),'FIXTURE_VARIABLE');
  const prefix=text.replace(/^\uFEFF/,'').replace(/^\s*\/\*[\s\S]*?\*\/\s*/,'');
  const literal=prefix.replace(/^\s*"use strict";\s*/, '');
  const match=new RegExp('^\\s*var '+variable+'\\s*=\\s*(\\{[\\s\\S]*\\});\\s*$').exec(literal);
  check(match,'FIXTURE_LITERAL_ONLY');return parseJson(match[1]);
}
export async function fixtureProfile(repoRoot,kind) {
  const dir=join(repoRoot,'tests/fixtures/slicer-profiles/v1');
  const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
  const record=manifest.files.find(f=>f.path==='mau-3mf-'+kind+'.js');
  const bytes=await readFile(join(dir,record.path));check(bytes.length===record.bytes&&await sha256(bytes)===record.sha256,'FIXTURE_HASH');
  const settings=parseFixtureLiteral(bytes.toString('utf8'),record.variable),u1=kind==='u1';
  return sealed({schemaVersion:1,id:'internal-fixture-'+kind+'-v1',adapterId:u1?'export.3mf.snapmaker-project':'export.3mf.bambu-project',
    slicer:{id:u1?'SnapmakerOrca':'BambuStudio',version:record.slicerVersionField},
    printer:{model:record.printerModel,nozzleDiametersMm:settings.nozzle_diameter.map(Number),
      slotExtruders:u1?[1,2,3,4]:[1,1,1,1],
      bedPolygonMm:settings.printable_area.map(s=>s.split('x').map(Number)),maxZMm:Number(settings.printable_height)},
    settings,source:{id:record.path,sha256:record.sha256},rights:'internal-testing',
    mappingProvenance:'Explicit analytic test assignment: each U1 slot to the corresponding physical head; no reference golden accepted.'});
}
