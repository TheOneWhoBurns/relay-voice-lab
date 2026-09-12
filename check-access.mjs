const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
const body = await r.json();
if (!r.ok) { console.log(JSON.stringify({ status: r.status, error: body.error?.message })); process.exitCode = 1; }
else console.log(JSON.stringify({ status: r.status, models: body.data.filter(m => /gpt-live|gpt-5.6|gpt-4.1-mini/.test(m.id)).map(m=>m.id) }));
