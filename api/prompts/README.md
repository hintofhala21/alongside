# Luna’s system prompt history

The system prompt tells Luna how to select a supportive reply, a cited library topic and an optional next step. Each reply from the live model now includes the prompt version. Earlier saved conversations may have no version.

| Version | Project revision | What changed |
| --- | --- | --- |
| [v1](v1.txt) | 92e460b | Original competition planner with English and Arabic language names. |
| [v2](v2.txt) | b11f48d | Added the French language name. |
| [v3](v3.txt) | 7e3028c | Passed the interface language code, including Spanish. |
| [v4](v4.mjs) | e04afaf | Used the shared English question and acknowledgement menus for nine interfaces. Judge demo version, moved verbatim from the original agent into its own file. |
| [v5](v5.mjs) | 2026-11-21 | Adult opt-in live chat with conversational reflections, cited library answers and optional app actions. Covered by personal-session tests. |
| [v6](v6.mjs) | 2026-11-21 | Personal and adult judge chats answer everyday messages directly. Health questions use approved summaries. Two-turn conversation and health routing covered by tests. |

The archived templates include placeholders. The listed project revision preserves the exact menus and library used to fill them.

## For the next change

Create the next numbered file. Keep previous versions and record the date, reason, and test result in a new row. Import the new version in the agent and run the chat tests before release. For a live trial, record the version and outcome with a fictional scenario. Keep private messages and access codes out of this log.

## On-device kids’ chat

Kids prompt v1 (November 2026) runs in the browser. It uses a child-oriented writer and a separate review of original text before display. Medical questions use local library material. The two instructions are kept in [kids-chat.js](../../site/assets/kids-chat.js).
