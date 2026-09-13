// Bound each append below Live's 500-token limit conservatively: UTF-8 byte
// count is an upper bound for byte-level tokenization, including non-Latin text.
export function parseDecision(text) {
  let value;
  try { value=JSON.parse(text); } catch { throw new Error('Pi returned an invalid decision format.'); }
  if(!value || Array.isArray(value) || Object.keys(value).sort().join(',')!=='actions,direction,substance') throw new Error('Pi returned an invalid decision shape.');
  for(const key of ['direction','substance']) {
    if(typeof value[key]!=='string' || !value[key].trim() || Buffer.byteLength(value[key],'utf8')>450) throw new Error(`Pi returned an invalid ${key}.`);
  }
  if(!Array.isArray(value.actions)||value.actions.length>6)throw new Error('Pi returned invalid action references.');
  for(const action of value.actions){
    if(!action||Object.keys(action).sort().join(',')!=='recordId,tool'||typeof action.recordId!=='string'||!['save_lead','submit_appointment'].includes(action.tool))throw new Error('Pi returned an invalid action reference.');
  }
  return value;
}

export function verifyDecisionActions(decision, records, callId) {
  for(const action of decision.actions){
    if(!records.some(r=>r.callId===callId&&r.id===action.recordId&&r.tool===action.tool))throw new Error('Pi claimed an action without a matching verified record. Execute the tool or report that it was not completed.');
  }
  // Conservative additional check for this Spanish/English demo, not a general
  // semantic verifier. Also rejects negated success wording; Pi can rephrase it.
  if(!decision.actions.length && /\b(saved|booked|registered|recorded|scheduled|guardad[oa]s?|registrad[oa]s?|reservad[oa]s?|agendad[oa]s?|anotad[oa]s?)\b/i.test(decision.substance))throw new Error('Action wording needs a verified record reference; otherwise state no action was completed.');
  return decision;
}

export function callerRevision(call) {
  return call.transcript.filter(t=>t.speaker==='Caller').map(t=>t.delta).join('');
}

export function decisionEvents(decision, delegationId) {
  const valid=parseDecision(JSON.stringify(decision));
  // Live only needs the speech payload. Keeping Pi's direction server-side avoids
  // doubling the live context and prevents private planning from leaking into tone.
  return [{type:'session.commentary.append',delegation_id:delegationId,content:valid.substance}];
}

export function resolveLateDelegation(delegationId) {
  return {
    type:'session.thinking.append',
    delegation_id:delegationId,
    content:'This caller turn was already answered. Stay silent, listen, and do not repeat the answer.',
  };
}
