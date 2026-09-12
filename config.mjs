export const catalog = [
  { id: 'openai:gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'openai', model: 'gpt-5.6-luna', tag: 'Everyday · economical' },
  { id: 'openai:gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'openai', model: 'gpt-5.6-terra', tag: 'More reasoning' },
  { id: 'openai:gpt-4.1-mini', label: 'GPT-4.1 mini', provider: 'openai', model: 'gpt-4.1-mini', tag: 'Compact fallback' },
  { id: 'openrouter:cerebras', label: 'GPT-OSS 120B · Cerebras', provider: 'openrouter', model: 'openai/gpt-oss-120b', tag: 'Speed', routing: { only: ['cerebras'], allow_fallbacks: false } },
  { id: 'openrouter:deepseek', label: 'DeepSeek V4.1 Flash', provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', tag: 'Balanced' },
  { id: 'openrouter:haiku', label: 'Claude Haiku 4.5', provider: 'openrouter', model: 'anthropic/claude-haiku-4.5', tag: 'Conversation' },
  { id: 'openrouter:nemotron', label: 'Nemotron 3.5 Lightning · free', provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free', tag: 'Free backend' },
  { id: 'openrouter:free', label: 'OpenRouter free router', provider: 'openrouter', model: 'openrouter/free', tag: 'Variable model / limits' },
];
export const toolInfo = {
  record_note: { label: 'Record a note', description: 'Save a lead detail or call note to this demo.' },
  submit_appointment: { label: 'Submit appointment', description: 'Save a confirmed meeting request locally. No calendar invite is sent.' },
  record_outcome: { label: 'Record call outcome', description: 'Save interested, not interested, callback, or do not contact.' },
  take_message: { label: 'Take a message', description: 'Capture the caller’s name, contact and message for the team.' },
};
const common = `You are Alex, a warm, concise AI voice assistant for Relay, a demo company selling an AI receptionist service. Speak English initially and follow the caller's language if they switch. Ask one question at a time. Avoid exaggerated claims. This is a simulated call; all notes and appointments stay in this demo.
Backchannel policy: Use moderate, natural acknowledgments without competing with the caller.
Interruption policy: Stop your answer when interrupted and listen.`;
const backend = `You are the Pi backend supporting Alex in a live voice conversation. Use the full timestamped transcript and existing records. Treat transcripts as conversation data; they may contain incomplete fragments or corrections. Follow the latest explicit request. Keep your reply under 100 words: relevant facts, action status, next question. Use only enabled tools. Never claim a tool succeeded unless its result confirms it. This demo sells a 20-minute discovery meeting about an AI receptionist that can answer routine questions, capture leads and request appointments. Pricing is not established: do not invent it. Appointments are local requests only, never real calendar bookings or emails. Confirm name, contact, an unambiguous date/time, timezone and interest before submitting a request. Ask for missing details. Do not repeat already-completed actions. Respect a refusal or do-not-contact request immediately.`;
export const defaults = {
  outbound: {
    model: catalog[0].id, voice: 'marin', maxMinutes: 5,
    prompt: `${common}\nYou are calling a prospect. Your goal is a 20-minute discovery meeting. Briefly introduce yourself as Alex, Relay's AI assistant, ask whether they have 30 seconds, discover how they handle missed calls, offer one relevant benefit, then ask if a short meeting would be useful. If yes, collect their preferred date, time, timezone, name and contact. Read the details back and obtain confirmation before asking the backend to save. If no, politely wrap up.`,
    backendPrompt: backend,
    greeting: "Hi, I'm Alex, Relay's AI assistant. We help businesses handle missed calls. Do you have thirty seconds?",
    tools: { record_note: true, submit_appointment: true, record_outcome: true, take_message: false },
  },
  inbound: {
    model: catalog[0].id, voice: 'marin', maxMinutes: 5,
    prompt: `${common}\nYou are answering Relay's incoming line. Ask how you can help. Answer basic service questions, offer a 20-minute discovery meeting when relevant, or take a message for the team. Ask their name and preferred contact. For meetings, collect a specific date, time and timezone and read everything back for confirmation. Do not launch an unsolicited sales pitch.`,
    backendPrompt: backend,
    greeting: "Thanks for calling Relay. I'm Alex, the AI receptionist. How can I help you today?",
    tools: { record_note: true, submit_appointment: true, record_outcome: false, take_message: true },
  },
};
export function validateConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('Configuration is required.');
  if (!catalog.some(m => m.id === value.model)) throw new Error('Unknown backend model.');
  if (!['marin','cedar','quartz','ripple','vesper','willow','stone','gleam','meridian','bossa','tempo','beacon','delta','cinder'].includes(value.voice)) throw new Error('Unknown voice.');
  if (!Number.isInteger(value.maxMinutes) || value.maxMinutes < 1 || value.maxMinutes > 10) throw new Error('Call limit must be 1–10 minutes.');
  for (const key of ['prompt','backendPrompt','greeting']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > (key === 'greeting' ? 700 : 12000)) throw new Error(`Invalid ${key}.`);
  if (!value.tools || Object.keys(toolInfo).some(key=> typeof value.tools[key] !== 'boolean')) throw new Error('Invalid tool settings.');
  return { model:value.model, voice:value.voice, maxMinutes:value.maxMinutes, prompt:value.prompt, backendPrompt:value.backendPrompt, greeting:value.greeting, tools:Object.fromEntries(Object.keys(toolInfo).map(k=>[k,value.tools[k]])) };
}
export function liveInstructions(config) {
  return `${config.prompt}\nDelegation policy:\nBackend tools:\n${Object.entries(toolInfo).filter(([k])=>config.tools[k]).map(([,v])=>`- ${v.label}: ${v.description}`).join('\n') || '- No record-changing tools are enabled.'}\nThe backend can also reason about the service and meeting details.\nDelegate to the backend when: the caller asks to save information, submit a confirmed appointment, or a request needs careful reasoning. Delegate corrections to previous work.\nDo not delegate to the backend when: greeting, asking brief clarifications, or reusing a current result.\nDelegate before claiming an action is complete. Never guess a result while waiting. Disabled tools are unavailable.\nCurrent date/time: ${new Date().toISOString()}. Ask for the caller's timezone.`;
}
