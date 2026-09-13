import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
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
    if(this.state.salesRevision!=='problem-led-1'){
      writeFileSync(resolve(dir,`state-before-sales-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      this.state.profiles.outbound.prompt=defaults.outbound.prompt;
      this.state.profiles.outbound.greeting=defaults.outbound.greeting;
      this.state.salesRevision='problem-led-1';
    }
    if(this.state.targetRevision!=='aesthetic-clinic-1'){
      writeFileSync(resolve(dir,`state-before-target-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      for(const mode of ['outbound','inbound']){
        const p=this.state.profiles[mode];
        p.business=structuredClone(defaults[mode].business);
        p.prompt=defaults[mode].prompt;p.greeting=defaults[mode].greeting;
      }
      this.state.targetRevision='aesthetic-clinic-1';
    }
    if(this.state.roleRevision!=='pi-director-1'){
      writeFileSync(resolve(dir,`state-before-roles-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      // Only replace exact shipped defaults. Preserve custom prompts and all records.
      const oldVoice={outbound:'21b26a665644846f32b9434e77770cdc2e251f77dde10b545997e44415eb3f9d',inbound:'84c2d0c491acfa9beabf804fec931a457fce51b422cff326f8060bc7512bd083'};
      for(const mode of ['outbound','inbound']){
        const p=this.state.profiles[mode],hash=value=>createHash('sha256').update(value).digest('hex');
        if(hash(p.prompt)===oldVoice[mode])p.prompt=defaults[mode].prompt;
        if(hash(p.backendPrompt)==='41ba525530a07bc384d14d7fd7572740c127f90e0b0733bab14161092f5f4b48')p.backendPrompt=defaults[mode].backendPrompt;
      }
      this.state.roleRevision='pi-director-1';
    }
    if(this.state.openingRevision!=='individual-attention-1'){
      writeFileSync(resolve(dir,`state-before-opening-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      const shipped={
        outbound:{prompt:'a179a410ed6b4832778dcd87e54b8dd5b628a8c1572ce353a540de90a8314184',backendPrompt:'4d76ac073792d812f704907841b9c108e46a09b5dcf6f5f44504b32c7336a99a',greeting:'7d2229f4005d0587c411378b7b6eb9b25cbe8c02792ec6b9b919eaf2127a88d0'},
        inbound:{prompt:'f965d1c6b0466a1b8f870fe5b07f2de11a36f0e6dae84cbc45fbd9087d53ca44',backendPrompt:'4d76ac073792d812f704907841b9c108e46a09b5dcf6f5f44504b32c7336a99a',greeting:'93347bf3f2cc330cfed3a1a0b59fb75cd3626374bb51e3cda7c89f58a939cf7b'},
      };
      for(const mode of ['outbound','inbound'])for(const field of ['prompt','backendPrompt','greeting']){
        const p=this.state.profiles[mode];
        if(createHash('sha256').update(p[field]).digest('hex')===shipped[mode][field])p[field]=defaults[mode][field];
      }
      this.state.openingRevision='individual-attention-1';
    }
    if(this.state.liveReliabilityRevision!=='silence-context-1'){
      writeFileSync(resolve(dir,`state-before-live-reliability-${Date.now()}.json`),JSON.stringify(this.state,null,2),{mode:0o600});
      // Replace only the previously shipped voice prompts. Custom operator
      // prompts, openings, voices, models, tools and business facts are kept.
      const previous={outbound:'9f1a21f11fea81bc19d5bb51c59a557c92f29cf6d54ade091353e2d9712ed469',inbound:'dd9ba84b7fcfe57acae18783739ca2049a2500617cc6fff4279bdc290460b950'};
      for(const mode of ['outbound','inbound']){
        const prompt=this.state.profiles[mode].prompt;
        if(createHash('sha256').update(prompt).digest('hex')===previous[mode])this.state.profiles[mode].prompt=defaults[mode].prompt;
      }
      this.state.liveReliabilityRevision='silence-context-1';
    }
    this.state.appointments??=[];this.save();
  }
  save() { const temp=this.path+'.tmp'; writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600}); renameSync(temp,this.path); }
  clearDemoData() {
    const backup=resolve(this.dir,`state-before-clear-${Date.now()}.json`);
    writeFileSync(backup,JSON.stringify(this.state,null,2),{mode:0o600});
    this.state.records=[];this.state.appointments=[];this.state.calls=[];this.save();
    return backup;
  }
  record(callId, mode, tool, data) {
    const existing=this.state.records.find(r=>r.callId===callId && r.tool===tool && JSON.stringify(r.data)===JSON.stringify(data));
    if(existing) return { ...existing, duplicate:true };
    const item={id:randomUUID(),callId,mode,tool,data,createdAt:new Date().toISOString()}; this.state.records.unshift(item); this.save(); return item;
  }
  saveCall(call) { const safe={id:call.id,mode:call.mode,startedAt:call.startedAt,endedAt:call.endedAt,status:call.status,model:call.config.model,voiceRate:call.config.voiceRate,business:call.config.business?.name,transcript:call.transcript,usage:call.usage,contextWindow:call.contextWindow,backendUsage:call.backendUsage,activity:call.activity,metrics:callMetrics(call,this.state.records)}; const i=this.state.calls.findIndex(c=>c.id===call.id); if(i<0)this.state.calls.unshift(safe);else this.state.calls[i]=safe;this.save(); }
}
