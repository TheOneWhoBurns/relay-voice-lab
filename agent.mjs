import { Agent } from '@earendil-works/pi-agent-core';
import { createModels, Type } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { catalog, toolInfo } from './config.mjs';
import { runAgendaTool } from './agenda.mjs';
const models=createModels(); models.setProvider(openaiProvider()); models.setProvider(openrouterProvider());
const short=()=>Type.String({minLength:1,maxLength:1500});
export const schemas = {
  save_lead:Type.Object({ outcome:Type.Union(['interested','not_interested','follow_up','do_not_contact'].map(x=>Type.Literal(x))), detail:short(), name:Type.Optional(short()), contact:Type.Optional(short()) }),
  submit_appointment:Type.Object({ name:short(), contact:short(), date:Type.String({pattern:'^\\d{4}-\\d{2}-\\d{2}$'}), time:Type.String({pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'}), timezone:short(), purpose:short(), confirmed:Type.Literal(true) }),
  check_availability:Type.Object({date:Type.Optional(Type.String({description:'Optional business-local date YYYY-MM-DD; omit to get the next open slots.'}))}),
};
export function executeTool(call, store, name, args, signal) {
  if(signal?.aborted || call.ending || call.status==='closed') throw new Error('Call ended; action canceled.');
  if(!Object.hasOwn(schemas,name)||!call.config.tools[name]) throw new Error('This tool is disabled or removed.');
  const agendaResult=runAgendaTool(call,store,name,args);if(agendaResult)return agendaResult;
  const record=store.record(call.id,call.mode,name,args);
  return {status:'saved_locally',recordId:record.id,recordSaved:!record.duplicate,duplicate:!!record.duplicate,details:args,notice:'Demo record only. No invitation, email or real calendar booking was sent.'};
}
export async function runBackend(call, store, emit) {
  const selected=catalog.find(m=>m.id===call.config.model);
  const key=selected.provider==='openai'?process.env.OPENAI_API_KEY:process.env.OPENROUTER_API_KEY;
  if(!key)throw new Error(`${selected.provider==='openai'?'OpenAI':'OpenRouter'} key is not configured.`);
  const found=models.getModel(selected.provider,selected.model);
  const model=found || {id:selected.model,name:selected.label,provider:selected.provider,api:selected.provider==='openai'?'openai-responses':'openai-completions',baseUrl:selected.provider==='openai'?'https://api.openai.com/v1':'https://openrouter.ai/api/v1',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:1024};
  // OpenRouter's completion endpoint accepts all configured models, including Claude.
  const runtimeModel=selected.provider==='openrouter'?{...model,api:'openai-completions',baseUrl:'https://openrouter.ai/api/v1'}:model;
  let turns=0;
  const agent=new Agent({
    initialState:{model:runtimeModel,thinkingLevel:'off',systemPrompt:call.config.backendPrompt+`\nApproved business context: ${JSON.stringify(call.config.business)}\nConfigured initial language: ${call.config.language==='en'?'English':'Spanish'}. Follow the caller if they switch.`,tools:Object.entries(schemas).filter(([name])=>call.config.tools[name]).map(([name,parameters])=>({name,label:toolInfo[name].label,description:toolInfo[name].description,parameters,execute:async(_id,args,signal)=>{const result=executeTool(call,store,name,args,signal);if(result.recordSaved)emit('record.saved',{tool:name,result});return {content:[{type:'text',text:JSON.stringify(result)}],details:result};}}))},
    streamFn:(m,c,o)=>models.streamSimple(m,c,{...o,maxTokens:700,onPayload:payload=>{if(selected.routing)payload.provider=selected.routing;}}),
    getApiKey:()=>key, toolExecution:'sequential', maxRetryDelayMs:1500,
    shouldStopAfterTurn:()=>++turns>=5,
  });
  call.agent=agent;
  agent.subscribe(event=>{
    if(event.type==='tool_execution_start')emit('tool.started',{tool:event.toolName,args:event.args});
    if(event.type==='tool_execution_end')emit('tool.finished',{tool:event.toolName,isError:event.isError,result:event.result?.details});
    if(event.type==='message_end'&&event.message.role==='assistant'&&event.message.usage){call.backendUsage.push({model:selected.id,costKnown:!!found&&selected.provider==='openai',usage:event.message.usage});}
  });
  const groups=[];
  for(const t of call.transcript){const last=groups.at(-1);if(last?.speaker===t.speaker)last.text+=t.delta;else groups.push({speaker:t.speaker,start:t.start_ms,text:t.delta});}
  const history=groups.map(t=>`${t.speaker} [${t.start}ms]: ${t.text}`).join('\n');
  const records=store.state.records.filter(r=>r.callId===call.id);
  const abort=setTimeout(()=>agent.abort(),25000);
  try {
    await agent.prompt(`Current time: ${new Date().toISOString()}. Call mode: ${call.mode}.\nComplete voice transcript so far (fragments are continuous and may overlap):\n${history}\n\nSaved records: ${JSON.stringify(records)}\nPrevious backend results: ${JSON.stringify(call.results)}\nHandle only the latest request. save_lead needs no appointment details; never fabricate a contact. A booking requires explicit caller confirmation, not merely a backend delegation. If intent or required details are unclear, ask the next clarification.`);
    const last=[...agent.state.messages].reverse().find(m=>m.role==='assistant');
    if(!last||last.stopReason==='error'||last.stopReason==='aborted') throw new Error(last?.errorMessage || 'Backend request interrupted.');
    const response=last.content.filter(x=>x.type==='text').map(x=>x.text).join('');
    if(!response) { const results=agent.state.messages.filter(m=>m.role==='toolResult').map(m=>m.content.filter(c=>c.type==='text').map(c=>c.text).join('')); return results.join('\n').slice(0,1200)||'No action was completed. Please clarify the request.'; }
    return response.slice(0,1400);
  } finally { clearTimeout(abort);call.agent=null; }
}
