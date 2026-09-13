import { callerRevision, decisionEvents, resolveLateDelegation } from './handoff.mjs';

// Live transcripts arrive as fragments, not completed turns. Coalesce them,
// then run Pi ourselves; native delegation is an optional early signal.
export function createConversation({call, run, send, log, save, quietMs=1000}) {
  let timer, running=false, disposed=false, handled='', pendingId=null, lastResult=null, lastRevision='';
  const seen=new Set();
  const closed=()=>disposed||call.ending||call.finished;
  function schedule(delay=quietMs){
    clearTimeout(timer);
    if(!closed())timer=setTimeout(processTurn,delay);
  }
  async function processTurn(){
    if(closed()||running)return;
    const revision=callerRevision(call);
    if(!revision.trim()||revision===handled)return;
    running=true;handled=revision;
    const start=Date.now();
    log('backend.started',{model:call.config.model,trigger:pendingId?'delegation':'transcript',delegationId:pendingId});save();
    try{
      const result=await run();
      if(closed())return;
      call.results.push(result);
      if(callerRevision(call)!==revision){
        log('backend.stale',{message:'New caller speech superseded this decision; processing the latest transcript.'});
        return;
      }
      const id=pendingId;pendingId=null;
      for(const event of decisionEvents(result,id)){
        if(!send(event))throw new Error('Voice connection closed before the backend result could be delivered.');
      }
      lastResult=result;lastRevision=revision;
      log('backend.finished',{result,message:`Pi: ${result.direction}\nContent: ${result.substance}`,elapsedMs:Date.now()-start});
    }catch(error){
      if(closed())return;
      if(callerRevision(call)!==revision){log('backend.stale',{message:'Interrupted task discarded; processing the latest caller speech.'});return;}
      log('backend.error',{message:error.message});
      send({type:'session.commentary.append',delegation_id:pendingId,content:'No se pudo completar esta consulta. No confirmes ninguna acción nueva. Explica brevemente el fallo y permite que la persona vuelva a intentarlo.'});pendingId=null;
    }finally{
      running=false;save();
      if(!closed()&&callerRevision(call)!==handled)schedule();
    }
  }
  return {
    transcript(event){
      if(closed())return;
      const input=event.type==='session.input_transcript.delta';
      call.transcript.push({speaker:input?'Caller':'Voice',delta:event.delta,start_ms:event.start_ms,end_ms:event.end_ms});
      if(input){
        // Stop pending tool execution when a correction arrives. Already saved
        // actions remain in the store and are included in the next Pi request.
        if(running)call.agent?.abort();
        schedule();
      }
    },
    delegation(event){
      const id=event.delegation?.id;
      if(closed()||!id||seen.has(id))return;
      seen.add(id);
      log('delegation.requested',{delegationId:id});schedule();
      const revision=callerRevision(call);
      // A native delegation can arrive after the transcript-triggered fallback
      // has already completed. Resolve the protocol wait without replaying the
      // spoken result or making Live fill time again.
      if(!running&&revision===lastRevision&&lastResult){
        send(resolveLateDelegation(id));
        log('delegation.reused',{delegationId:id});save();return;
      }
      // Native delegation is a stronger end-of-turn signal than an arbitrary
      // transcript gap, so begin quickly while still allowing late fragments.
      pendingId=id;schedule(Math.min(quietMs,100));
    },
    close(){disposed=true;clearTimeout(timer);call.agent?.abort();},
  };
}
