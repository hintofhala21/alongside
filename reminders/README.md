# Alongside WhatsApp reminders

This Worker handles the schedule when the website is closed. It runs separately from Breeze. The browser’s setup form sends the chosen number, time zone and reminder times after consent. The person using that number confirms by sending the prefilled message in WhatsApp. The Worker accepts confirmations and STOP only from signed Meta webhooks for the configured sender.

## Connect the business sender

The owner of the WhatsApp Business account manages sender access, template approval and any Meta charges. Choose a sender that the project controls. A production sender and approved message template are necessary for reminders outside a conversation window. Keep the template neutral, without medical details. For example, the template body can say “It’s time for the reminder you scheduled with Alongside. Reply STOP to turn reminders off.” Submit a template with a fixed body and no variables, in the language chosen below.

1. Deploy the standalone Worker from the repository root using `npx wrangler deploy --config reminders/wrangler.jsonc`. This provisions the Worker and its SQLite Durable Object. Its public address in Alongside’s Cloudflare account is `https://alongside-reminders.alongside-waicy-demo.workers.dev`.
2. In Cloudflare, open **Workers & Pages → alongside-reminders → Settings → Variables and Secrets**. Add the following settings as secrets. To use Terminal, run `npx wrangler secret put NAME --config reminders/wrangler.jsonc` separately for each name. Enter the value at the hidden prompt.

| Name | Value |
| --- | --- |
| WA_PHONE_NUMBER_ID | Meta’s phone number ID for the business sender. |
| WA_BUSINESS_NUMBER | The business phone number in international format, digits only, for the WhatsApp confirmation link. |
| WA_APP_SECRET | The app secret for the Meta app receiving webhooks. |
| WA_VERIFY_TOKEN | A random private value chosen by the account owner, entered in both Meta and Cloudflare. |
| WA_ACCESS_TOKEN | A production system-user token with permission to send messages for this phone number (`whatsapp_business_messaging`). |
| WA_TEMPLATE_NAME | The exact name of the approved, fixed-text reminder template. |

3. In the Meta app’s WhatsApp settings, set the webhook callback URL to `https://alongside-reminders.alongside-waicy-demo.workers.dev/webhook`. Enter the same verification token and subscribe the app and its business account to **messages**. Both inbound confirmations and delivery updates arrive on this field.
4. The version and language are set in `wrangler.jsonc`. If the approved template is in a different language, change `WA_TEMPLATE_LANGUAGE` to its exact Meta language code and redeploy. The `/status` endpoint reports whether the necessary settings have been entered. It cannot verify Meta’s approval, billing or delivery.

## Confirm one real reminder

Use a number whose owner has agreed to the test. Set a reminder a few minutes ahead in the correct time zone. Enter the number in Alongside, give permission, open WhatsApp and send the prefilled confirmation. Return to Alongside and refresh its status. The subscription should now be active. Confirm that the reminder appears on the phone and check for a delivered or read status. Meta acceptance alone does not establish delivery. Reply STOP or turn the subscription off in Alongside; its future alarms are removed. An attempt already accepted by Meta can still reach the phone.

## Scheduling and storage

A pending request expires in 15 minutes. A confirmed schedule expires after 30 days unless the owner saves it again. The phone number, local times, zone, consent timestamps and most recent delivery state are stored in a private Cloudflare Durable Object. The browser receives a private management token. The server stores only its digest. Clearing a browser removes local access to that token; the owner can still reply STOP or confirm a new enrollment from their number. Expired or cancelled schedules are removed from the application's active storage. Provider retention and backups are separate.

Only distinct scheduled times send a reminder. During daylight-saving changes an unavailable time is skipped and a repeated local time runs once. A missed slot more than ten minutes late is skipped. After an uncertain network result, the same slot is not retried because the provider might already have accepted it. A later signed status update can distinguish delivery from acceptance when a Meta message ID is known. No medical or conversation details enter the outbound message. Cloudflare observability is disabled for this Worker.

Run `node --test tests/whatsapp-reminders.test.mjs` from the repository root to test consent, signature validation, phone ownership, cancellation, expiry, time zones and delivery with a simulated sender.

[Meta WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/) · [Meta pricing](https://business.whatsapp.com/products/platform-pricing) · [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
