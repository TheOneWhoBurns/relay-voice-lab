import { randomUUID } from 'node:crypto';
export const slotTimes=['09:00','10:00','11:00','14:00','15:00','16:00'];
export function localDate(now,timezone){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function validDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const d=new Date(date+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===date;}
function slotInstant(date,time,timezone){
  const wall=Date.parse(date+'T'+time+':00Z');let instant=wall;
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);instant+=wall-represented;}
  return instant;
}
export function availability(store,business,date,now=new Date()){
  if(date&&!validDate(date))throw new Error('Fecha inválida. Usa YYYY-MM-DD.');
  const today=localDate(now,business.timezone),start=new Date(today+'T12:00:00Z');const candidates=[];
  for(let i=0;i<14;i++){const day=new Date(start);day.setUTCDate(day.getUTCDate()+i);const d=day.toISOString().slice(0,10);if(date&&d!==date)continue;if([0,6].includes(day.getUTCDay()))continue;
    for(const time of slotTimes){if(slotInstant(d,time,business.timezone)<=+now)continue;const occupied=store.state.appointments.some(a=>a.status==='booked'&&a.business===business.name&&a.date===d&&a.time===time&&a.timezone===business.timezone);if(!occupied)candidates.push({date:d,time,timezone:business.timezone});}}
  return {agenda:'demo',business:business.name,timezone:business.timezone,blockMinutes:60,horizonDays:14,slots:candidates.slice(0,date?30:12),notice:'Solo agenda local de prueba. No representa disponibilidad de una empresa real.'};
}
export function runAgendaTool(call,store,name,args){
  const business=call.config.business;
  if(name==='check_availability'){
    const result=availability(store,business,args.date);call.checkedSlots??=new Set();for(const s of result.slots)call.checkedSlots.add(`${s.date}|${s.time}|${s.timezone}`);return {status:'availability',...result};
  }
  if(name!=='submit_appointment')return null;
  if(args.confirmed!==true)throw new Error('Caller confirmation is required.');
  if(args.timezone!==business.timezone)throw new Error(`Confirma y usa la zona horaria del negocio: ${business.timezone}.`);
  if(!validDate(args.date)||!slotTimes.includes(args.time))throw new Error('Invalid appointment date or time. Consulta los horarios disponibles.');
  const old=store.state.appointments.find(a=>a.status==='booked'&&a.callId===call.id&&a.contact.trim().toLowerCase()===args.contact.trim().toLowerCase());
  if(old){if(old.date===args.date&&old.time===args.time&&old.timezone===args.timezone)return {status:'booked',appointment:old,duplicate:true};throw new Error('Ya existe una reserva para este contacto en esta llamada. Los cambios solo se registran como seguimiento; no crees otra reserva.');}
  if(!call.checkedSlots?.has(`${args.date}|${args.time}|${args.timezone}`))throw new Error('Consulta check_availability antes de reservar este horario.');
  if(!availability(store,business,args.date).slots.some(s=>s.time===args.time))throw new Error('Ese horario ya no está disponible. Consulta de nuevo.');
  const a={id:randomUUID(),business:business.name,callId:call.id,name:args.name,contact:args.contact,date:args.date,time:args.time,timezone:args.timezone,purpose:args.purpose,status:'booked',version:1,createdAt:new Date().toISOString()};store.state.appointments.push(a);const record=store.record(call.id,call.mode,name,{...args,appointmentId:a.id});return {status:'booked',appointment:a,recordId:record.id,recordSaved:true,notice:'Reserva de prueba en agenda local. No se envió invitación.'};
}
