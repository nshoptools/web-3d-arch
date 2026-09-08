import type {AppBridge,AppCommand,ProjectView,ExportOption} from '../../src/contracts/app-bridge.js';
import type {ExportAdapter} from '../../src/app/adapters.mjs';
// Typed mock/fixture data for Opus. Explicitly presentation-only; never a production account/model.
export const visibleExamples = {
 beforeBuild: {visibleModelRevision:null,visibleModelStale:false},
 afterPromotion: {visibleModelRevision:4,visibleModelStale:false},
 afterEdit: {visibleModelRevision:4,visibleModelStale:true},
 afterOpen: {visibleModelRevision:null,visibleModelStale:false},
} satisfies Record<string,Pick<ProjectView,'visibleModelRevision'|'visibleModelStale'>>;
export const exportExamples = [
 {id:'source-svg',label:'TEST source SVG',extension:'svg',enabled:true,prerequisite:'committed-source',verdict:'unverified'},
 {id:'stl',label:'TEST STL',extension:'stl',enabled:false,prerequisite:'matching-model',reasonCode:'STALE_REVISION',reason:'Build and apply the current project revision before exporting this format.',verdict:'unverified'},
 {id:'project',label:'Rescue project package',extension:'arch-project.zip',enabled:false,prerequisite:'project-bytes',reasonCode:'PROJECT_REQUIRED',reason:'Open a locally committed project before exporting its rescue package.',verdict:'unverified'},
] satisfies ExportOption[];
export async function dismissProposal(bridge:AppBridge,retry:AppCommand) {
 if(retry.type!=='proposal.accept')throw new Error('Expected an exact pending proposal');
 // Caller closes the dialog only on ok. APPROVAL_IN_PROGRESS remains visible/pending.
 return bridge.dispatch({type:'proposal.discard',id:retry.id});
}
export function receiveExportInput(input:Parameters<ExportAdapter['export']>[0]) {
 const revision=input.model?.ticket.revision??null; // A renderer may display an older model.
 const original=input.assets.get('expected-sha256'); // Read only copied immutable input bytes.
 return {revision,original,renderer:input.renderer.available,prerequisite:input.prerequisite};
}
// @ts-expect-error discard must identify the exact proposal
export const invalidDiscard:AppCommand={type:'proposal.discard'};
