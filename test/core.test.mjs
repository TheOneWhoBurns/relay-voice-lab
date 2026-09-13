import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaults, toolInfo, validateConfig, liveInstructions, backendInstructions, researchContext } from '../config.mjs';
import { salesResearchContext } from '../sales-context.mjs';
import { Store } from '../store.mjs';
import { executeTool, schemas } from '../agent.mjs';
import { availability } from '../agenda.mjs';
import { callMetrics } from '../metrics.mjs';
import { parseDecision, decisionEvents, callerRevision, verifyDecisionActions, resolveLateDelegation } from '../handoff.mjs';
import { buildBackendContext, liveContextState, transcriptTurns } from '../context.mjs';

function fixture(){
  const store=new Store(mkdtempSync(join(tmpdir(),'alo-test-')));
  const call={id:'test-call',mode:'outbound',status:'connected',config:structuredClone(defaults.outbound)};
  return {store,call};
}
test('full research is front-loaded into every backend mode, not the Live prompt',()=>{
  for(const mode of ['outbound','inbound']){
    const config=validateConfig(structuredClone(defaults[mode]));
    const backend=backendInstructions(config,mode),live=liveInstructions(config,mode);
    assert.ok(backend.startsWith(salesResearchContext));
    assert.equal(backend.split(salesResearchContext).length-1,1);
    for(const doi of ['10.1080/08351813.2020.1739432','10.1177/0261927X231185520','10.1093/jcr/ucaa038','10.1016/j.jbusres.2019.04.048']){
      assert.ok(backend.includes(doi));assert.ok(!live.includes(doi));
    }
    assert.ok(backend.includes(config.backendPrompt));
    assert.ok(backend.includes(config.business.facts.replaceAll('\n','\\n')));
    assert.ok(!backend.includes(config.prompt));
    assert.ok(backend.includes('Eres Pi, no el vendedor Live ni el Caller'));
    assert.ok(backend.includes('No devolver el ensayo'));
    assert.ok(backend.includes(mode==='inbound'?'ENTRANTE: recepción administrativa; no vender Aló.':'SALIENTE: venta de Aló al comprador.'));
    assert.ok(live.startsWith(config.prompt));
    assert.equal(researchContext.backend,salesResearchContext);
  }
});
test('research loads even for an existing custom backend profile without mutating it',()=>{
  const config=structuredClone(defaults.outbound);config.backendPrompt='Custom backend task instructions';
  const before=structuredClone(config),result=backendInstructions(config,'outbound');
  assert.ok(result.startsWith(salesResearchContext));assert.ok(result.includes('Custom backend task instructions'));
  assert.deepEqual(config,before);
});
test('exactly three tools; removed tools cannot execute even with stale permissions',()=>{
  const names=['check_availability','save_lead','submit_appointment'];
  assert.deepEqual(Object.keys(toolInfo).sort(),names);
  assert.deepEqual(Object.keys(schemas).sort(),names);
  const {store,call}=fixture();
  for(const name of ['record_note','record_outcome','take_message','lookup_business','list_appointments','reschedule_appointment','cancel_appointment','request_callback']){
    call.config.tools[name]=true;
    assert.throws(()=>executeTool(call,store,name,{}),/removed/);
  }
  assert.equal(store.state.records.length,0);
});
test('mode settings isolate; validation strips stale tools and rejects invalid settings',()=>{
  const a=validateConfig(structuredClone(defaults.outbound));
  a.tools.save_lead=false;
  assert.equal(defaults.inbound.tools.save_lead,true);
  assert.throws(()=>validateConfig({...a,model:'invalid'}));
  assert.throws(()=>validateConfig({...a,maxMinutes:100}));
  assert.throws(()=>validateConfig({...a,business:{...a.business,timezone:'bad'}}));
  assert.equal(Object.keys(validateConfig({...a,tools:{...a.tools,record_note:true}}).tools).length,3);
  assert.notEqual(defaults.inbound.prompt,defaults.outbound.prompt);
});
test('facts stay in Pi; Live delegates decisions even with all action tools disabled',()=>{
  const c=structuredClone(defaults.outbound);c.tools.submit_appointment=false;
  const instructions=liveInstructions(c);
  assert.ok(!instructions.includes(c.business.facts));
  assert.ok(instructions.includes('No des consejo clínico'));
  assert.ok(instructions.includes('herramientas habilitadas (check_availability, save_lead)'));
  assert.ok(!instructions.includes('lookup_business'));
  assert.equal(defaults.outbound.greeting,'¿Y si todos tus pacientes llamaran a la vez… y cada uno recibiera atención como si fuera el único?');
  assert.ok(!defaults.outbound.greeting.includes('Ya estás hablando con él'));
  assert.ok(!defaults.outbound.backendPrompt.includes('Ya estás hablando con él'));
  assert.ok(!JSON.stringify(defaults).includes('Alex'));
  assert.ok(backendInstructions(c).includes('DIRECCIÓN COMERCIAL APROBADA'));
  assert.ok(!backendInstructions(defaults.inbound,'inbound').includes('DIRECCIÓN COMERCIAL APROBADA'));
  assert.ok(defaults.outbound.greeting.split(' ').length<=24);
  for(const key of Object.keys(c.tools))c.tools[key]=false;
  const noTools=liveInstructions(c);
  assert.ok(noTools.includes('herramientas habilitadas (ninguna)'));
  assert.ok(noTools.includes('guarda silencio'));
  assert.ok(noTools.includes('Un momento'));
  assert.ok(noTools.includes('Un silencio corto es correcto'));
  assert.ok(liveInstructions(c,'inbound').includes('Modo: recepción administrativa; no vender Aló'));
  assert.ok(Buffer.byteLength(instructions)<5000);
});
test('Pi handoff sends one speech append and keeps private direction off Live context',()=>{
  const decision={direction:'Cover payment-time calls; do not pitch growth.',substance:'Calls can be answered while reception takes payment.',actions:[]};
  assert.deepEqual(parseDecision(JSON.stringify(decision)),decision);
  const events=decisionEvents(decision,'opaque-id');
  assert.equal(events.length,1);
  assert.equal(events[0].type,'session.commentary.append');
  assert.equal(events[0].content,decision.substance);
  assert.ok(!events[0].content.includes(decision.direction));
  for(const event of events){assert.equal(event.delegation_id,'opaque-id');assert.ok(Buffer.byteLength(event.content)<=450);}
  for(const bad of ['not JSON','null','[]',JSON.stringify({...decision,extra:'x'}),JSON.stringify({...decision,direction:''}),JSON.stringify({...decision,substance:'á'.repeat(226)})])assert.throws(()=>parseDecision(bad));
});
test('action claims require matching records from this call, never fabricated or other-call IDs',()=>{
  const record={id:'real-id',callId:'this-call',tool:'save_lead'};
  const decision={direction:'Confirm only.',substance:'Nota guardada localmente.',actions:[{tool:'save_lead',recordId:'real-id'}]};
  assert.equal(verifyDecisionActions(decision,[record],'this-call'),decision);
  assert.throws(()=>verifyDecisionActions(decision,[],'this-call'),/matching verified record/);
  assert.throws(()=>verifyDecisionActions(decision,[record],'different-call'),/matching verified record/);
  assert.throws(()=>verifyDecisionActions({...decision,actions:[{tool:'submit_appointment',recordId:'real-id'}]},[record],'this-call'),/matching verified record/);
  assert.throws(()=>verifyDecisionActions({...decision,actions:[]},[],'this-call'),/verified record reference/);
  assert.ok(decisionEvents(decision,'delegation').every(e=>!e.content.includes('real-id')));
});
test('caller revision ignores voice output and late delegation is resolved silently',()=>{
  const call={transcript:[{speaker:'Caller',delta:'Tuesday'},{speaker:'Alex',delta:'Checking.'}]};
  const revision=callerRevision(call);call.transcript.push({speaker:'Alex',delta:'One moment.'});
  assert.equal(callerRevision(call),revision);
  call.transcript.push({speaker:'Caller',delta:'Actually Thursday.'});
  assert.notEqual(callerRevision(call),revision);
  const event=resolveLateDelegation('task-id');
  assert.equal(event.type,'session.thinking.append');
  assert.equal(event.delegation_id,'task-id');
  assert.match(event.content,/Stay silent/);
});

