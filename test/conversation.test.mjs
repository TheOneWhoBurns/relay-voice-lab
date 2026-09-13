import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createConversation } from '../conversation.mjs';

function setup(run){
  const call={config:{model:'test'},transcript:[],results:[]},events=[],logs=[];
  const controller=createConversation({call,quietMs:15,run,send:e=>{events.push(e);return true;},log:(type,data)=>logs.push({type,...data}),save:()=>{}});
  const input=delta=>controller.transcript({type:'session.input_transcript.delta',delta,start_ms:0,end_ms:200});
  return {call,controller,input,events,logs};
}
const decision={direction:'Answer the caller.',substance:'Podemos revisar ese caso.',actions:[]};
test('two caller turns get two spoken results without any native delegation event',async()=>{
  let runs=0;const f=setup(async()=>{runs++;return decision;});
  try{
    f.input('Sí,');f.input(' con él estás hablando.');await delay(50);
    assert.equal(runs,1);assert.equal(f.events.at(-1).type,'session.commentary.append');assert.equal(f.events.at(-1).delegation_id,null);
    f.input(' ¿Cómo funciona?');await delay(50);
    assert.equal(runs,2);assert.equal(f.events.filter(e=>e.type==='session.commentary.append').length,2);
  }finally{f.controller.close();}
});
test('native delegation and transcript timeout coalesce into one task',async()=>{
  let runs=0;const f=setup(async()=>{runs++;return decision;});
  try{
    f.input('Una consulta.');f.controller.delegation({delegation:{id:'real-id'}});await delay(50);
    assert.equal(runs,1);assert.equal(f.events.at(-1).delegation_id,'real-id');
    f.controller.delegation({delegation:{id:'real-id'}});await delay(25);assert.equal(runs,1);
  }finally{f.controller.close();}
});
test('late native delegation is resolved from the exact completed caller revision',async()=>{
  let runs=0;const f=setup(async()=>{runs++;return decision;});
  try{
    f.input('Sí, con él habla.');await delay(50);
    assert.equal(runs,1);assert.equal(f.events.at(-1).delegation_id,null);
    f.controller.delegation({delegation:{id:'late-id'}});await delay(25);
    assert.equal(runs,1);assert.equal(f.events.at(-1).delegation_id,'late-id');
    assert.equal(f.events.at(-1).type,'session.thinking.append');
    assert.equal(f.events.filter(e=>e.type==='session.commentary.append').length,1);
    assert.ok(f.logs.some(x=>x.type==='delegation.reused'));
  }finally{f.controller.close();}
});
test('new speech supersedes pending result and schedules itself without another delegation',async()=>{
  let resolveFirst,runs=0;const f=setup(async()=>{if(++runs===1)return new Promise(r=>resolveFirst=r);return {...decision,substance:'La solicitud actual es jueves.'};});
  try{
    f.input('Martes.');await delay(25);f.input(' Mejor jueves.');resolveFirst(decision);await delay(60);
    assert.equal(runs,2);assert.equal(f.events.filter(e=>e.type==='session.commentary.append').length,1);
    assert.equal(f.events.at(-1).content,'La solicitud actual es jueves.');
  }finally{f.controller.close();}
});
test('hangup cancels scheduled work',async()=>{
  let runs=0;const f=setup(async()=>{runs++;return decision;});f.input('Sí.');f.controller.close();await delay(40);assert.equal(runs,0);
});
