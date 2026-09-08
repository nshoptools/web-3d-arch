import type {SourceAdapter,SourceAdoption,SourceAdoptionInput,SourceAcceptance,SourceConfirmation} from '../../src/app/adapters.mjs';
const hook:NonNullable<SourceAdapter['prepareAdoption']>=async (input:SourceAdoptionInput):Promise<SourceAdoption>=>{
 const bound=input.source.metadata.productBindings;void bound;
 // @ts-expect-error immutable controller descriptor
 input.source.revision=0;
 // @ts-expect-error immutable base state
 input.state.product='charm';
 // @ts-expect-error assets map is read-only (bytes are private copies at runtime)
 input.assets.clear();
 return {version:input.version,ticket:input.ticket,productBindings:{version:'EXAMPLE/1',sourceId:input.source.id},materials:[],materialDefaults:[]};
};
void hook;
const svg:SourceConfirmation={kind:'svg',version:'arch-svg-confirmation/1',approvalHash:'a'.repeat(64),proposalHash:'b'.repeat(64)};
const accepted:SourceAcceptance={version:'arch-app-adapters/1',ticket:{id:'t',userId:'u',projectId:'p',revision:7,generation:3},confirmation:svg,
 receipt:{kind:'svg',version:'arch-source-confirmation-receipt/1',approvalHash:svg.approvalHash,proposalHash:svg.proposalHash,sourceHash:'c'.repeat(64),rgbaHash:'d'.repeat(64),settingsHash:'e'.repeat(64),projectId:'p',sourceRevision:1,acceptedAtRevision:8,artifactHash:'f'.repeat(64)}};
void accepted;
// @ts-expect-error hook cannot replace controller source bytes/identity
const invalid:SourceAdoption={version:'arch-app-adapters/1',ticket:accepted.ticket,productBindings:{},materials:[],materialDefaults:[],source:{raw:{}}};
void invalid;
