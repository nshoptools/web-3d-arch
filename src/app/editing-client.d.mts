import type {EditorInput,RevisionToken,GestureCommand,PreparedEdit,EditResult,Progress} from '../editing/index.mjs';
export interface EditingRPCControl {signal?:AbortSignal;onProgress?:(progress:Progress)=>void}
export interface EditingClient {
 version:'arch-raster-edit/1';
 initialize(input:EditorInput,control?:EditingRPCControl):Promise<RevisionToken>;
 prepare(command:GestureCommand,control?:EditingRPCControl):Promise<PreparedEdit>;
 commit(id:string,expected:RevisionToken,control?:EditingRPCControl):Promise<EditResult>;
 cancel(id:string):Promise<{cancelled:boolean}>;
 dispose():void;
}
export interface EditingClientOptions {workerURL?:URL;workerFactory?:(url:URL)=>Worker;urlOrigin?:string;timeoutMs?:number}
export function createEditingClient(options?:EditingClientOptions):EditingClient;
