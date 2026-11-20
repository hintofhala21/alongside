# Alongside

A cream and sage recovery support **pilot**, prepared for GitHub Pages.

## What is ready

- A profile you create yourself, stored in your browser.
- Daily meal routines, optional snacks, reminders and calendar downloads.
- Guided check-ins, daily tasks and recovery-detail updates.
- An approved information library with cited replies.
- English and Arabic interfaces, plus saved preferences for other languages.
- Profile deletion and restart on the current browser.

This version has **no account service, live AI, automatic WhatsApp sending or server database**. Profile creation is not secure sign-in. Please use sample details while testing. It is not ready to provide clinical treatment or handle a children's health service.

## Publish on GitHub Pages

1. Open [repository Pages settings](https://github.com/hintofhala21/alongside/settings/pages).
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open [Actions](https://github.com/hintofhala21/alongside/actions), select **Check and publish Alongside**, then **Run workflow** on `main` if it hasn't started already.
4. Wait for both build and deploy to turn green. The deploy job supplies the verified website address.

The expected address is **https://hintofhala21.github.io/alongside/**. It becomes usable only after a successful Pages deployment. Each later push to `main` checks and republishes the site automatically. Pull requests run checks without publishing.

## Where does the Luna key go?

**Nowhere in this GitHub Pages project.** Pages publishes files to visitors and cannot keep an OpenAI key private. Even a GitHub Actions secret would become public if inserted into the website during the build.

You chose GitHub Pages only for now, so this version deliberately makes no OpenAI requests and has no API-key box. Read [the short private-key setup guide](docs/OPENAI-SETUP.md) when you are ready for the separate server. You do not need a key to publish this version.

## Why the project looks like this

- **HTML** describes the page, **CSS** controls its cream and sage appearance, and **JavaScript** makes its buttons and forms work. Keeping these existing tools avoids a large rebuild.
- `site/` contains only files a visitor may download. `scripts/` contains preparation tools. `.github/workflows/` tells GitHub how to check and publish. Only `build/site/` is uploaded, never the whole repository.
- There is no server database yet. Browser storage is like a notebook kept on one device. It is not an account, is not encrypted by this app, and does not follow you to a new phone. Other people with access to that browser can read it.
- No packages need installing for the website build. Fewer dependencies mean fewer moving parts to maintain. GitHub runs Node to check and copy the files; visitors don't install Node.

## Preview locally

Install Node 24 LTS, then open a terminal in the repository:

```sh
npm run check
npm test
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. No API key, paid service or package installation is needed. Stop the preview with Control-C.

## Before a patient-facing launch

See [PRODUCTION.md](PRODUCTION.md) for the precise release limits and remaining work. This repository is a deployable software pilot, not a claim of clinical readiness. See [privacy and pilot limits](site/privacy.html) and [security notes](SECURITY.md).

Hosting instructions follow [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
