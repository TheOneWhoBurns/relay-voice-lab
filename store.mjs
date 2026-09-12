import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaults } from './config.mjs';
import { callMetrics } from './metrics.mjs';
export class Store {
  constructor(dir) {
    this.dir=dir;mkdirSync(dir,{recursive:true,mode:0o700});this.path=resolve(dir,'state.json');
    this.state=existsSync(this.path)?JSON.parse(readFileSync(this.path,'utf8')):{profiles:structuredClone(defaults),records:[],calls:[],schemaVersion:2,pitchRevision:'alo-direct-sales-2'};
    if(!this.state.schemaVersion||this.state.schemaVersion<2){
      // Keep the complete previous state before applying the requested Spanish demo profiles.
      writeFileSync(resolve(dir,`state-before-demo-v2-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      for(const mode of ['outbound','inbound']){const old=this.state.profiles[mode];this.state.profiles[mode]={...structuredClone(defaults[mode]),model:old.model,voice:old.voice,maxMinutes:old.maxMinutes,tools:{...defaults[mode].tools,...old.tools}};}
      this.state.schemaVersion=2;
    }
    if(this.state.pitchRevision!=='alo-direct-sales-2'){
      writeFileSync(resolve(dir,`state-before-pitch-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      this.state.profiles.outbound.prompt=defaults.outbound.prompt;
      this.state.profiles.outbound.greeting=defaults.outbound.greeting;
      for(const mode of ['outbound','inbound']){
        const p=this.state.profiles[mode];
        p.prompt=p.prompt.replaceAll('Relay','Aló');p.greeting=p.greeting.replaceAll('Relay','Aló');
        p.backendPrompt=p.backendPrompt.replaceAll('Relay','Aló').replace('La llamada es la demostración del producto, antes de solicitar una reunión comercial.','En modo saliente ayudas a vender Aló directamente; no pidas roleplay ni exijas otra demostración antes de una reunión. En modo entrante ayudas a atender al cliente del negocio.').replace('Devuelve hechos, estado de la acción y siguiente paso en español y en menos de 100 palabras.','Devuelve un resultado breve y natural, de menos de 60 palabras. No uses encabezados como Hechos, Estado o Siguiente paso.');
        p.business.brief=p.business.brief.replaceAll('Relay','Aló');
      }
      this.state.pitchRevision='alo-direct-sales-2';
    }
    if(this.state.demoRevision!=='lean-booking-1'){
      writeFileSync(resolve(dir,`state-before-lean-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      for(const mode of ['outbound','inbound']){
        const p=this.state.profiles[mode],old=p.tools;
        p.prompt=defaults[mode].prompt;p.backendPrompt=defaults[mode].backendPrompt;p.greeting=defaults[mode].greeting;
        p.tools={check_availability:old.check_availability??true,submit_appointment:old.submit_appointment??true,save_lead:old.save_lead??['record_note','record_outcome','take_message','request_callback'].some(k=>old[k]===true)};
      }
      this.state.demoRevision='lean-booking-1';
    }
    this.state.appointments??=[];this.save();
  }
  save() { const temp=this.path+'.tmp'; writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600}); renameSync(temp,this.path); }
  record(callId, mode, tool, data) {
    const existing=this.state.records.find(r=>r.callId===callId && r.tool===tool && JSON.stringify(r.data)===JSON.stringify(data));
    if(existing) return { ...existing, duplicate:true };
    const item={id:randomUUID(),callId,mode,tool,data,createdAt:new Date().toISOString()}; this.state.records.unshift(item); this.save(); return item;
  }
  saveCall(call) { const safe={id:call.id,mode:call.mode,startedAt:call.startedAt,endedAt:call.endedAt,status:call.status,model:call.config.model,voiceRate:call.config.voiceRate,business:call.config.business?.name,transcript:call.transcript,usage:call.usage,backendUsage:call.backendUsage,activity:call.activity,metrics:callMetrics(call,this.state.records)}; const i=this.state.calls.findIndex(c=>c.id===call.id); if(i<0)this.state.calls.unshift(safe);else this.state.calls[i]=safe;this.save(); }
}
