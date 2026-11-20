# Security

Do not submit API keys, personal health details or profile exports in public Issues or pull requests. If you discover an exposed key, revoke it in its provider account immediately; removing it from the latest source does not remove it from repository history.

This static pilot makes no network API requests. Profiles and check-ins remain in the visitor's browser storage. Anyone with access to that browser or its developer tools may read them. Alongside does not encrypt that storage or provide authentication.

The build copies only the explicit `site/` folder. Ignore rules exclude common secret files. Checks reject unexpected public files, common credential patterns and executable inline content. These are limited preventive checks, not a complete security audit.

Never add a secret to the frontend, including through GitHub Actions. Do not add a public OpenAI proxy without real authentication, abuse protection and cost controls. See [the future AI setup guide](docs/OPENAI-SETUP.md).
