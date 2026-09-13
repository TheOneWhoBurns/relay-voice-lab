const DEFAULTS={transcriptBytes:12000,decisionCount:8,recordCount:24};

function utf8Tail(value,maxBytes){
  const text=String(value||'');
  maxBytes=Math.max(16,Number(maxBytes)||16);
  if(Buffer.byteLength(text,'utf8')<=maxBytes)return text;
  let low=0,high=text.length;
  while(low<high){
    const mid=Math.ceil((low+high)/2);
    if(Buffer.byteLength(text.slice(mid),'utf8')<=maxBytes)high=mid;else low=mid;
  }
  return `[…older text omitted…] ${text.slice(low)}`;
}

export function transcriptTurns(transcript=[]){
  const turns=[];
  for(const fragment of transcript){
    if(!fragment||!['Caller','Voice'].includes(fragment.speaker))continue;
    const delta=String(fragment.delta||'');
    const last=turns.at(-1);
    if(last?.speaker===fragment.speaker)last.text+=delta;
    else turns.push({speaker:fragment.speaker,start:Number(fragment.start_ms)||0,text:delta});
  }
  return turns.map(turn=>({...turn,text:turn.text.replace(/\s+/g,' ').trim()})).filter(turn=>turn.text);
}

export function buildBackendContext(call,allRecords,limits={}){
  const cap={...DEFAULTS,...limits};
  const turns=transcriptTurns(call.transcript);
  const selected=[];
  let bytes=0;
  for(let index=turns.length-1;index>=0;index--){
    const turn=turns[index];
    const line=`${turn.speaker} [${turn.start}ms]: ${turn.text}`;
    const size=Buffer.byteLength(line+'\n','utf8');
    if(selected.length&&bytes+size>cap.transcriptBytes)break;
    const kept=size>cap.transcriptBytes?utf8Tail(line,cap.transcriptBytes-32):line;
    selected.unshift(kept);bytes+=Buffer.byteLength(kept+'\n','utf8');
  }
  const decisions=(call.results||[]).slice(-cap.decisionCount).map(({direction,substance,actions})=>({direction,substance,actions}));
  const callRecords=(allRecords||[]).filter(record=>record.callId===call.id);
  const records=callRecords.slice(0,cap.recordCount).map(({id,tool,data,createdAt})=>({id,tool,data,createdAt}));
  return {
    transcript:(turns.length>selected.length?`[${turns.length-selected.length} older turns omitted; durable business rules remain in the system prompt]\n`:'')+selected.join('\n'),
    decisions,records,
    stats:{turns:turns.length,includedTurns:selected.length,omittedTurns:turns.length-selected.length,decisions:(call.results||[]).length,includedDecisions:decisions.length,records:callRecords.length,includedRecords:records.length,transcriptBytes:bytes},
  };
}

export function liveContextState(contextWindow,previousBand='normal'){
  if(contextWindow?.usage_ratio===null||contextWindow?.usage_ratio===undefined)return null;
  const ratio=Number(contextWindow?.usage_ratio);
  if(!Number.isFinite(ratio))return null;
  const usageRatio=Math.max(0,Math.min(1,ratio));
  const band=usageRatio>=0.9?'compacting':usageRatio>=0.75?'elevated':'normal';
  return {usageRatio,band,changed:band!==previousBand,updatedAt:new Date().toISOString()};
}
