# Release status

This is a **public static pilot**, suitable for testing with sample details. It can be published on GitHub Pages after the workflow passes. It is not yet a clinical product, an authenticated account system or a verified service for children.

## Prepared for the static pilot

- Existing cream and sage design and browser-local features retained.
- Fresh public repository source, without the private preview's history, Site identity, screenshots or profiles.
- Separate page, stylesheet and JavaScript files; no executable inline scripts or styles.
- Restrictive page security policy: no network API calls, third-party scripts, frames or external form submissions.
- No analytics, API key field, third-party fonts or OpenAI integration.
- No key or health profile inserted at build time. Public files are explicitly allowlisted.
- Automated source checks, regression tests, credential scanning and Pages deployment.
- Third-party workflow actions pinned to reviewed commit IDs. Update these pins deliberately as GitHub maintains the actions.
- Privacy and pilot limitations linked from the website.

GitHub Pages controls HTTP response headers; HTML security-policy metadata cannot provide every server header, including `frame-ancestors`. Do not treat the static host as a full medical-data security system.

## Still required before real patient use

1. Clinical review of all recovery content, check-ins, emergency guidance and food suggestions. This version does not diagnose, calculate fluid targets or prescribe individual treatment plans.
2. A reviewed approach to age, guardian verification, consent, privacy, data retention and country-specific requirements. A guardian contact field alone would not verify consent. No guardian verification is connected.
3. Real account authentication and a secure server database if cross-device profiles are needed. The current browser-only profile is not an account or access control.
4. A backend before any OpenAI key is used, with authentication, request limits, cost controls and a reviewed AI policy. Live AI remains absent.
5. A WhatsApp Business integration and opt-in before claiming that automatic WhatsApp reminders work. Saving a phone number currently stores it only in this browser.
6. Translation review before claiming full interface support beyond English and Arabic; broader language preferences can currently be saved but do not translate the whole UI.
7. Expanded, verified care listings. The directory currently has selected country resources and a WHO fallback, not every clinic or public hospital in every town. External links do not establish free treatment or availability.
8. Accessibility and usability review with intended users, ongoing review of approved source pages, and an owner responsible for support and maintenance.

## Deployment and rollback

Set repository **Settings → Pages → Source → GitHub Actions**. The workflow checks and builds first and deploys only after a successful build. A failed check stops publication. Only `build/site/` is uploaded.

To undo a release, restore the last known-good source commit and push it to `main`; the same checks and deployment run again. Do not publish personal profiles or browser exports when troubleshooting. Check the Pages job's reported URL before announcing a release.

## Data separation

The earlier private preview and the GitHub Pages version have different origins, so browser storage is separate. No profiles are migrated automatically. Clearing browser data removes the local profile. The app does not back it up. Its profile deletion feature clears the local app profile; it does not delete browsing history, exported calendar files or provider records.
