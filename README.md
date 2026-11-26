# Alongside

A chat-first, mobile-first recovery support competition prototype in cream and sage, with real garden photography.

[Open Alongside](https://hintofhala21.github.io/alongside/first-visit/?new=1) · [Judges’ history page](https://hintofhala21.github.io/alongside/waicy-conversation.html)

## Start here

Use the “Open Alongside” link above in every handout, presentation, poster and report. Each opening begins with a blank profile in an isolated walkthrough. All pages and assets come from the current Pages build. Refreshing continues that walkthrough. Opening the shared link again starts a new one without changing the regular profile. Saving a profile opens Breeze. Link to the judging transcript separately as recorded evidence.

For first-time setup on a new deployment, run this in the project folder:

```sh
python3 scripts/setup-ai.py
```

On this Mac, the guide can use the Node runtime included with the ChatGPT app. It opens Cloudflare sign-in, asks for the OpenAI key with typing hidden, and saves it directly as a Cloudflare secret. It never writes that key into this project. Read [the short setup guide](docs/OPENAI-SETUP.md) first. No key is entered into Alongside’s UI.

## What changed for the competition

- Profile setup comes first. Saving the required age group opens chat.
- Phone layout, a reachable message composer, and quick bottom navigation.
- Real, self-hosted flower and garden photographs with [credits](site/credits.html).
- Height and weight fields removed. Old stored measurement values are removed on load.
- Conversations persist in the browser and have their own history page.
- Separate public judges’ history, containing only explicitly selected fictional Breeze demos. It starts empty; no fabricated AI transcripts are included.
- A private Breeze agent with conversation memory, reviewed information retrieval, follow-up questions and app actions.
- Competition access code, separate publisher code, request limits and a server off switch.

## How the agent works

Breeze uses one OpenAI model and the age group selected during profile setup. All profiles have a text box and question suggestions throughout the chat. Children and teens can type supported general questions or select them. Unmatched personal drafts stay in the text box. The server accepts only known question IDs from these sessions. Adults can consent to sending their own words. All replies appear in the same conversation. Health facts use approved summaries with sources. Users can also open a check-in, plan, meal chooser or care directory.

Private conversations cannot be published to the judges’ history. Invited judges can try fictional examples. Alongside has not been clinically validated.

## Calendar and WhatsApp reminders

Open **Reminders** from Breeze to review your plan. A calendar subscription shares the times you choose. Confirm the subscription in your calendar app. You can also download a week as a calendar file. For ongoing reminders across visits, use the regular profile link in Reminders.

WhatsApp stays off until the owner connects a business sender. Once connected, users opt in, confirm from their own phone, and can stop from the site or by replying STOP. See the [owner’s WhatsApp setup guide](reminders/README.md).

## The project, simply

`site/` is the public website. `api/` is the private server code; its code can be public, but its keys cannot. `shared/library.json` is the approved information used by both. `scripts/` prepares and checks the release. Only `build/site/` is published to Pages.

Browser storage is a notebook on one device. Cloudflare’s small Durable Object database holds demo conversation memory and controls who can publish a selected demo. It is created automatically by the setup, without a database ID to copy.

## Deploy

Alongside deploys to Railway as one service: website, Breeze API, calendar feeds and reminders. Follow [the Railway guide](DEPLOY-RAILWAY.md).

## Check or preview

With Node 24 installed:

```sh
npm run check
npm test
npm run build
npm run preview
```

Open http://127.0.0.1:4173. The automated tests use a simulated OpenAI response, so they do not spend API credits. GitHub Pages runs the checks and republishes after updates to `main`.

See [release limits](PRODUCTION.md), [security notes](SECURITY.md), and [privacy](site/privacy.html). Real clinical use still needs clinical, privacy, age and consent review.
