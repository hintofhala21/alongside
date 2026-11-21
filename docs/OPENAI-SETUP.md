# Connect Luna: the short guide

You never need to paste your OpenAI key into Alongside, a GitHub file or this chat.

## Your one guided command

Open a terminal in the Alongside project folder and run:

```sh
python3 scripts/setup-ai.py
```

On a Mac, `START-HERE.command` launches the same guide. If macOS has removed its executable permission, use the command above. The helper can use the Node runtime bundled with the ChatGPT app, or a normal Node installation. It downloads the pinned official Cloudflare tool from npm.

The guide does the technical work:

1. It opens Cloudflare sign-in. Use accounts managed with help from your parent or guardian, following the providers’ account rules.
2. It prepares a private server with AI switched off.
3. It asks for your OpenAI key **in your terminal with typing hidden** and sends it directly to Cloudflare’s secret store. It does not save the key in a file or print it.
4. It creates a competition access code and a separate publisher code, then enables the demo and checks the server.
5. It updates the public connection file automatically. Send Codex the **public Worker address** printed at the end, so that one final website connection can be published. Do not send the key.

“Luna” is a name; the actual model setting is `gpt-6-luna`. The private secret’s name is `OPENAI_API_KEY`. The website only receives the public server address.

## Try the chatbot

After the connection is published, open **Competition demo** on Alongside.

- **Fictional scenarios** lets younger builders run preset fictional examples through the real LLM. No personal typing or profile is sent.
- **Free-text testing** is for adult judges, using fictional details only. It requires their attestation and the competition code.

Keep the publisher code for yourself. The competition code lets judges test the demo; it does not let them publish chats.

## Give judges a history link

1. Finish a Luna demo, then open **Chat history → On this device**.
2. Open **Select this demo for the judges**.
3. Read every message. Confirm that the entire conversation is fictional and suitable to share.
4. Enter your publisher code and select **Publish selected demo**.

The page supplies a direct link on the same website, such as `history.html?demo=...`. You can also share the whole [judges’ page](https://hintofhala21.github.io/alongside/history.html?view=showcase).

Anyone with a judges’ link can read selected demos. They expire after seven days. Use the owner’s **Unpublish** control to remove one sooner. Private visitor conversations are never listed automatically.

## Costs and limits

Cloudflare has a free starting tier; the helper does not purchase a plan. OpenAI API usage is billed separately from ChatGPT. Set a project budget and billing alerts in your provider account as well.

The server limits the demo to 60 requests per day, 500 per month and 30 per session. Each accepted chat request permits one bounded Luna call, with 400 output tokens at most. These are request limits, not a promised dollar cap. Limits are checked on the server before a model call; the website cannot override them.

To turn AI off, set `AI_ENABLED` to `"false"` in `api/wrangler.jsonc` and redeploy the Worker. Ask Codex to help; never move the key to the frontend as a shortcut. Rerunning setup creates new access codes and invalidates existing sessions.

## Privacy and scope

Only competition-demo messages are sent to Cloudflare and OpenAI. Profile fields, saved check-ins, location and phone details are not sent automatically. Server-side demo sessions expire after 24 hours and are cleaned up periodically; browser history remains until cleared. Selected public demos expire after seven days. Provider backups and logs can have separate retention.

This prototype uses `store: false` for OpenAI requests. That is not the same as Zero Data Retention. Younger builders use predefined fictional messages, not personal data. The product still needs clinical and consent work before patient use.

[OpenAI production guidance](https://developers.openai.com/api/docs/guides/production-best-practices) · [Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna) · [Under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) · [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)

## Check that OpenAI really answers

Use a fresh key if an earlier one was pasted into a chat. Delete the exposed key in the OpenAI dashboard. Open START-HERE.command in Finder and enter the replacement only at the hidden prompt. Use the existing private Worker address and competition code for repeat checks, so access codes stay the same.

Setup tests server configuration, judge access and one real fictional reply. A PASS 3/3 line includes the system prompt version. Only then does setup write the Worker address to the website configuration. For another check in Terminal, run `python3 scripts/check_connection.py`. Each run uses at most one model call. If setup stopped at the model check, correct the reported issue, repeat the check, and give Codex the public Worker address after PASS 3/3.

After the connection is published, privately share the judge invitation printed by setup. It opens chat and pre-fills the limited demo code. The judge confirms fictional use before sending a message. The API key and owner publishing code stay private.

For individual requests, the backend emits an `alongside.chat` event with the result, provider HTTP status, duration and prompt version. In Cloudflare Workers, open the Alongside Worker's live logs while testing. The application log omits keys, codes and message text. See the [system prompt history](../api/prompts/README.md) to compare versions.
