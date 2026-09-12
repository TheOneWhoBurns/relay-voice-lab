import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaults, toolInfo, validateConfig, liveInstructions } from '../config.mjs';
import { Store } from '../store.mjs';
import { executeTool, schemas } from '../agent.mjs';
import { availability } from '../agenda.mjs';
import { callMetrics } from '../metrics.mjs';

function fixture(){
  const store=new Store(mkdtempSync(join(tmpdir(),'alo-test-')));
  const call={id:'test-call',mode:'outbound',status:'connected',config:structuredClone(defaults.outbound)};
  return {store,call};
}
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
test('facts are in voice context; disabled tools disappear from capability list',()=>{
  const c=structuredClone(defaults.outbound);c.tools.submit_appointment=false;
  const instructions=liveInstructions(c);
  assert.ok(instructions.includes(c.business.facts));
  assert.ok(!instructions.split('Backend tools:')[1].includes('- submit_appointment:'));
  assert.ok(!instructions.includes('lookup_business'));
  assert.ok(defaults.outbound.greeting.endsWith('Ya estás hablando con él.'));
  assert.ok(defaults.outbound.greeting.split(' ').length<=24);
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