test('backend context keeps latest complete turns and bounds decisions and records',()=>{
  const transcript=[];
  for(let i=0;i<20;i++)transcript.push({speaker:i%2?'Voice':'Caller',delta:`turn ${i} `+'x'.repeat(80),start_ms:i*1000});
  const results=Array.from({length:12},(_,i)=>({direction:`d${i}`,substance:`s${i}`,actions:[]}));
  const records=Array.from({length:30},(_,i)=>({id:`r${i}`,callId:'bounded',tool:'save_lead',data:{i},createdAt:'now'}));
  const context=buildBackendContext({id:'bounded',transcript,results},records,{transcriptBytes:520,decisionCount:3,recordCount:4});
  assert.equal(context.stats.turns,20);assert.ok(context.stats.omittedTurns>0);
  assert.ok(Buffer.byteLength(context.transcript,'utf8')<700);
  assert.deepEqual(context.decisions.map(d=>d.direction),['d9','d10','d11']);
  assert.deepEqual(context.records.map(r=>r.id),['r0','r1','r2','r3']);
  assert.match(context.transcript,/turn 19/);
  assert.equal(transcriptTurns([{speaker:'Caller',delta:' hola '},{speaker:'Caller',delta:' mundo '}])[0].text,'hola mundo');
});

test('Live context usage is clamped and enters the documented compaction band at 90%',()=>{
  assert.equal(liveContextState(undefined),null);
  assert.deepEqual({...liveContextState({usage_ratio:.74}),updatedAt:null},{usageRatio:.74,band:'normal',changed:false,updatedAt:null});
  assert.equal(liveContextState({usage_ratio:.75}).band,'elevated');
  const compacting=liveContextState({usage_ratio:.91},'elevated');
  assert.equal(compacting.band,'compacting');assert.equal(compacting.changed,true);
  assert.equal(liveContextState({usage_ratio:2}).usageRatio,1);
});
test('lead permissions, persistence and retry deduplication',()=>{
  const {store,call}=fixture(),args={outcome:'interested',detail:'Needs missed-call coverage.'};
  call.config.tools.save_lead=false;
  assert.throws(()=>executeTool(call,store,'save_lead',args),/disabled/);
  call.config.tools.save_lead=true;
  const a=executeTool(call,store,'save_lead',args),b=executeTool(call,store,'save_lead',args);
  assert.equal(a.recordId,b.recordId);assert.equal(b.duplicate,true);
  assert.equal(JSON.parse(readFileSync(store.path)).records.length,1);
});
test('do-not-contact can be saved without demanding personal details',()=>{
  const {store,call}=fixture();
  executeTool(call,store,'save_lead',{outcome:'do_not_contact',detail:'Caller asked not to call again.'});
  assert.equal(store.state.records[0].data.outcome,'do_not_contact');
  assert.equal(store.state.records[0].data.contact,undefined);
});
test('bookings require confirmation, timezone, a real date and checked availability',()=>{
  const {store,call}=fixture(),slot=availability(store,call.config.business).slots[0];
  const args={name:'Test',contact:'demo@example.com',...slot,purpose:'Sales meeting',confirmed:true};
  assert.throws(()=>executeTool(call,store,'submit_appointment',{...args,confirmed:false}),/confirmation/);
  assert.throws(()=>executeTool(call,store,'submit_appointment',{...args,timezone:'bad'}),/zona horaria/);
  assert.throws(()=>executeTool(call,store,'submit_appointment',{...args,date:'2026-02-31'}),/Invalid/);
  assert.throws(()=>executeTool(call,store,'submit_appointment',args),/check_availability/);
  executeTool(call,store,'check_availability',{});
  assert.equal(executeTool(call,store,'submit_appointment',args).status,'booked');
  assert.equal(new Store(store.dir).state.appointments.length,1);
});
test('hangup and abort prevent late mutations',()=>{
  const {store,call}=fixture();call.ending=true;
  const args={outcome:'interested',detail:'late'};
  assert.throws(()=>executeTool(call,store,'save_lead',args),/canceled/);
  call.ending=false;
  assert.throws(()=>executeTool(call,store,'save_lead',args,AbortSignal.abort()),/canceled/);
  assert.equal(store.state.records.length,0);
});
test('booking retries deduplicate; collisions and replacement bookings are rejected',()=>{
  const {store,call}=fixture(),slots=executeTool(call,store,'check_availability',{}).slots;
  const args={...slots[0],name:'Demo',contact:'demo@example.com',purpose:'Sales meeting',confirmed:true};
  executeTool(call,store,'submit_appointment',args);
  assert.equal(executeTool(call,store,'submit_appointment',args).duplicate,true);
  assert.throws(()=>executeTool({...call,id:'other'},store,'submit_appointment',{...args,contact:'other@example.com'}),/disponible/);
  assert.throws(()=>executeTool(call,store,'submit_appointment',{...args,...slots[1]}),/seguimiento/);
  assert.equal(store.state.appointments.length,1);
});
test('availability excludes past, closed and out-of-horizon times without creating records',()=>{
  const {store,call}=fixture();
  assert.deepEqual(availability(store,call.config.business,'2020-01-01').slots,[]);
  assert.deepEqual(availability(store,call.config.business,'2026-09-13',new Date('2026-09-12T12:00:00Z')).slots,[]);
  executeTool(call,store,'check_availability',{});
  assert.equal(store.state.records.length,0);
});
test('cost uses cumulative duration once and tracks lead outcomes',()=>{
  const records=[{callId:'a',tool:'save_lead',data:{outcome:'interested'}}];
  const m=callMetrics({id:'a',status:'closed',config:{voiceRate:.05},usage:{seconds:90},backendUsage:[{usage:{cost:{total:.02}}},{costKnown:false,usage:{cost:{total:0}}}],activity:[]},records);
  assert.equal(m.voiceCost,.075);assert.equal(m.estimatedTotal,.095);
  assert.equal(m.backendCostComplete,false);assert.equal(m.finalized,true);
  assert.equal(m.leads,1);assert.deepEqual(m.outcomes,['interested']);
});
test('lean migration backs up removed settings and keeps records, appointments and preferences',()=>{
  const dir=mkdtempSync(join(tmpdir(),'alo-migration-'));
  const old={profiles:structuredClone(defaults),schemaVersion:2,pitchRevision:'alo-direct-sales-2',calls:[{id:'call-keep'}],records:[{id:'keep'}],appointments:[{id:'booking-keep'}]};
  old.profiles.outbound.prompt='Original operator prompt';
  old.profiles.outbound.model='openai:gpt-5.6-terra';
  old.profiles.outbound.tools={check_availability:false,submit_appointment:false,record_note:true};
  writeFileSync(join(dir,'state.json'),JSON.stringify(old));
  const s=new Store(dir);
  assert.equal(s.state.records[0].id,'keep');assert.equal(s.state.calls[0].id,'call-keep');assert.equal(s.state.appointments[0].id,'booking-keep');
  assert.equal(s.state.profiles.outbound.model,'openai:gpt-5.6-terra');
  assert.deepEqual(s.state.profiles.outbound.tools,{check_availability:false,submit_appointment:false,save_lead:true});
  const backup=readdirSync(dir).find(f=>f.startsWith('state-before-lean'));
  assert.equal(JSON.parse(readFileSync(join(dir,backup))).profiles.outbound.prompt,'Original operator prompt');
  s.state.profiles.outbound.greeting='Custom opening after migration';s.save();
  assert.equal(new Store(dir).state.profiles.outbound.greeting,'Custom opening after migration');
});
test('sales revision updates only outbound copy once and preserves all other operator settings',()=>{
  const {store}=fixture();
  delete store.state.salesRevision;
  store.state.profiles.outbound.prompt='Old sales prompt';
  store.state.profiles.outbound.greeting='Old hook';
  store.state.profiles.outbound.tools.save_lead=false;
  store.state.profiles.outbound.business.facts='Custom approved facts';
  store.state.profiles.inbound.prompt='Custom receptionist instructions';
  store.state.profiles.inbound.greeting='Custom inbound greeting';
  const outbound=structuredClone(store.state.profiles.outbound),inbound=structuredClone(store.state.profiles.inbound);
  store.save();
  const migrated=new Store(store.dir);
  assert.deepEqual(migrated.state.profiles.inbound,inbound);
  assert.deepEqual(migrated.state.profiles.outbound,{...outbound,prompt:defaults.outbound.prompt,greeting:defaults.outbound.greeting});
  const backups=readdirSync(store.dir).filter(f=>f.startsWith('state-before-sales'));
  assert.ok(backups.some(f=>JSON.parse(readFileSync(join(store.dir,f))).profiles.outbound.greeting==='Old hook'));
  migrated.state.profiles.outbound.greeting='Later operator edit';migrated.save();
  assert.equal(new Store(store.dir).state.profiles.outbound.greeting,'Later operator edit');
});
test('clinic target migration replaces the scenario without deleting history or preferences',()=>{
  const {store}=fixture();delete store.state.targetRevision;
  store.state.profiles.outbound.business.name='Previous demo business';
  store.state.profiles.outbound.tools.save_lead=false;
  store.state.profiles.inbound.model='openai:gpt-5.6-terra';
  store.state.appointments.push({id:'keep-booking',business:'Previous demo business'});
  store.state.records.push({id:'keep-record'});store.save();
  const next=new Store(store.dir);
  assert.equal(next.state.profiles.outbound.business.name,'Clínica Aurora · demo');
  assert.equal(next.state.profiles.inbound.business.name,'Clínica Aurora · demo');
  assert.equal(next.state.profiles.outbound.tools.save_lead,false);
  assert.equal(next.state.profiles.inbound.model,'openai:gpt-5.6-terra');
  assert.equal(next.state.appointments[0].id,'keep-booking');
  assert.equal(next.state.records[0].id,'keep-record');
  assert.match(next.state.profiles.inbound.business.facts,/No solicitar ni registrar síntomas/);
  assert.ok(!/taller|frenos|aceite/i.test(JSON.stringify(next.state.profiles)));
  const backups=readdirSync(store.dir).filter(f=>f.startsWith('state-before-target'));
  assert.ok(backups.some(f=>JSON.parse(readFileSync(join(store.dir,f))).profiles.outbound.business.name==='Previous demo business'));
  next.state.profiles.inbound.business.name='Later edit';next.save();
  assert.equal(new Store(store.dir).state.profiles.inbound.business.name,'Later edit');
});
test('role migration preserves custom instructions, opening, disabled tools and history',()=>{
  const {store}=fixture();delete store.state.roleRevision;
  store.state.profiles.outbound.prompt='Custom voice';store.state.profiles.outbound.backendPrompt='Custom strategy';
  store.state.profiles.outbound.greeting='Custom hook';store.state.profiles.outbound.tools.save_lead=false;
  store.state.records.push({id:'keep-role-record'});store.save();
  const before=structuredClone(store.state.profiles),next=new Store(store.dir);
  assert.deepEqual(next.state.profiles,before);assert.equal(next.state.records.at(-1).id,'keep-role-record');
  assert.equal(next.state.roleRevision,'pi-director-1');
  assert.ok(readdirSync(store.dir).some(f=>f.startsWith('state-before-roles')));
});
test('opening revision replaces the rejected shipped opening once and preserves other settings',()=>{
  const {store}=fixture();delete store.state.openingRevision;
  store.state.profiles.outbound.greeting='Hola, soy Alex de Aló. Te ofrezco convertir llamadas de nuevos pacientes en citas de valoración. ¿Quién las atiende ahora?';
  store.state.profiles.outbound.tools.save_lead=false;
  store.state.profiles.inbound.greeting='Custom reception opening';
  const inbound=structuredClone(store.state.profiles.inbound);store.save();
  const next=new Store(store.dir);
  assert.equal(next.state.profiles.outbound.greeting,defaults.outbound.greeting);
  assert.equal(next.state.profiles.outbound.tools.save_lead,false);
  assert.deepEqual(next.state.profiles.inbound,inbound);
  assert.ok(readdirSync(store.dir).some(f=>f.startsWith('state-before-opening-')));
  next.state.profiles.outbound.greeting='Later custom edit';next.save();
  assert.equal(new Store(store.dir).state.profiles.outbound.greeting,'Later custom edit');
});
