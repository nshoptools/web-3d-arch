import type {Control,DomainState,SourceDescriptor,ProductTransactionsAdapter} from '../app/adapters.mjs';
import type {createProductSourceContexts} from './product-source-contexts.mjs';
import type {AppCommand as Command} from '../contracts/app-bridge.js';
export function previewProductCommand(state:DomainState,command:Command):DomainState;
export function createProductTransactions(options:{sourceContexts:ReturnType<typeof createProductSourceContexts>;context:()=>{state:DomainState;sessionKey:string;userId:string;projectId:string}|null}):ProductTransactionsAdapter;
