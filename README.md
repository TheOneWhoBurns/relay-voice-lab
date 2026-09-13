<!-- Current opening revision: individual-attention-1 -->
# Aló Voice Lab

One demo promise: **turn a conversation into a confirmed appointment**. Pi decides what to address next; GPT-Live 1 handles phrasing, tone, pacing and spoken persuasion. Pi also handles three server-side tools.

## The lean demo

- Outbound: the unnamed Aló voice system sells Aló and can propose a 20-minute meeting when it is relevant.
- Inbound: the unnamed voice system answers approved administrative questions and helps book a service.
- Three tools: `check_availability`, `submit_appointment`, `save_lead`.
- Approved business facts and research stay in Pi's context; Live gets the concise offer and safety boundaries.
- Notes, interest, follow-ups and do-not-contact use one lead record. Names/contact are optional; never fabricated.
- Appointment lookup, rescheduling and cancellation are deleted. Change requests can be saved for follow-up but do not modify a booking.
- The UI exposes only configuration, call controls, transcript, raw events, usage, context pressure, actions and cost. Model, opening, separate voice/backend prompts and three tool switches remain editable per mode.

Opening: “¿Y si todos tus pacientes llamaran a la vez… y cada uno recibiera atención como si fuera el único?” Listen to the answer and adapt. The old identity reveal and human persona are removed. The buyer is the owner or manager of a fictional aesthetic clinic advertising consultations. This is a target hypothesis, not proven product-market fit.

The clinic is fictional and has no approved price list. Only reception and scheduling are in scope; no treatment advice, eligibility decisions or medical-history collection. The hook is a pitch to test, not evidence of conversion performance. There is no approved Aló price, guaranteed saving, phone integration, real calendar connection, invitation delivery or human transfer.

## Run

```sh
npm install
npm start
```

