# Relay Voice Lab

Local browser call simulator using **GPT-Live 1** for full-duplex speech and **Pi Agent Core** for delegated reasoning and tools.

## Run

```sh
cd /Users/sol/S.E.F./voice-lab
npm install
npm start
```

Open http://localhost:3210 in Edge or Chrome and allow microphone access. Headphones help avoid speaker echo.

The server reads `OPENAI_API_KEY` from the ignored `.env` file. Optional `OPENROUTER_API_KEY` enables the OpenRouter model choices after a restart. The browser receives neither key. This demo binds to loopback and is intended for one local operator, not public hosting.

## Try it

- **Outbound:** click **Simulate outbound call**, then **Answer call**. You are the prospect; Alex seeks a short discovery meeting about an AI receptionist service. Ringing is simulated, and no Live session starts until you answer.
- **Inbound:** select **Inbound**, then **Call Relay**. You are calling the business; Alex answers as its receptionist.
- Each profile has its own voice prompt, backend prompt, opening line, enabled tools, voice and reasoning model. Saving or switching modes persists settings. Call controls lock configuration during a call; edits apply to the next call.
- Interrupt naturally. Mute controls the microphone track. **End call** closes the Live session and waits for final usage.
- In **Activity**, inspect Pi delegations and tool results. In **Records**, inspect locally saved notes, meeting requests, outcomes and messages. **Export call** downloads transcript, activity and usage as JSON.

Suggested tests: “Please note that I need coverage after hours”; “How much does this cost?”; “I'm not interested”; or agree on a meeting and supply a name, contact, exact date, time and timezone. Appointment requests require confirmation of the details.

## Models and tools

GPT-Live stays fixed as the voice layer. Pi's reasoning model can be Luna, Terra or GPT-4.1 mini with the supplied OpenAI key. OpenRouter presets include Cerebras GPT-OSS 120B (strict provider routing), DeepSeek, Haiku, a free Nemotron variant and the free router. OpenRouter presets remain unavailable until its separate key is configured; those routes have not been live-verified. Free backend inference does not make the GPT-Live voice session free.

Only the demo tools are exposed to Pi. There are no shell, filesystem-browsing, email or calendar tools. Records are stored in `data/state.json`, together with profiles and call transcripts. Audio recordings are not persisted. Meeting requests are local records; they do not reserve real availability or send invitations.

## Architecture

```text
Browser microphone ↔ WebRTC ↔ GPT-Live 1
                                 ↕ sideband WebSocket
                          local Node server
                                 ↕ client delegation
                            Pi Agent Core
                                 ↕
                       selected model + tools
                                 ↕
                        local JSON records
```

The backend receives authoritative transcript/delegation events on the sideband. Delegations are serialized, full transcript context and saved records are provided to Pi, and results return through `session.commentary.append`. Only the server executes tools. Tool availability is checked at execution, exact repeated records are deduplicated, and pending agents are aborted at hangup. Configuration is fixed per call. The browser handles the greeting and captions; the server owns tool execution and session closure.

Calls default to a five-minute maximum, have one concurrent-session limit, and close if browser heartbeats stop. The server records cumulative `usage.seconds` (not the sum of usage snapshots) and marks missing final usage as incomplete. The time cap is not a dollar budget. Backend token usage is separately recorded. Failed WebRTC initialization may still incur the documented 15-second charge.

## Verification

```sh
npm test
# Optional paid checks; use the project key and a few seconds of voice credit:
node --env-file=.env test/backend-smoke.mjs
node test/browser-smoke.mjs --live
```

The browser check launches an isolated headless Edge with synthetic microphone input. `--tools` additionally requires `/private/tmp/relay-test-utterance.wav` and speaks that fixture into the call. It is a test helper, not a runtime dependency. Test screenshots live in ignored `test-results/`.

References: [Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [client delegation](https://developers.openai.com/api/docs/guides/live-delegation), [session lifecycle](https://developers.openai.com/api/docs/guides/live-conversations), [Pi](https://pi.dev/docs/latest/sdk).
