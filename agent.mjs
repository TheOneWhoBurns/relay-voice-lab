import { Agent } from '@earendil-works/pi-agent-core';
import { createModels, Type } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { catalog, toolInfo, backendInstructions } from './config.mjs';
import { runAgendaTool } from './agenda.mjs';
import { parseDecision, verifyDecisionActions } from './handoff.mjs';
import { buildBackendContext } from './context.mjs';
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
    initialState:{model:runtimeModel,thinkingLevel:runtimeModel.reasoning?'low':'off',systemPrompt:backendInstructions(call.config,call.mode),tools:Object.entries(schemas).filter(([name])=>call.config.tools[name]).map(([name,parameters])=>({name,label:toolInfo[name].label,description:toolInfo[name].description,parameters,execute:async(_id,args,signal)=>{const result=executeTool(call,store,name,args,signal);if(result.recordSaved)emit('record.saved',{tool:name,result});return {content:[{type:'text',text:JSON.stringify(result)}],details:result};}}))},
    streamFn:(m,c,o)=>models.streamSimple(m,c,{...o,maxTokens:runtimeModel.reasoning?1600:700,onPayload:payload=>{if(selected.routing)payload.provider=selected.routing;}}),
    getApiKey:()=>key, toolExecution:'sequential', maxRetryDelayMs:1500,
    shouldStopAfterTurn:()=>++turns>=5,
  });
  call.agent=agent;
  agent.subscribe(event=>{
    if(event.type==='tool_execution_start')emit('tool.started',{tool:event.toolName,args:event.args});
    if(event.type==='tool_execution_end')emit('tool.finished',{tool:event.toolName,isError:event.isError,result:event.result?.details,message:event.isError?event.result?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'):undefined});
    if(event.type==='message_end'&&event.message.role==='assistant'&&event.message.usage){call.backendUsage.push({model:selected.id,costKnown:!!found&&selected.provider==='openai',usage:event.message.usage});}
  });
  const context=buildBackendContext(call,store.state.records);
  if(context.stats.omittedTurns||context.stats.decisions>context.stats.includedDecisions||context.stats.records>context.stats.includedRecords)emit('backend.context.compacted',context.stats);
  const abort=setTimeout(()=>agent.abort(),25000);
  try {
    await agent.prompt(`Current time: ${new Date().toISOString()}. Call mode: ${call.mode}.\nRecent voice transcript (older turns may be omitted; current business rules remain in the system prompt):\n${context.transcript}\n\nAuthoritative saved records: ${JSON.stringify(context.records)}\nRecent backend decisions (context only; not proof of what Voice said): ${JSON.stringify(context.decisions)}\nYou are Pi advising Voice, not a participant in the transcript. Decide the next relevant move; use no tools unless a permitted action is needed. save_lead requires only outcome and detail; omit absent name/contact. Booking requires explicit Caller confirmation, not Voice's words or a delegation. Return direction/substance/actions JSON, with real record references for every action claimed completed.`);
    for(let attempt=0;attempt<2;attempt++){
      const last=[...agent.state.messages].reverse().find(m=>m.role==='assistant');
      if(!last||last.stopReason==='error'||last.stopReason==='aborted')throw new Error(last?.errorMessage||'Backend request interrupted.');
      const response=last.content.filter(x=>x.type==='text').map(x=>x.text).join('');
      try{return verifyDecisionActions(parseDecision(response),store.state.records,call.id);}
      catch(error){
        if(attempt||call.ending)throw error;
        emit('backend.repair',{message:'Checking the decision against actual saved actions.'});
        await agent.prompt(`Your draft was NOT sent to Live: ${error.message}\nAuthoritative records for this call: ${JSON.stringify(store.state.records.filter(r=>r.callId===call.id))}\nExecute any still-requested, enabled action with valid inputs; do not repeat an already completed action. Then return direction, substance and actions JSON. Every completed-action claim needs its actual matching recordId and tool. No fabricated identifiers, no unverified success. If no action was completed, say so without success wording.`);
      }
    }
  } finally { clearTimeout(abort);call.agent=null; }
}
