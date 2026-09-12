import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaults } from './config.mjs';
export class Store {
  constructor(dir) { this.dir = dir; mkdirSync(dir,{recursive:true,mode:0o700}); this.path=resolve(dir,'state.json'); this.state=existsSync(this.path)?JSON.parse(readFileSync(this.path,'utf8')):{profiles:structuredClone(defaults),records:[],calls:[]}; }
  save() { const temp=this.path+'.tmp'; writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600}); renameSync(temp,this.path); }
  record(callId, mode, tool, data) {
    const existing=this.state.records.find(r=>r.callId===callId && r.tool===tool && JSON.stringify(r.data)===JSON.stringify(data));
    if(existing) return { ...existing, duplicate:true };
    const item={id:randomUUID(),callId,mode,tool,data,createdAt:new Date().toISOString()}; this.state.records.unshift(item); this.save(); return item;
  }
  saveCall(call) { const safe={id:call.id,mode:call.mode,startedAt:call.startedAt,endedAt:call.endedAt,status:call.status,model:call.config.model,transcript:call.transcript,usage:call.usage,backendUsage:call.backendUsage,activity:call.activity}; const i=this.state.calls.findIndex(c=>c.id===call.id); if(i<0)this.state.calls.unshift(safe);else this.state.calls[i]=safe;this.save(); }
}
