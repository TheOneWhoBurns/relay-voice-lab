import express from 'express';
import WebSocket from 'ws';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { catalog, defaults, toolInfo, validateConfig, liveInstructions } from './config.mjs';
import { runBackend } from './agent.mjs';
import { callMetrics } from './metrics.mjs';
import { availability } from './agenda.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3210);
const store=new Store(process.env.DATA_DIR||resolve(root,'data'));
const app=express(), calls=new Map(), listeners=new Set();
let creating=false;
const origins=new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`]);
function publish(type,data={}) { const text=`data: ${JSON.stringify({type,...data})}\n\n`;for(const res of listeners)res.write(text); }
function log(call,type,data={}) { const entry={type,at:new Date().toISOString(),...data};call.activity.push(entry);publish('activity',{callId:call.id,entry}); }
function send(call,event) { if(call.socket?.readyState!==WebSocket.OPEN)return false;call.socket.send(JSON.stringify({...event,event_id:event.event_id||randomUUID()}));return true; }
function finish(call,finalized) {
  if(call.finished)return;call.finished=true;call.ending=true;call.agent?.abort();clearTimeout(call.limit);clearTimeout(call.closeTimer);clearInterval(call.heartbeat);
  call.status=finalized?'closed':'incomplete';call.endedAt=new Date().toISOString();store.saveCall(call);publish('call.ended',{callId:call.id,finalized,usage:call.usage,metrics:callMetrics(call,store.state.records)});call.socket?.close();
}
function closeCall(call) {
  if(call.finished||call.ending)return;call.ending=true;call.agent?.abort();call.status='closing';
  send(call,{type:'session.close'});call.closeTimer=setTimeout(()=>finish(call,false),15000);
}
async function delegate(call,event) {
  const id=event.delegation?.id;if(!id||call.seen.has(id)||call.ending)return;call.seen.add(id);
  // Serialize tasks so notes and appointments cannot race across delegations.
  call.queue=call.queue.then(async()=>{
    if(call.ending)return;
    log(call,'backend.started',{model:call.config.model,delegationId:id});const start=Date.now();
    try {const result=await runBackend(call,store,(t,d)=>log(call,t,d));if(call.ending)return;call.results.push(result);send(call,{type:'session.commentary.append',delegation_id:id,content:result});log(call,'backend.finished',{result,elapsedMs:Date.now()-start});}
    catch(error){ if(call.ending)return;log(call,'backend.error',{message:error.message});send(call,{type:'session.commentary.append',delegation_id:id,content:'The backend could not complete the request. Do not claim any new action succeeded. Ask the caller to retry or take a different next step.'}); }
    store.saveCall(call);
    publish('metrics',{callId:call.id,metrics:callMetrics(call,store.state.records)});
  }).catch(error=>log(call,'backend.error',{message:error.message}));
}
async function attach(call) {
  const ws=new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(call.id)}/attach`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},handshakeTimeout:15000});call.socket=ws;
  ws.on('message',raw=>{
    let event;try{event=JSON.parse(raw.toString());}catch{return;}
    if(event.type==='session.input_transcript.delta'||event.type==='session.output_transcript.delta') {
      call.transcript.push({speaker:event.type.includes('input_')?'Caller':'Alex',delta:event.delta,start_ms:event.start_ms,end_ms:event.end_ms});
    } else if(event.type==='session.delegation.created')delegate(call,event);
    else if(event.type==='session.usage.updated'){call.usage=event.usage;publish('usage',{callId:call.id,usage:call.usage,metrics:callMetrics(call,store.state.records)});}
    else if(event.type==='session.closed'){call.usage=event.usage;finish(call,true);}
    else if(event.type==='error')log(call,'voice.error',{message:event.error?.message||'Voice API error',code:event.error?.code});
  });
  ws.on('close',()=>{if(!call.finished)finish(call,false);});
  ws.on('error',()=>log(call,'connection.error',{message:'Server connection to voice session failed.'}));
  await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',()=>rej(new Error('Could not attach the backend to the voice session.')));});
  call.status='connected';call.limit=setTimeout(()=>{log(call,'call.limit',{message:'Demo call time limit reached.'});closeCall(call);},call.config.maxMinutes*60000);
  call.lastHeartbeat=Date.now();call.heartbeat=setInterval(()=>{if(Date.now()-call.lastHeartbeat>25000)closeCall(call);},5000);
}
app.disable('x-powered-by');
app.use((req,res,next)=>{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host))return res.status(403).json({error:'Local access only.'});
  res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&!origins.has(req.headers.origin))return res.status(403).json({error:'Unexpected request origin.'});
  next();
});
app.use(express.json({limit:'128kb'}));
app.get('/api/state',(_req,res)=>res.json({profiles:store.state.profiles,defaults,toolInfo,catalog:catalog.map(m=>({...m,available:m.provider==='openai'?!!process.env.OPENAI_API_KEY:!!process.env.OPENROUTER_API_KEY})),credentials:{openai:!!process.env.OPENAI_API_KEY,openrouter:!!process.env.OPENROUTER_API_KEY},records:store.state.records,appointments:store.state.appointments,calls:store.state.calls.map(({transcript,activity,...c})=>({...c,metrics:c.metrics||callMetrics(c,store.state.records)})),activeCall:[...calls.values()].find(c=>!c.finished)?.id||null}));
app.get('/api/agenda',(req,res)=>{const profile=store.state.profiles[req.query.mode||'outbound'];if(!profile)return res.status(400).json({error:'Invalid mode.'});try{res.json({...availability(store,profile.business,req.query.date),appointments:store.state.appointments.filter(a=>a.business===profile.business.name)});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/events',(req,res)=>{res.set({'Content-Type':'text/event-stream','Connection':'keep-alive'});res.flushHeaders();res.write(': connected\n\n');listeners.add(res);const t=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{listeners.delete(res);clearInterval(t);});});
app.put('/api/profiles/:mode',(req,res)=>{if(!defaults[req.params.mode])return res.status(400).json({error:'Invalid mode.'});try{store.state.profiles[req.params.mode]=validateConfig(req.body);store.save();res.json({saved:true});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/calls/:id',(req,res)=>{const call=store.state.calls.find(c=>c.id===req.params.id);return call?res.json({...call,metrics:call.metrics||callMetrics(call,store.state.records)}):res.status(404).json({error:'Call not found.'});});
app.post('/api/session',async(req,res)=>{
  if(creating||[...calls.values()].some(c=>!c.finished))return res.status(409).json({error:'A call is already active. End it before starting another.'});
  const {mode,sdp}=req.body;if(!defaults[mode]||typeof sdp!=='string'||!sdp.startsWith('v=0'))return res.status(400).json({error:'A valid mode and SDP offer are required.'});
  const config=structuredClone(store.state.profiles[mode]);const selected=catalog.find(m=>m.id===config.model);
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OpenAI key is not configured.'});
  if(selected.provider==='openrouter'&&!process.env.OPENROUTER_API_KEY)return res.status(503).json({error:'Add OPENROUTER_API_KEY to the server .env and restart to use this backend.'});
  creating=true;let call;
  try {
    const upstream=await fetch('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({session:{model:'gpt-live-1',instructions:liveInstructions(config),audio:{output:{voice:config.voice}},delegation:{type:'client'}},transport:{type:'webrtc',sdp}}),signal:AbortSignal.timeout(30000)});
    const data=await upstream.json();if(!upstream.ok)return res.status(upstream.status).json({error:data.error?.message||'Live session creation failed.'});
    if(!data.session?.id||!data.transport?.sdp)throw new Error('Voice API returned an unexpected response.');
    call={id:data.session.id,mode,config,status:'connecting',startedAt:new Date().toISOString(),transcript:[],activity:[],results:[],backendUsage:[],usage:{seconds:0},seen:new Set(),queue:Promise.resolve()};calls.set(call.id,call);store.saveCall(call);
    await attach(call);log(call,'call.connected',{model:config.model,voice:config.voice});
    res.status(201).json({session:data.session,transport:data.transport,config});
  }catch(error){if(call){closeCall(call);if(call.socket?.readyState!==WebSocket.OPEN)finish(call,false);}res.status(502).json({error:error.message});}finally{creating=false;}
});
app.post('/api/calls/:id/heartbeat',(req,res)=>{const call=calls.get(req.params.id);if(!call||call.finished)return res.status(404).json({error:'Call ended.'});call.lastHeartbeat=Date.now();res.json({ok:true});});
app.post('/api/calls/:id/close',(req,res)=>{const call=calls.get(req.params.id);if(call)closeCall(call);res.json({ok:true});});
app.use(express.static(resolve(root,'public'),{index:'index.html'}));
app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.status===413?'Request too large.':'Request failed.'}));
app.listen(port,'127.0.0.1',()=>console.log(`Voice Lab ready at http://localhost:${port}`));
process.on('SIGTERM',()=>{for(const call of calls.values())closeCall(call);setTimeout(()=>process.exit(),16000).unref();});
