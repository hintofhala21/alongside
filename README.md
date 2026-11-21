# Alongside

A chat-first, mobile-first recovery support competition prototype in cream and sage, with real garden photography.

[Open Alongside](https://hintofhala21.github.io/alongside/) · [Judges’ history page](https://hintofhala21.github.io/alongside/history.html?view=showcase)

## Start here

The main link opens Chat. Adults can choose “Chat with Luna,” confirm their age and consent, and send their own messages. On-device library chat is available to everyone. The separate judge invitation still opens the competition demo.

For first-time setup on a new deployment, run this in the project folder:

```sh
python3 scripts/setup-ai.py
```

On this Mac, the guide can use the Node runtime included with the ChatGPT app. It opens Cloudflare sign-in, asks for the OpenAI key with typing hidden, and saves it directly as a Cloudflare secret. It never writes that key into this project. Read [the short setup guide](docs/OPENAI-SETUP.md) first. No key is entered into Alongside’s UI.

## What changed for the competition

- Chat is the first page; no profile is created for you.
- Phone layout, a reachable message composer, and quick bottom navigation.
- Real, self-hosted flower and garden photographs with [credits](site/credits.html).
- Height and weight fields removed. Old stored measurement values are removed on load.
- Conversations persist in the browser and have their own history page.
- Separate public judges’ history, containing only explicitly selected fictional Luna demos. It starts empty; no fabricated AI transcripts are included.
- A private Luna agent with conversation memory, reviewed information retrieval, follow-up questions and app actions.
- Competition access code, separate publisher code, request limits and a server off switch.

## How the agent works

In live chat, Luna writes an original reply to a typed message or a suggested question. It uses the recent conversation for follow-ups. Everyday subjects can stand on their own. For a medical question, the server displays an approved library answer with its sources or explains that the topic is outside the library. Luna can also offer to open a check-in, a routine or the care directory.

Younger visitors can open **Kids’ chat** without a profile. On compatible devices and languages, it runs the browser’s own language model for original replies and follow-ups. This chat exists only in the open dialog. The browser may need a model download first. When local AI is unavailable, the dialog offers the on-device library. Personal sessions cannot publish to the public history. The pilot offers general support and has no clinical validation.

Younger builders can test Luna using server-defined fictional scenarios. Free-text competition testing requires an adult judge’s attestation and an invitation code. This is not a verified patient account or a children’s medical service.

## The project, simply

`site/` is the public website. `api/` is the private server code; its code can be public, but its keys cannot. `shared/library.json` is the approved information used by both. `scripts/` prepares and checks the release. Only `build/site/` is published to Pages.

Browser storage is a notebook on one device. Cloudflare’s small Durable Object database holds demo conversation memory and controls who can publish a selected demo. It is created automatically by the setup, without a database ID to copy.

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
