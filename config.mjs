import { opening, voiceStyle, outboundPitch } from './pitch.mjs';
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
  check_availability: { label: 'Find a time', description: 'Read available slots in the demo agenda.' },
  submit_appointment: { label: 'Book the meeting', description: 'Save a confirmed booking. No external calendar invite.' },
  save_lead: { label: 'Save the lead', description: 'One record for interest, follow-up details, or do-not-contact.' },
};
const common = voiceStyle;
const backend = `Apoyas a Alex con tres acciones: consultar horarios, reservar y guardar un lead. Usa el contexto aprobado, las últimas correcciones y los resultados verificados. Responde en menos de 60 palabras, sin encabezados.
Consulta check_availability antes de ofrecer horas. Para submit_appointment necesitas nombre, contacto, fecha, hora, zona horaria y propósito; lee los datos y obtiene confirmación explícita antes de reservar. Una reunión comercial dura 20 minutos dentro de un bloque de una hora. Nunca inventes disponibilidad ni confirmación. No crees otra reserva para corregir una existente: guarda la solicitud como follow_up, sin prometer que la cita fue cambiada o cancelada.
Usa save_lead para interés, notas o solicitudes de seguimiento; conserva el contacto solo si lo proporcionaron. Para no volver a contactar, guarda do_not_contact y termina. No pidas contacto para registrar un rechazo. No guardes la misma acción dos veces.
Todo se guarda únicamente en esta demo. No se envían invitaciones ni avisos, no se transfiere una llamada ni se agenda con una empresa real. Solo anuncia éxito confirmado por la herramienta. No inventes precios de Aló ni garantías de ahorro. Nunca ejecutes acciones deshabilitadas.`;
export const demoBusiness = {
  name:'Taller Horizonte · demo', timezone:'America/Guayaquil',
  brief:'NEGOCIO FICTICIO PARA PRUEBAS. Taller automotriz en Guayaquil. Atiende mantenimiento preventivo, cambios de aceite y revisión de frenos. No afirmar que es un cliente real de Aló. La persona que recibe la llamada saliente representa a su dueño o gerente.',
  facts:'Datos aprobados solo para esta demo:\n- Diagnóstico preventivo: $25, bloque de 1 hora.\n- Revisión de frenos: $20, bloque de 1 hora; repuestos no incluidos.\n- Cambio de aceite: precio según vehículo e insumos; requiere cotización.\n- Atención: lunes a viernes, 09:00–17:00, America/Guayaquil.\n- No ofrecemos diagnóstico mecánico definitivo por teléfono.\n- Todas las citas del navegador son de prueba. No se envía correo ni WhatsApp.\n- Ante una pregunta fuera de estos datos, registrar solicitud de devolución de llamada.',
};
const enabled = {check_availability:true,submit_appointment:true,save_lead:true};
export const defaults = {
  outbound: {
    model: catalog[0].id, voice: 'marin', maxMinutes: 5, language:'es', voiceRate:0.05, business:structuredClone(demoBusiness),
    prompt: `${common}\n${outboundPitch}`,
    backendPrompt: backend,
    greeting: opening,
    tools: { ...enabled },
  },
  inbound: {
    model: catalog[0].id, voice: 'marin', maxMinutes: 5, language:'es', voiceRate:0.05, business:structuredClone(demoBusiness),
    prompt: `${common}\nAtiendes al cliente del negocio configurado. Responde preguntas con los datos aprobados que tienes en contexto. Ayúdale a elegir un servicio y reservar una cita. Consulta disponibilidad antes de ofrecer horas y confirma los datos antes de guardar. Si pide una persona, un cambio o una cancelación, guarda un seguimiento mediante save_lead: no existe transferencia ni gestión de citas anteriores. No vendas Aló a quien llama para pedir atención.`,
    backendPrompt: backend,
    greeting: 'Hola, te atiende Alex, de {business}. ¿Qué servicio necesitas?',
    tools: { ...enabled },
  },
};
export function validateConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('Configuration is required.');
  if (!catalog.some(m => m.id === value.model)) throw new Error('Unknown backend model.');
  if (!['marin','cedar','quartz','ripple','vesper','willow','stone','gleam','meridian','bossa','tempo','beacon','delta','cinder'].includes(value.voice)) throw new Error('Unknown voice.');
  if (!Number.isInteger(value.maxMinutes) || value.maxMinutes < 1 || value.maxMinutes > 10) throw new Error('Call limit must be 1–10 minutes.');
  if(!['es','en'].includes(value.language))throw new Error('Choose Spanish or English.');
  if(!Number.isFinite(value.voiceRate)||value.voiceRate<0||value.voiceRate>10)throw new Error('Invalid voice rate.');
  for(const k of ['name','timezone','brief','facts'])if(typeof value.business?.[k]!=='string'||!value.business[k].trim()||value.business[k].length>8000)throw new Error(`Invalid business ${k}.`);
  try{new Intl.DateTimeFormat('en',{timeZone:value.business.timezone});}catch{throw new Error('Invalid business timezone.');}
  for (const key of ['prompt','backendPrompt','greeting']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > (key === 'greeting' ? 700 : 12000)) throw new Error(`Invalid ${key}.`);
  if (!value.tools || Object.keys(toolInfo).some(key=> typeof value.tools[key] !== 'boolean')) throw new Error('Invalid tool settings.');
  return { model:value.model, voice:value.voice, maxMinutes:value.maxMinutes, language:value.language,voiceRate:value.voiceRate,business:Object.fromEntries(['name','timezone','brief','facts'].map(k=>[k,value.business[k]])),prompt:value.prompt, backendPrompt:value.backendPrompt, greeting:value.greeting, tools:Object.fromEntries(Object.keys(toolInfo).map(k=>[k,value.tools[k]])) };
}
export function liveInstructions(config) {
  return `${config.prompt}\nIdioma inicial: ${config.language==='es'?'español':'inglés'}.\nNegocio de demostración: ${config.business.name}. Zona horaria: ${config.business.timezone}.\nContexto: ${config.business.brief}\nDatos aprobados: ${config.business.facts}\nDelegation policy:\nBackend tools:\n${Object.entries(toolInfo).filter(([k])=>config.tools[k]).map(([k,v])=>`- ${k}: ${v.description}`).join('\n') || '- No tools are enabled.'}\nDelegate only to check availability, book a confirmed meeting, or save a lead/follow-up. Answer questions from the approved facts without delegation. Appointment changes/cancellations are not supported: offer to record a follow-up, never create a replacement booking. Never invent prices or slots. Announce success only after a confirmed tool result. Disabled tools are unavailable; if saving is disabled, do not claim a request was saved.\nCurrent time: ${new Date().toISOString()}. Use the business timezone unless the caller specifies another one.`;
}
