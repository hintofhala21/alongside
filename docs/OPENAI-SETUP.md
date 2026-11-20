# Adding Luna safely, later

## The important part

An **API key is a password that allows spending on an OpenAI account**. Naming a key “luna” in your account does not change how it is stored. The server's secret name should be `OPENAI_API_KEY`; the model name is a separate setting, `gpt-6-luna`.

**There is no safe place to activate that key in the current GitHub Pages-only website.** Do not put it in `site/`, JavaScript, HTML, GitHub Issues, an Actions build variable, or this chat. Do not paste it into an Alongside page. You can publish and use all existing non-AI features without it.

## The later setup, without a key box in Alongside

When you approve a private backend, we will prepare and test it first. For example, with a Cloudflare Worker:

1. Create the Worker and configure authentication, rate limits and spending controls. A private key alone does not stop people abusing an open public endpoint.
2. In the backend folder, run `npx wrangler secret put OPENAI_API_KEY` in your own terminal. This prompts for the key as a secret; don't put the value in the command itself. This is a future instruction: this repository has no Worker configuration yet.
3. The Worker reads `env.OPENAI_API_KEY`. Only the public Worker address goes in the website. The key stays on the server.
4. Test access controls and clinical behavior before enabling AI for visitors.

For local backend development, Cloudflare supports an ignored `.dev.vars` file. Never create it inside `site/`, and never commit it. This project's ignore rules exclude common secret files, and its checks reject known credential patterns. These checks reduce accidents; they cannot recognize every possible secret.

## What has to be decided before live AI

- **Access and cost:** verified sign-in, request limits, a spending cap enforced by the application, and an immediate off switch. CORS is not authentication.
- **Health information:** use the approved library and show sources. An instruction telling an LLM to “use only these websites” cannot guarantee that it ignores its training. A stricter option is letting it select reviewed answers instead of inventing medical advice.
- **Privacy and children:** explicit consent, a reviewed data policy, age-appropriate safeguards and the required provider arrangements. OpenAI's guidance requires Zero Data Retention before processing personal data from children under 13 or the applicable digital-consent age. Setting `store: false` alone does not establish that arrangement. Do not send under-13 profile information to AI.
- **Memory:** decide what conversation information is sent and saved, for how long, and how a visitor deletes it. The current site does not send profile data anywhere automatically.

## Official references

- [OpenAI production security guidance](https://developers.openai.com/api/docs/guides/production-best-practices)
- [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [OpenAI under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
- [Cloudflare Worker secrets and terminal setup](https://developers.cloudflare.com/workers/configuration/secrets/)
