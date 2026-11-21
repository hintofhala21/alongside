# Security

Never post keys, access codes, personal health details or profile exports in public Issues or pull requests. Revoke an exposed OpenAI key immediately; deleting it from the latest source does not remove repository history.

The public site contains no OpenAI secret. The key is read with a hidden terminal prompt and uploaded to Cloudflare's secret store. Public configuration accepts only an HTTPS Worker origin. Builds copy only the explicit public folder; common secret files and setup caches are ignored, and checks scan common credential patterns. Those checks are not a complete security audit.

Library-mode profiles, check-ins and chats remain in browser storage, which this app does not encrypt. Another person with access to the browser can read them. The app has no patient-account authentication.

Public personal sessions require adult attestation and consent. Personal sessions and conversations are ineligible for publication. The private judge session requires a separate invitation code and an expiring random session token. Publisher access uses a distinct code. Origin checks are an additional measure, not authentication. Rate counters and request budgets are reserved on the server. Secrets and raw IP addresses are not stored in conversation records or sent to the model. A salted IP-derived value is used for login throttling.

Demo conversation records are private to a session until explicitly selected with the publisher code and a fictional-data confirmation. Published snapshots are public to anyone with the link, expire after seven days, and can be unpublished. Session records expire after 24 hours and are cleaned up periodically. The browser copy remains until cleared. Cloudflare backups and provider retention are separate.

The AI planner accepts untrusted conversation text and returns a structured function call. The adult chat permits original conversational text and whitelisted actions. The model selects the route. On the health route, the server renders only the selected approved summary or the library fallback. Invalid model calls, incomplete responses and provider failures produce an error, not fabricated health advice. Younger-builder synthetic mode ignores arbitrary typed messages and uses server-owned fictional prompts only.

A competition code and adult attestation are not verified patient identity, age or consent. The service must not be opened for patient care until the remaining work in PRODUCTION.md is completed.
