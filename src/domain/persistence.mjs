import { parseJsonStrict, deepFreeze, errorRecord, stableStringify, check } from './safe.mjs';
import { exactJsonNumber } from './json-number.mjs';
import { PROJECT_KIND, PROJECT_VERSION, validateProject } from './project.mjs';
import { sha256 } from './hash.mjs';
/** Unknown versions, enum members, fields, schedules or precision stay lossless and read-only.
 * 'raw' is the original JS text, including whitespace. File byte encoding stays parent-owned.
 */
export function openProjectDocument(raw){
  check(typeof raw==='string','json-required','Open projects from original JSON text.');
  const envelope={kind:'domain-document',raw,sha256:sha256(raw)};
  let input;
  try{input=parseJsonStrict(raw);}
  catch(error){return deepFreeze({...envelope,status:'rejected',issue:errorRecord(error)});}
  if(input?.kind!==PROJECT_KIND||input?.schemaVersion!==PROJECT_VERSION)
    return deepFreeze({...envelope,status:'read-only',issue:{code:'unsupported-project-version',message:'Original data retained without migration or execution.'}});
  try{
    input=parseJsonStrict(raw,exactJsonNumber);
    return deepFreeze({...envelope,status:'editable',state:validateProject(input),verification:{geometry:'unsupported',fit:'unverified'}});
  }catch(error){return deepFreeze({...envelope,status:'read-only',issue:errorRecord(error)});}
}
export function serializeProjectDocument(document){
  if(document?.kind===PROJECT_KIND)return stableStringify(validateProject(document));
  check(document?.kind==='domain-document','document-kind','Expected a project state or opened document.');
  if(document.status==='editable')return stableStringify(validateProject(document.state));
  check(['read-only','rejected'].includes(document.status)&&typeof document.raw==='string','document-kind','Unknown opened-document status.');
  check(sha256(document.raw)===document.sha256,'document-hash','Retained source text changed.');
  return document.raw;
}
