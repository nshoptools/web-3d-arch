import type {AppBridge,AppSnapshot,CommandResult,UserView} from '../contracts/app-bridge.js';
import type {AppAdapters,DomainState,ModelLease,Ticket} from './adapters.mjs';
import type {openProjectStore} from '../storage/index.mjs';
export * from './adapters.mjs';
export {createEditingClient} from './editing-client.mjs';
import type {EditingClient,EditingClientOptions} from './editing-client.mjs';
export {createEngineAdapter,createThreeViewportAdapter,svgExtrusionRecipe} from './parent-adapters.mjs';
declare const verifiedLeaseBrand:unique symbol;
/** Obtain from signature verification with a trusted server key; JSON copies lose runtime proof. */
export interface VerifiedLease {readonly [verifiedLeaseBrand]:true;userId:string;deviceId:string;authVersion:number;verifiedAt:number;expiresAt:number;verified:true}
export interface ControllerOptions {
 origin:string;deviceId:string;adapters?:AppAdapters;
 fetchImpl?:typeof fetch;storeFactory?:typeof openProjectStore;clock?:()=>number;deviceMode?:'private'|'shared';
 navigate?:(url:string)=>void;objectURLs?:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>;
 storagePolicy?:{backend?:'prefer-opfs'|'opfs'|'idb';allowIDBFallback?:boolean;fallbackWhen?:('unsupported'|'verification-failed'|'quota')[];requestPersistence?:boolean;coordination?:'cas-only'};
 /** Default retains signed offline behavior. Opt-in requires fresh HTTPS and enforces online preflight. */
 leasePolicy?:'signed-offline'|'allow-authenticated-online';
 /** Removed standalone trust bypass; true fails EXPLICIT_LEASE_POLICY_REQUIRED. */
 allowAuthenticatedLeaseResponse?:false;
}
export interface ControllerSnapshot extends AppSnapshot {
 controller:{version:1;headRevision:number;visibleRevision:number|null;previewTicket:string|null;
 pendingChange:null|{id:string;revision:number;outputHash?:string;kind?:string};
 conflicts:{projectId:string;transactionId:string;expectedRevision:number}[];
 settingsConflicts:unknown[];rawExportAvailable:boolean;placementProposal:unknown;
 leaseCapability:null|{signature:'verified'|'unsupported';trust:'webcrypto'|'blocked'|'authenticated-online';reason?:string}};
}
export interface AppController extends AppBridge {
 initialize():Promise<CommandResult>;
 resumeOffline(input:{user:UserView;verifiedLease:VerifiedLease}):Promise<CommandResult>;
 getSnapshot():ControllerSnapshot;
 setOnline(online:boolean):void;
 previewBuild():Promise<CommandResult & {ticketId?:string}>;
 commitBuild(ticketId:string):Promise<CommandResult>;
 dispose():Promise<void>;
}
export function createAppController(options:ControllerOptions):AppController;
export const VERSION:'arch-app-adapters/1';
export function moneyMicros(raw:string):number;
export function moneyText(micros:number):string;
export function verifyOnlineLease(reply:unknown,me:unknown,options?:{onCapability?:(capability:unknown)=>void}):Promise<VerifiedLease>;
export function createRasterEditingAdapter(options:Pick<EditingClientOptions,'workerURL'|'workerFactory'> & {createEditingClient?:()=>EditingClient|Promise<EditingClient>;encodePNG:(image:{width:number;height:number;data:Uint8Array},options:{signal:AbortSignal})=>Promise<Uint8Array>}):NonNullable<AppAdapters['editing']>;
