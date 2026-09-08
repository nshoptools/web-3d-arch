import type {AppBridge,AppCommand} from '../../src/contracts/app-bridge.js';
import {createAppController,type AppAdapters,type ModelLease} from '../../src/app/index.mjs';
const adapters:AppAdapters={reset(){}};
const controller=createAppController({origin:'https://localhost',deviceId:'00000000-0000-4000-8000-000000000001',adapters});
const bridge:AppBridge=controller;
const commands:AppCommand[]=[
 {type:'proposal.accept',id:'id',confirmed:true},{type:'source.convert',target:'raster'},
 {type:'material.update',id:'m',slot:null},{type:'selection.set',blockId:null},
 {type:'ai.close-unknown',jobId:'id',reason:'Follow up externally',confirmed:true},
 {type:'policy.update',version:1,document:{},confirmed:true}
];
for(const c of commands)void bridge.dispatch(c);
void bridge.editSource({id:'gesture',projectRevision:1,sourceRevision:0,tool:'line',points:[{x:0,y:0},{x:2,y:3}],snap:'45'});
// @ts-expect-error unknown command must not be accepted
void bridge.dispatch({type:'invented.success'});
// @ts-expect-error generation is mandatory and separate from project ticket
const badLease:ModelLease={version:'arch-app-adapters/1',ticket:{id:'t',userId:'u',projectId:'p',revision:3,generation:2},leaseId:'l',bytes:()=>new Uint8Array(),stats:{widthMm:1,depthMm:1,heightMm:1,triangles:1,materialCount:1,verdict:'unverified'},blocks:[],release(){}};
