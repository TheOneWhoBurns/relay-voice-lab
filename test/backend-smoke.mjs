// Opt-in paid integration check; stores test records in a temporary directory.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../store.mjs';
import { defaults } from '../config.mjs';
import { runBackend } from '../agent.mjs';
const store=new Store(mkdtempSync(join(tmpdir(),'relay-smoke-')));
const call={id:'smoke',mode:'outbound',status:'connected',config:structuredClone(defaults.outbound),transcript:[{speaker:'Caller',start_ms:0,delta:'Please record a note that I am interested in covering missed calls after hours.'}],backendUsage:[],results:[]};
const result=await runBackend(call,store,(type,data)=>console.log(type,data.tool||''));
console.log('Backend result:',result);
assert.equal(store.state.records.length,1);assert.equal(store.state.records[0].tool,'record_note');console.log(JSON.stringify({result,records:store.state.records.length,usage:call.backendUsage}));
const appointment={id:'smoke-appointment',mode:'outbound',status:'connected',config:structuredClone(defaults.outbound),transcript:[{speaker:'Caller',start_ms:0,delta:'I want the 20 minute discovery meeting on September 18, 2027 at 2 PM in America/Guayaquil. My name is Morgan Demo and my email is morgan@example.com.'},{speaker:'Alex',start_ms:100,delta:'To confirm: Morgan Demo, morgan@example.com, September 18, 2027 at 2 PM America/Guayaquil, for a 20 minute discovery meeting. Should I save that local meeting request?'},{speaker:'Caller',start_ms:200,delta:'Yes, I confirm. Save it.'}],backendUsage:[],results:[]};
console.log('Appointment:',await runBackend(appointment,store,()=>{}));assert.ok(store.state.records.some(r=>r.callId===appointment.id&&r.tool==='submit_appointment'));
const inbound={id:'smoke-inbound',mode:'inbound',status:'connected',config:{...structuredClone(defaults.inbound),model:'openai:gpt-5.6-terra'},transcript:[{speaker:'Caller',start_ms:0,delta:'Please take a message for the team: My name is Morgan Demo, email morgan@example.com. Please ask someone to contact me about after-hours coverage.'}],backendUsage:[],results:[]};
console.log('Inbound Terra:',await runBackend(inbound,store,()=>{}));assert.ok(store.state.records.some(r=>r.callId===inbound.id&&r.tool==='take_message'));console.log('All three backend scenarios passed.');
