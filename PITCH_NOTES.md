<!-- Current opening revision: individual-attention-1 -->
# Aló — conversational sales pitch

The research brief is front-loaded from `sales-context.mjs` into Pi's system prompt for each delegation. Pi now chooses what to address next, which argument is relevant and whether to advance or end. Live handles wording, tone, pacing and spoken persuasion. Substantive replies delegate even without a tool request; greetings and simple listening do not. Live gets a private direction and concise substance, not the research or a script. The approved opening now frames individual attention when calls coincide. No claim is made that more context alone improves sales performance; voice routing, handoff latency and actual delivery still need listening tests.

Applied the operator's feedback: an opening should earn one reply. It must not deliver the entire pitch, run a questionnaire, or combine the demo invitation and meeting ask into a monologue.

Opening: “¿Y si todos tus pacientes llamaran a la vez… y cada uno recibiera atención como si fuera el único?” The fictional aesthetic clinic is the test buyer. Ask one answerable question and respond to the answer; do not assume missed calls or lost revenue. The old identity reveal and human persona are removed.

Sell the service directly to the listener. Do not open by qualifying their authority or asking them to roleplay. Answer each objection as it occurs and connect the offer to the problem they mention. Ask for a meeting when there is interest. A separate demonstration is optional, never a prerequisite. These are separate turns, not paragraphs to recite. Ordinary replies target one or two short sentences; explanations and booking confirmations can be longer when needed.

## Local material consulted

- `/Users/sol/Downloads/KTH-IRL-user-guide_A-1.pdf`, customer and business readiness guidance: distinguish understanding the customer from proving that people use and value the solution.
- `/Users/sol/Downloads/KTH-Innovation-Readiness-Level_Compiled_E_.pdf`, CRL detailed criteria, PDF page 3, and BRL detailed criteria, PDF page 7: identify decision maker/user/payer, define a segment-specific value proposition, and update the pitch after customer feedback. Applied to selling a relevant operational result to the business buyer. The user's feedback explicitly rules out opening with a qualification question. These materials do not prescribe this exact wording or prove its conversion rate.
- `/Users/sol/Downloads/Zero to One_ Notes on Startups, or How to Build the Future - 01-11-2020-203418Zero to One.pdf`, chapter 11, “If You Build It, Will They Come?”: distribution is part of product design, and personal sales must fit the customer and transaction. Applied here by making the experience useful and conversational rather than narrating a feature list. Historical company examples and sales figures are not used as current evidence or claims.

The name Aló is a working demo name selected for straightforward Spanish pronunciation (a-LÓ), not a researched trademark decision. No promise of conversion uplift, guaranteed savings, or established commercial pricing has been added.

The Downloads originals were read, not edited. Prior app settings are saved in `data/state-before-pitch-*.json`; model, voice, business facts and existing call records remain intact. The lean revision backs up settings to `data/state-before-lean-*.json`, replaces obsolete prompts, and removes obsolete tool toggles. Three tools remain: availability, booking and lead capture.

## Research applied to the problem-led revision

- [30MPC pitch framework](https://tactics.30mpc.com/the-perfect-cold-call-pitch-formula-book-1-in-4-connects): a specific problem, a concise solution and a relevant next step. Here we state an offer and ask about the current workflow instead of assuming the buyer has a problem.
- [Gong's 2024 opener analysis](https://www.gong.io/blog/the-best-and-worst-cold-call-openers-backed-by-data-from-300m-calls): context and transparent intent matter. Its reported associations do not establish causality or an optimal opening for Spanish AI calls; this demo does not claim those conversion rates.
- [Cognism's conversational sales script](https://www.cognism.com/blog/ultimate-cold-calling-script-software-sales): adapt the explanation to what the buyer actually says. Do not copy the whole script or fake peer references.
- [Humă and Stokoe, 2023](https://researchonline.lse.ac.uk/id/eprint/119428/): blocks and stalls are distinct interactional practices. Here, genuine rejection ends the sale; a timing problem can lead to an optional follow-up.
- [RAIN prospecting research](https://www.rainsalestraining.com/sales-research/sales-prospecting-research): give the meeting a relevant purpose. Offer to review which calls could be delegated and which should remain with the buyer.

The script is a hypothesis to test with buyers, not validated sales performance. Unit tests check configuration and preservation, not persuasiveness. The sales migration replaces only the outbound greeting and voice prompt, with a complete local backup; inbound settings, models, tools, business facts and records remain unchanged.

## Buyer correction: aesthetic clinic

The operator rejected the workshop. The demo now targets an owner/manager of a clinic that advertises consultations: a specific buyer, inquiry-to-consultation workflow and measurable booking outcome. This is a demo-selection hypothesis, not validated Ecuadorian market demand.

[AmSpa's U.S. industry summary](https://www.americanmedspa.org/news/medical-spas-are-safe-repeat-patients-and-industry-size/) reports average patient-visit volume and repeat visits. That supports testing an appointment-centered scenario; it does not establish this product's conversion rate, local willingness to pay or market superiority.

Clínica Aurora is fictional. Inbound calls book initial assessments, never treatments; no clinical recommendations, eligibility decisions or medical-history collection. Only fictitious administrative booking data belongs in the demo. Prices require team confirmation. Prior profiles are backed up to `data/state-before-target-*.json`; models, tool settings, historical calls and bookings are retained.

The approved opening is delivered with a brief natural pause after “a la vez”, then space for the buyer to answer. Pi receives the same commercial direction. This is an invitation to imagine a service, not proof of unlimited concurrency: the browser demo still supports one active call. No load capacity or clinical care is promised. The opening migration backs up local state and updates only exact shipped prompt values; tools, models, custom edits and historical records are preserved.
