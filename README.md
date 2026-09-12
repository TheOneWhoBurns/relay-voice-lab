# Aló Voice Lab

One demo promise: **turn a conversation into a confirmed appointment**. GPT-Live 1 handles speech; Pi handles three server-side tools.

## The lean demo

- Outbound: Alex sells Aló and asks for a 20-minute meeting when there is interest.
- Inbound: Alex answers approved business questions and helps book a service.
- Three tools: `check_availability`, `submit_appointment`, `save_lead`.
- Approved facts are supplied in context, without a lookup round trip.
- Notes, interest, follow-ups and do-not-contact use one lead record. Names/contact are optional; never fabricated.
- Appointment lookup, rescheduling and cancellation are deleted. Change requests can be saved for follow-up but do not modify a booking.
- The UI has Conversation, Bookings and Leads. Technical activity is collapsed; model, opening, voice prompt and three tool switches remain editable per mode.

Opening: “Hola, soy Alex de Aló. Te presento a quien convierte llamadas en citas. Ya estás hablando con él.” Then wait.

The workshop and prices are fictional. The hook is a pitch to test, not evidence of conversion performance. There is no approved Aló price, guaranteed saving, phone integration, real calendar connection, invitation delivery or human transfer.

## Run

```sh
npm install
npm start
```

Open [the demo](http://localhost:3210/) and allow microphone access when starting a call. Outbound ringing is simulated; API usage begins after answering. Inbound starts after microphone setup. End call closes the voice session; calls are capped at the chosen duration.

`OPENAI_API_KEY` is read from ignored `.env`. Optional `OPENROUTER_API_KEY` enables the existing OpenRouter presets after restart. Keys never reach the browser. Only available models appear in the dropdown, except a previously selected unavailable model stays visible to explain its missing key. Free backend inference does not make voice free.

## Records and booking safety

The local agenda has weekday one-hour blocks within 14 calendar days. A sales meeting occupies one block but lasts 20 minutes. Booking requires checked availability, explicit confirmation and a valid business timezone. Availability is rechecked on save. Retries deduplicate; competing bookings and attempts to create replacement bookings for the same contact in one call are rejected.

State, transcripts, leads and bookings are in ignored `data/state.json`; audio is not persisted. Existing records survive migrations. Before the lean migration, full state is copied to `data/state-before-lean-*.json`. Obsolete prompts and tool settings can be recovered there.

Estimated cost uses cumulative voice duration and known Pi token prices. Unknown costs are labeled; this is not an account balance. Infrastructure and unrecorded failed initialization are excluded. A duration limit is not a dollar budget.

## Architecture

Browser audio uses WebRTC. A local Node server receives sideband events, serializes Pi delegations, executes enabled tools, and returns results to the voice session. Context includes the transcript, approved business facts and prior verified results. Hangup aborts pending work. The server binds to loopback, supports one call at a time, and closes sessions when browser heartbeats stop. This is not a production phone service.

## Checks

```sh
npm test
# Optional paid backend integration check:
node --env-file=.env test/backend-smoke.mjs
# Browser helper; --live adds a paid voice check:
node test/browser-smoke.mjs
```

Unit tests cover the exact three-tool boundary, disabled/removed actions, context facts, mode isolation, lead deduplication, opt-out capture, confirmed booking, collisions, hangup, costs and migration recovery. The backend smoke covers lead capture, a checked booking, an unsupported change recorded as follow-up, and inbound follow-up.

The optional browser helper uses an isolated headless Edge. `--tools --live` requires `/private/tmp/relay-test-utterance.wav`, a synthetic Spanish request to save an after-hours note. `--inbound --live` checks the inbound greeting. No real phone calls are made.