Open [the demo](http://localhost:3210/) and allow microphone access when starting a call. Outbound ringing is simulated; API usage begins after answering. Inbound starts after microphone setup. End call closes the voice session; calls are capped at the chosen duration.

`OPENAI_API_KEY` is read from ignored `.env`. Optional `OPENROUTER_API_KEY` enables the existing OpenRouter presets after restart. Keys never reach the browser. Only available models appear in the dropdown, except a previously selected unavailable model stays visible to explain its missing key. Free backend inference does not make voice free.

## Records and booking safety

The local agenda has weekday one-hour blocks within 14 calendar days. A sales meeting occupies one block but lasts 20 minutes. Booking requires checked availability, explicit confirmation and a valid business timezone. Availability is rechecked on save. Retries deduplicate; competing bookings and attempts to create replacement bookings for the same contact in one call are rejected.

State, transcripts, leads and bookings are in ignored `data/state.json`; audio is not persisted. Existing records survive migrations. Before the lean migration, full state is copied to `data/state-before-lean-*.json`. The problem-led sales revision backs up state to `data/state-before-sales-*.json` and updates only the outbound voice prompt and greeting. The clinic-target revision backs up state to `data/state-before-target-*.json`, replaces both business contexts and voice scripts, and preserves models, tools and historical records. Obsolete prompts and tool settings can be recovered there.

Estimated cost uses cumulative voice duration and known Pi token prices. Unknown costs are labeled; this is not an account balance. Infrastructure and unrecorded failed initialization are excluded. A duration limit is not a dollar budget.

## Architecture

Browser audio uses WebRTC. A local Node server receives every input transcript fragment over the sideband connection, coalesces a caller turn after a short quiet interval, runs Pi, validates action claims, and returns the decision to the voice session. Native Live delegation is accepted as an early signal but is not required for continuation; a late duplicate delegation is resolved silently rather than replaying an answer. Corrections supersede pending decisions. Hangup aborts pending work. The server binds to loopback, supports one call at a time, and closes sessions when browser heartbeats stop.

Normal backend latency is silent to the caller. The browser gates GPT-Live playback from the first caller transcript fragment until the local server has sent Pi's verified result upstream. Any autonomous holding utterance remains labeled as `playback suppressed` in the transcript, while Pi-directed speech is released. This is application-level output control because prompting alone does not guarantee silence during client delegation.

The browser is intentionally unstyled beyond a minimal readable layout. It exposes configuration, call controls, transcript, raw backend events, usage, action count and estimated API cost. It has no brand treatment, marketing copy, decorative call UI, scenario cards, or lead/booking galleries. `Store.clearDemoData()` backs up state before clearing synthetic calls, leads and appointments while preserving profiles.

## Backend research context

`sales-context.mjs` contains the full authored research brief: original study methods and limits, lessons from the operator's feedback, examples of relevant and irrelevant replies, and distinct sales/reception boundaries. `backendInstructions()` prepends it to Pi's system prompt on every delegation, followed by the mode, configured backend instructions, approved business facts and a private-advisor output contract. The backend keeps the recent transcript within a 12 KB projection, the latest eight decisions and the latest 24 authoritative records; raw transcripts and records remain stored separately. Live's persona is not copied into Pi's prompt. Custom profiles receive the research too.

Live delegates substantive replies to the opening, business questions, objections, price, changed needs, next-step decisions and requested actions—even when no tools are enabled. It handles greetings, backchannels, unclear audio, language changes and repetition of a current result without another backend request. The approved opening now frames individual attention when calls coincide. Acknowledgment is distinct from consent: a "yes" confirming a booking still delegates.

Pi uses low reasoning effort when the selected model supports reasoning, with a 1,600-token output/reasoning budget per model turn; non-reasoning models keep a 700-token output cap. The overall backend timeout remains 25 seconds and tool-loop limit remains five turns. This replaces the old reasoning-off setting now that Pi owns conversational decisions. Measure the latency/cost tradeoff on actual calls.

Pi returns `{direction, substance, actions}` JSON. Direction stays private on the server; only substance is sent as one `session.commentary.append` for Live to express naturally. This halves normal per-turn Live context appends and avoids private planning influencing speech. Each text field is limited to 450 UTF-8 bytes, conservatively below the 500-token append ceiling. Action references stay on the server and must match actual records from that call and tool. A conservative Spanish/English success-word check also rejects common unsupported saved/booking claims. One corrective backend turn is allowed within the original timeout; invalid output is never read aloud. If the caller speaks during a task, the old spoken result is discarded; saved actions are not undone or forgotten. Hangup still aborts work.

The server preserves `session.usage.updated.context_window.usage_ratio`, exposes it in the call UI, and records transitions at 75% and 90%. GPT-Live itself manages its 128k window: above 90% it starts a replacement voice engine in the same session with the original instructions and compacted history. The app does not fight that mechanism with an arbitrary reconnect. Business rules remain in the preserved startup prompt, while confirmed actions and long records remain authoritative in the local store and are reintroduced by Pi when relevant.

This is prompt-directed delegation, not deterministic control of every word or turn. Quiet context is not a confidentiality boundary, and acknowledgment is not proof of spoken delivery. Real voice tests must check routing, latency, interruptions and whether Live expresses Pi's substance without reciting its direction. More backend consultations add latency and cost; more context alone does not prove better sales. The collapsed research panel shows the authored synthesis, not full copies of the papers.

The split follows the official [GPT-Live prompting](https://developers.openai.com/api/docs/guides/live-prompting), [client delegation guidance](https://developers.openai.com/api/docs/guides/live-delegation), and [long-conversation behavior](https://developers.openai.com/api/docs/guides/live-conversations#manage-longer-conversations).

## Checks

```sh
npm test
# Optional paid backend integration check:
node --env-file=.env test/backend-smoke.mjs
# Browser helper; --live adds a paid voice check:
node test/browser-smoke.mjs
```

Unit tests cover role separation, handoff validation, stale decisions, the exact three-tool boundary, disabled/removed actions, context facts, mode isolation, lead deduplication, opt-out capture, confirmed booking, collisions, hangup, costs and migration recovery. The paid backend smoke covers lead capture, a checked booking, an unsupported change recorded as follow-up, inbound follow-up, and no-action probes for corrected needs, price, rejection and inbound questions. Inspect the printed decisions for relevance; no automated assertion proves persuasiveness.

The optional browser helper uses an isolated headless Edge. `--tools --live` requires `/private/tmp/relay-test-utterance.wav`, a synthetic Spanish request to save an after-hours note. `--inbound --live` checks the inbound greeting. No real phone calls are made.

The approved opening is delivered with a brief natural pause after “a la vez”, then space for the buyer to answer. Pi receives the same commercial direction. This is an invitation to imagine a service, not proof of unlimited concurrency: the browser demo still supports one active call. No load capacity or clinical care is promised. The opening migration backs up local state and updates only exact shipped prompt values; tools, models, custom edits and historical records are preserved.
