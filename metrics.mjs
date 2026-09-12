export function callMetrics(call,records=[]){
  const seconds=Number(call.usage?.seconds)||0,rate=call.config?.voiceRate??call.voiceRate??0.05;
  const backend=call.backendUsage||[];const known=backend.filter(x=>Number.isFinite(x.usage?.cost?.total)&&x.costKnown!==false);
  const backendCost=Number(known.reduce((sum,x)=>sum+x.usage.cost.total,0).toFixed(8));const voiceCost=Number((seconds/60*rate).toFixed(8));
  const owned=records.filter(r=>r.callId===call.id);const errors=(call.activity||[]).filter(e=>e.type.endsWith('.error')||e.isError);
  return {voiceSeconds:seconds,voiceRate:rate,voiceCost,backendCost,backendCostComplete:known.length===backend.length,estimatedTotal:Number((voiceCost+backendCost).toFixed(8)),finalized:call.status==='closed',backendRequests:backend.length,toolActions:owned.length,errors:errors.length,outcomes:owned.filter(r=>r.tool==='save_lead'||r.tool==='record_outcome').map(r=>r.data.outcome),appointments:owned.filter(r=>r.tool==='submit_appointment').length,leads:owned.filter(r=>r.tool==='save_lead').length,telephonyCost:0,notice:'Estimated API cost, not account balance. Excludes unrecorded failed initialization and infrastructure.'};
}
