# Competition release status

Alongside is a deployable competition prototype. It is not yet a clinical product, verified patient account system or verified service for children.

## Included

- Chat-first entry, phone layout and cream/sage garden photography.
- Height/weight inputs removed and a migration clearing previous stored measurement values.
- Browser-local conversation history and a separate judges’ page.
- Real Responses API integration for `gpt-6-luna`, with strict function-call validation, approved-summary retrieval and user-initiated app actions.
- Server-side recent-turn memory, session isolation, access-code checks, atomic request limits, idempotent retry handling and an AI off switch.
- Public adult chat with age attestation, explicit consent, limited recent memory, and server-side exclusion from publication.
- A judge-only synthetic mode that substitutes server-defined fictional prompts; free-text judge testing is restricted to invited adult judges who attest to fictional use.
- Explicit selection with a separate publisher code before a demo becomes publicly readable. No fabricated AI transcripts are seeded.
- Server session expiry after 24 hours; selected-demo expiry after seven days. Cleanup runs hourly. Cloudflare backups/PITR and provider logs have separate retention, which must be reviewed before patient use.
- A hidden terminal key prompt and Cloudflare secrets. The public build never inserts environment variables.
- Automated checks, simulated-provider tests, a successful Wrangler deployment dry run, and GitHub Pages CI.

On 21 November 2026, the deployed Cloudflare Worker authenticated a competition session and returned a validated OpenAI reply to one fictional scenario using prompt v4. The public configuration contains the Worker address. The restricted demo key has a 30-day expiration. The authorized owner can renew it privately before expiry. Automated tests use a simulated provider.

## Deliberate LLM boundary

Personal and adult judge chats use recent messages to write open-ended replies. For questions routed to health information, the server supplies the approved wording and sources. The predefined scenario demo retains its reviewed response menus.

## Before real patient use

Clinical review and real-user evaluations; verified identity/age and guardian consent; a reviewed privacy and retention policy for each intended market; appropriate provider arrangements; production access controls; abuse monitoring; and emergency escalation design remain required. An adult checkbox plus invitation code is for a closed competition demo, not patient consent verification.

The calendar subscription service supports consent, schedule updates and revocation. The [WhatsApp reminder service](reminders/README.md) requires a registered Meta sender and an approved template before it accepts a phone number or sends scheduled reminders. Verify delivery on a consenting test phone after connecting the sender. Local profiles and check-ins are not a cross-device patient database. The interface offers English, Modern Standard Arabic, Simplified Chinese, French, Spanish, Hindi, Brazilian Portuguese, German and Japanese. Stored conversations keep their original wording. Care directories are selected resources, not a complete global clinic database.

## Hosting and rollback

GitHub Pages hosts only `build/site/`; Cloudflare hosts the separate private API. The build inserts only the validated public Worker origin into the security policy. No credential belongs in `site/`, an Actions build variable, screenshots or Git history.

Changes to `main` run checks/tests/build before Pages deployment. Restore a known-good source release to roll back. A failed check stops publication. Switching the API off stops new demo calls independently of Pages.
