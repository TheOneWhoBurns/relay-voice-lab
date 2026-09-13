const $=id=>document.getElementById(id);
let state,mode='outbound',phase='idle',peer,events,microphone,callId,startedAt,heartbeat,timer,closeTimer,connectTimer,greetingId,generation=0,finalized=false,actions=0,outputGated=false,outputGateCount=0;
const audio=$('remote-audio');

async function api(path,method='GET',body){
  const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Request failed.');
  return data;
}
function setError(message){$('error').textContent=message;$('error').hidden=!message;}
function setStatus(message){$('call-status').textContent=message;}
function markDirty(){$('save-status').textContent='Unsaved';}
function readConfig(){
  return {
    model:$('model').value,voice:$('voice').value,maxMinutes:Number($('limit').value),
    language:$('language').value,voiceRate:Number($('voice-rate').value),
    business:{name:$('business-name').value,timezone:$('business-timezone').value,brief:$('business-brief').value,facts:$('business-facts').value},
    prompt:$('prompt').value,backendPrompt:$('backend-prompt').value,greeting:$('greeting').value,
    tools:Object.fromEntries(Object.keys(state.toolInfo).map(key=>[key,$('tool-'+key).checked])),
  };
}
function drawProfile(){
  const profile=state.profiles[mode];
  for(const [id,key] of [['model','model'],['voice','voice'],['limit','maxMinutes'],['prompt','prompt'],['backend-prompt','backendPrompt'],['greeting','greeting'],['language','language'],['voice-rate','voiceRate']])$(id).value=profile[key];
  for(const key of ['name','timezone','brief','facts'])$('business-'+key).value=profile.business[key];
  $('research-backend').value=state.researchContext?.backend||'';
  $('research-status').textContent=state.researchContext?.version||'';
  $('tools').replaceChildren();
  for(const [key,info] of Object.entries(state.toolInfo)){
    const label=document.createElement('label');label.className='tool-row';
    const text=document.createElement('span');text.textContent=key+' — '+info.description;
    const input=document.createElement('input');input.type='checkbox';input.id='tool-'+key;input.checked=profile.tools[key];input.addEventListener('change',markDirty);
    label.append(text,input);$('tools').append(label);
  }
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.mode===mode)));
  const selected=state.catalog.find(item=>item.id===profile.model);
  $('model-hint').textContent=selected?selected.provider+':'+selected.model:'';
  $('start').textContent=mode==='outbound'?'Start outbound call':'Start inbound call';
  $('save-status').textContent='Saved';setStatus('Ready');
}
async function saveProfile(){
  const profile=readConfig();
  await api('/api/profiles/'+mode,'PUT',profile);
  state.profiles[mode]=profile;$('save-status').textContent='Saved';
}
function lockConfig(locked){document.querySelectorAll('.setup input,.setup select,.setup textarea,.setup button').forEach(element=>element.disabled=locked);}
function setPhase(next){
  phase=next;const busy=!['idle','ended'].includes(next);lockConfig(busy);
  $('start').hidden=busy;$('answer').hidden=next!=='ringing';$('mute').hidden=next!=='connected';$('end').hidden=!busy;
  $('end').textContent=next==='ringing'?'Cancel':next==='closing'?'Closing':'End call';$('end').disabled=next==='closing';
}
function cleanup(message){
  clearInterval(heartbeat);clearInterval(timer);clearTimeout(closeTimer);clearTimeout(connectTimer);generation++;
  microphone?.getTracks().forEach(track=>track.stop());microphone=null;
  const oldEvents=events;events=null;oldEvents?.close();
  const oldPeer=peer;peer=null;oldPeer?.close();audio.srcObject=null;audio.hidden=true;audio.muted=false;outputGated=false;
  setPhase('ended');if(message)setStatus(message);$('mute').textContent='Mute microphone';
}
function resetCall(){
  actions=0;callId=null;finalized=false;greetingId=null;outputGated=false;outputGateCount=0;audio.muted=false;audio.dataset.gateCount='0';
  $('timer').textContent='00:00';$('usage').textContent='—';$('context-usage').textContent='—';$('call-cost').textContent='$0.0000';$('cost-breakdown').textContent='';
  $('backend-state').textContent='Idle';$('activity-count').textContent='0';$('action-count').textContent='0';
  $('transcript').replaceChildren();$('activity').replaceChildren();setError('');
}
function formatTime(seconds){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
function gateOutput(gated){
  if(outputGated===gated)return;
  outputGated=gated;audio.muted=gated;
  if(gated)outputGateCount++;
  audio.dataset.gateCount=String(outputGateCount);
}
function addTranscript(event){
  const speaker=event.type.includes('input_')?'Caller':'Voice',feed=$('transcript');
  let row=[...feed.querySelectorAll('.caption')].at(-1);
  if(!row||row.dataset.speaker!==speaker||Number(event.start_ms)-Number(row.dataset.end)>=1600){
    row=document.createElement('div');row.className='caption '+(speaker==='Caller'?'caller':'agent');row.dataset.speaker=speaker;
    const head=document.createElement('div');head.className='caption-head';head.textContent=speaker+' · '+formatTime((event.start_ms||0)/1000)+(speaker==='Voice'&&outputGated?' · playback suppressed':'');
    const content=document.createElement('div');row.append(head,content);feed.append(row);
  }
  if(speaker==='Voice'&&outputGated)row.dataset.suppressed='true';
  row.dataset.end=event.end_ms||event.start_ms||0;row.lastElementChild.textContent+=event.delta||'';feed.scrollTop=feed.scrollHeight;
}
function addActivity(entry){
  const item=document.createElement('div');item.className='activity-item';
  const title=document.createElement('h3');title.textContent=entry.type+' · '+entry.at;
  const data=document.createElement('pre');const payload={...entry};delete payload.type;delete payload.at;data.textContent=JSON.stringify(payload,null,2);
  item.append(title,data);$('activity').append(item);$('activity-count').textContent=String($('activity').children.length);
  if(entry.type==='backend.started')$('backend-state').textContent='Running';
  if(entry.type==='backend.stale')$('backend-state').textContent='Superseded';
  if(entry.type==='backend.finished'){gateOutput(false);$('backend-state').textContent='Complete · '+entry.elapsedMs+' ms';}
  if(entry.type==='backend.error'){gateOutput(false);$('backend-state').textContent='Error';setError(entry.message);}
  if(entry.type==='record.saved'){actions++;$('action-count').textContent=String(actions);}
  if(entry.type==='voice.error'||entry.type==='connection.error')setError(entry.message);
}
function metricUI(metrics){
  if(!metrics)return;
  $('call-cost').textContent='$'+metrics.estimatedTotal.toFixed(4)+(metrics.backendCostComplete?'':' + unknown');
  $('cost-breakdown').textContent=JSON.stringify({voice:metrics.voiceCost,backend:metrics.backendCost,finalized:metrics.finalized});
}
function send(event){if(events?.readyState==='open')events.send(JSON.stringify(event));}
async function connect(){
  setPhase('connecting');setStatus('Connecting');const token=++generation;
  try{
    microphone=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(token!==generation){microphone.getTracks().forEach(track=>track.stop());return;}
    const connection=new RTCPeerConnection();peer=connection;
    connection.addEventListener('track',event=>{if(token!==generation)return;audio.srcObject=new MediaStream([event.track]);audio.play().catch(()=>{audio.hidden=false;setError('Audio playback is blocked. Use the audio control.');});});
    for(const track of microphone.getAudioTracks())connection.addTrack(track,microphone);
    events=connection.createDataChannel('oai-events');const channel=events;
    channel.addEventListener('message',({data})=>{
      if(token!==generation)return;const event=JSON.parse(data);
      if(event.type==='session.started'){
        clearTimeout(connectTimer);setPhase('connected');setStatus('Connected');startedAt=Date.now();
        timer=setInterval(()=>$('timer').textContent=formatTime((Date.now()-startedAt)/1000),1000);
        greetingId=crypto.randomUUID();const config=state.profiles[mode];
        send({type:'session.instructions.append',event_id:greetingId,delegation_id:null,content:`Speak ${config.language==='es'?'Spanish':'English'} initially. Speak the configured opening immediately without adding an introduction. Pause naturally at punctuation, then listen. Opening: ${config.greeting.replaceAll('{business}',config.business.name)}`});
      }else if(event.type==='session.instructions.appended'&&event.client_event_id===greetingId){
        send({type:'session.commentary.append',event_id:crypto.randomUUID(),delegation_id:null,content:'Begin with the configured opening now.'});greetingId=null;
      }else if(event.type==='session.input_transcript.delta'||event.type==='session.output_transcript.delta'){
        if(event.type==='session.input_transcript.delta')gateOutput(true);
        addTranscript(event);
      }
      else if(event.type==='session.commentary.appended'&&outputGated){
        // Fallback only. The normal release is the earlier local
        // backend.finished event; an append acknowledgment may arrive after
        // speech has already started.
        setTimeout(()=>{if(outputGated)gateOutput(false);},250);
      }
      else if(event.type==='session.usage.updated'){$('usage').textContent=JSON.stringify(event.usage);if(Number.isFinite(event.context_window?.usage_ratio))$('context-usage').textContent=(event.context_window.usage_ratio*100).toFixed(1)+'%';}
      else if(event.type==='session.closed'){finalized=true;$('usage').textContent=JSON.stringify(event.usage||{});cleanup('Closed');}
      else if(event.type==='error')setError(event.error?.message||'Voice session error.');
    });
    channel.addEventListener('close',()=>{if(token===generation&&!finalized)cleanup('Disconnected');});
    connection.addEventListener('connectionstatechange',()=>{if(token===generation&&connection.connectionState==='failed'){setError('Voice connection failed.');endCall();}});
    await connection.setLocalDescription(await connection.createOffer());
    if(connection.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('ICE timeout')),10000);function check(){if(connection.iceGatheringState==='complete'){clearTimeout(timeout);connection.removeEventListener('icegatheringstatechange',check);resolve();}}connection.addEventListener('icegatheringstatechange',check);check();});
    if(token!==generation)return;
    const data=await api('/api/session','POST',{mode,sdp:connection.localDescription.sdp});
    if(token!==generation){await api('/api/calls/'+data.session.id+'/close','POST',{});return;}
    callId=data.session.id;heartbeat=setInterval(()=>api('/api/calls/'+callId+'/heartbeat','POST',{}).catch(()=>{}),5000);
    await connection.setRemoteDescription({type:'answer',sdp:data.transport.sdp});
    connectTimer=setTimeout(()=>{setError('Session start timeout');endCall();},25000);
  }catch(error){
    if(token!==generation)return;if(callId)api('/api/calls/'+callId+'/close','POST',{}).catch(()=>{});
    setError(error.name==='NotAllowedError'?'Microphone permission denied.':error.message);cleanup('Failed');
  }
}
async function endCall(){
  if(phase==='ringing'||phase==='connecting'&&!callId){cleanup('Canceled');return;}
  if(!callId){cleanup('Closed');return;}
  setPhase('closing');setStatus('Closing');
  try{await api('/api/calls/'+callId+'/close','POST',{});}catch{send({type:'session.close'});}
  closeTimer=setTimeout(()=>cleanup('Closed · usage unconfirmed'),17000);
}
$('start').addEventListener('click',async()=>{try{await saveProfile();resetCall();if(mode==='outbound'){setPhase('ringing');setStatus('Ringing');}else await connect();}catch(error){setError(error.message);}});
$('answer').addEventListener('click',connect);$('end').addEventListener('click',endCall);
$('mute').addEventListener('click',()=>{if(!microphone)return;const enabled=microphone.getAudioTracks()[0]?.enabled;microphone.getAudioTracks().forEach(track=>track.enabled=!enabled);$('mute').textContent=enabled?'Unmute microphone':'Mute microphone';});
$('save').addEventListener('click',()=>saveProfile().catch(error=>setError(error.message)));
$('reset').addEventListener('click',()=>{state.profiles[mode]=structuredClone(state.defaults[mode]);drawProfile();markDirty();});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',async()=>{try{await saveProfile();mode=button.dataset.mode;drawProfile();setError('');}catch(error){setError(error.message);}}));
for(const id of ['model','voice','limit','prompt','backend-prompt','greeting','language','voice-rate','business-name','business-timezone','business-brief','business-facts'])$(id).addEventListener('input',()=>{markDirty();if(id==='model'){const selected=state.catalog.find(item=>item.id===$('model').value);$('model-hint').textContent=selected?selected.provider+':'+selected.model:'';}});
try{
  state=await api('/api/state');
  for(const item of state.catalog.filter(item=>item.available||Object.values(state.profiles).some(profile=>profile.model===item.id))){
    const option=document.createElement('option');option.value=item.id;option.textContent=item.id+(item.available?'':' — unavailable');option.disabled=!item.available;$('model').append(option);
  }
  drawProfile();$('api-status').textContent=state.credentials.openai?'API configured':'API missing';
  const stream=new EventSource('/api/events');
  stream.onmessage=({data})=>{const event=JSON.parse(data);if(event.callId!==callId)return;if(event.type==='activity')addActivity(event.entry);if(event.metrics)metricUI(event.metrics);if(event.type==='usage'){$('usage').textContent=JSON.stringify(event.usage);if(Number.isFinite(event.contextWindow?.usageRatio))$('context-usage').textContent=(event.contextWindow.usageRatio*100).toFixed(1)+'% · '+event.contextWindow.band;}if(event.type==='call.ended'){finalized=event.finalized;$('usage').textContent=JSON.stringify(event.usage||{});cleanup(event.finalized?'Closed':'Closed · usage unconfirmed');}};
}catch(error){setError(error.message);$('api-status').textContent='Server unavailable';$('start').disabled=true;}
