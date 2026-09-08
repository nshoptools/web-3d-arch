import type { AppBridge, AppSnapshot } from '@review/contracts/app-bridge.ts'

/** Deterministic test double only: never imports a controller, network client or paid provider. */
export function snapshot(): AppSnapshot {
 return {
  contractVersion:'0.3', environment:'prototype', version:'synthetic-request-boundary/1', online:true,
  capabilities:[{id:'project.write',available:true},{id:'ai.generate',available:true}],
  session:{status:'signed-in',user:{id:'A',name:'Test A',email:'a@example.invalid',role:'owner'},deviceMode:'private'},
  project:{id:'P1',name:'Test P1',revision:0,savedRevision:0,product:'keychain',visibleModelRevision:null,visibleModelStale:false,step:1,source:null,
   parameters:[],materials:[],text:{text:'',fontId:'',sizeMm:'10',heightLayers:'1',baseWidthMm:'0',baseThicknessLayers:'0',baseRadiusMm:'0',bend:'0',letterSpacing:'0',lineSpacing:'1',baseEnabled:false,bevelEnabled:false,asSource:false,xMm:'0',yMm:'0',placement:'on-model',sizeUnit:'mm',sizeDisplay:'10'},
   canUndo:false,canRedo:false,sourceCanvas:null,history:{undoCount:0,redoCount:0,payloadBytes:0,truncated:false},importedMesh:{present:false,unappliedFields:[]},selection:null,blocks:[],stats:{materialCount:0,verdict:'unverified'}},
  job:null,diagnostics:[],library:[],exports:[],
  aiProviders:[{id:'synthetic',label:'Synthetic provider (no network)',connected:true,models:[{id:'m',label:'Controlled model',supportsReference:true,qualities:[],sizes:[]}],currency:'USD',spent:'0',reserved:'0',budget:'1',available:true,credential:{label:'Synthetic test credential',masked:'none',status:'test',lastChecked:null}}],
  printer:{id:null,label:'None',filamentSlots:1,qualified:false},settings:[],editor:{tool:'paint',colorMaterialId:null,cutMode:'merge',strokeWidthPx:'1',healAuto:false,healAllGaps:false,healThresholdMm:'0'},
  aiJobs:[],aiBudget:{revision:0,limits:[]},printers:[],policy:null,storage:{usedBytes:0,quotaBytes:null,estimate:true},
 }
}
export type Call = {id:number;method:string;input:unknown;pending:boolean;resolve:(v:unknown)=>void;reject:(e:unknown)=>void}
export class DeferredBridge {
 value=snapshot(); listeners=new Set<()=>void>(); calls:Call[]=[]; notifications:{account:string;project:string;revision:number}[]=[]
 hold = <T,>(method:string,input:unknown):Promise<T> => new Promise((resolve,reject)=>this.calls.push({id:this.calls.length+1,method,input,pending:true,resolve:resolve as (v:unknown)=>void,reject}))
 api:AppBridge = {
  getSnapshot:()=>this.value, subscribe:fn=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}},
  dispatch:c=>this.hold('dispatch',c),importFile:(file,purpose)=>this.hold('importFile',{file,purpose}),exportFile:id=>this.hold('exportFile',id),attachViewport:()=>()=>{},
  editSource:g=>this.hold('editSource',g),pickMirrorDirectory:()=>this.hold('pickMirrorDirectory',null),
  queryEmoji:(...args)=>this.hold('queryEmoji',args),selectEmoji:(...args)=>this.hold('selectEmoji',args),queryFonts:q=>this.hold('queryFonts',q),queryPresets:p=>this.hold('queryPresets',p),
  signIn:o=>this.hold('signIn',o),signOut:o=>this.hold('signOut',o),connectAI:(...args)=>this.hold('connectAI',args),disconnectAI:id=>this.hold('disconnectAI',id),
  prepareImage:r=>this.hold('prepareImage',r),submitImage:r=>this.hold('submitImage',r),queryAIJobs:f=>this.hold('queryAIJobs',f),listUsers:()=>this.hold('listUsers',null),inviteUser:i=>this.hold('inviteUser',i),updateUser:(...args)=>this.hold('updateUser',args),
 }
 change(account?:string,project?:string,revision?:number){
  const old=this.value;this.value={...old,session:account===undefined?old.session:{...old.session,user:{...old.session.user!,id:account}},project:{...old.project,...(project===undefined?{}:{id:project}),...(revision===undefined?{}:{revision})}}
  this.notifications.push({account:this.value.session.user!.id,project:this.value.project.id,revision:this.value.project.revision});for(const f of this.listeners)f()
 }
 settle(id:number,value:unknown,rejected=false){const c=this.calls.find(c=>c.id===id);if(!c||!c.pending)throw Error('Unknown or already settled test call');c.pending=false;if(rejected)c.reject(new Error(String(value)));else c.resolve(value)}
}

