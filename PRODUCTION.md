# Competition release status

Alongside is a deployable competition prototype. It is not yet a clinical product, verified patient account system or verified service for children.

## Included

- Chat-first entry, phone layout and cream/sage garden photography.
- Height/weight inputs removed and a migration clearing previous stored measurement values.
- Browser-local conversation history and a separate judges’ page.
- Real Responses API integration for `gpt-6-luna`, with strict function-call validation, approved-summary retrieval and user-initiated app actions.
- Server-side recent-turn memory, session isolation, access-code checks, atomic request limits, idempotent retry handling and an AI off switch.
- A synthetic mode that substitutes server-defined fictional prompts; free-text testing is restricted to invited adult judges who attest to fictional use.
- Explicit selection with a separate publisher code before a demo becomes publicly readable. No fabricated AI transcripts are seeded.
- Server session expiry after 24 hours; selected-demo expiry after seven days. Cleanup runs hourly. Cloudflare backups/PITR and provider logs have separate retention, which must be reviewed before patient use.
- A hidden terminal key prompt and Cloudflare secrets. The public build never inserts environment variables.
- Automated checks, simulated-provider tests, a successful Wrangler deployment dry run, and GitHub Pages CI.

Live API calls still require the owner's Cloudflare account and OpenAI key. The backend is disabled and the public `apiBase` is empty until setup. Do not describe library mode as a live LLM. Automated tests use a simulated provider; passing them is not evidence of clinical quality or a successful live-key call.

## Deliberate LLM boundary

Luna chooses the conversational support, follow-up question, reviewed information entry and next app action through a structured function call. The application retrieves and renders approved wording. It does not allow an unconstrained model to invent medical advice. This means the prototype has bounded conversational coverage; it is not a full therapist or clinical meal-planning agent.

## Before real patient use

Clinical review and real-user evaluations; verified identity/age and guardian consent; a reviewed privacy and retention policy for each intended market; appropriate provider arrangements; production access controls; abuse monitoring; and emergency escalation design remain required. An adult checkbox plus invitation code is for a closed competition demo, not patient consent verification.

No automatic WhatsApp service is connected. Local profiles and check-ins are not a cross-device patient database. English, Arabic, French and Spanish interfaces are prepared; other language preferences can be saved but do not translate the whole app. Care directories are selected resources, not a complete global clinic database.

## Hosting and rollback

GitHub Pages hosts only `build/site/`; Cloudflare hosts the separate private API. The build inserts only the validated public Worker origin into the security policy. No credential belongs in `site/`, an Actions build variable, screenshots or Git history.

Changes to `main` run checks/tests/build before Pages deployment. Restore a known-good source release to roll back. A failed check stops publication. Switching the API off stops new demo calls independently of Pages.
