# Continue developing Alongside

This folder contains the editable project from commit ed904e3, including Breeze chat, Find care, Calendar, reminders and the tests.

## Run locally

Install Node.js 22.13 or newer (Node.js 24 is recommended). Open this folder in your editor and run these commands in its terminal.

```sh
npm run build
npm test
npm run preview
```

Open http://127.0.0.1:4173/ and keep the terminal running. Edit the source under site/ and run the build again before refreshing. The build creates build/site/. The basic preview and automated tests run without API keys.

## Where to edit

- Website layout and pages are in site/index.html. Styles and browser logic are in site/assets/.
- Breeze uses api/agent.mjs and api/prompts/v15.mjs. For live local chat on macOS, open Open-Breeze.command and use your own OpenAI key. The native Calendar helper requires Apple's command line developer tools.
- Find care uses site/assets/app.js, site/assets/places.js and api/places.mjs. Find-Care.html also opens directly. For live Places results on a Mac, open Open-Find-Care.command and supply your own Google Places API (New) key. The saved locations work without a key. Keep secrets out of the website and Git.
- Calendar and reminders have separate services under calendar/ and reminders/. The native Mac Calendar code is in mac/.

## Collaborating

This ZIP is a source snapshot. To share future commits, ask the owner for collaborator access to https://github.com/hintofhala21/alongside or create a repository you control. Before replacing files in an existing clone, compare its current main branch with this snapshot. Hosting setup is described in PRODUCTION.md.
