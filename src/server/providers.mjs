import { endpoint } from './network.mjs';
import { fail, str, canonical } from './core.mjs';
export class Providers {
  constructor(adapters=[],{testOnly=false}={}) {
    this.map=new Map();
    for(const adapter of adapters) {
      const m=adapter.metadata;
      for(const v of [m.id,m.version,m.endpointId])str(v,80);
      fail(!this.map.has(m.id)&&(!m.testOnly||testOnly),500,'PROVIDER_REGISTRATION_INVALID');
      endpoint(m.endpointUrl,{testOnly:testOnly&&m.testOnly});
      fail(Array.isArray(m.models)&&m.models.length>0&&m.models.length<=50,500,'PROVIDER_MODELS_REQUIRED');
      for(const model of m.models){str(model.id,100);str(model.version,100);}
      fail(typeof adapter.quote==='function'&&typeof adapter.submit==='function',500,'PROVIDER_INTERFACE_INVALID');
      canonical(m);
      this.map.set(m.id,adapter);
    }
  }
  get(id) {const a=this.map.get(id);fail(a,422,'PROVIDER_UNSUPPORTED');return a;}
  list() {return [...this.map.values()].map(a=>structuredClone(a.metadata));}
}

