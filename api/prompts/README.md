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
| [v7](v7.mjs) | 2026-11-21 | Recognize social comparison, belonging and ambivalence in context. Live comparison recorded in the [evaluation](../../docs/LUNA-EVALUATION.md). |
| [v8](v8.mjs) | 2026-11-21 | Honor the requested kind of help and avoid adding unspoken feelings to a draft. |
| [v9](v9.mjs) | 2026-11-21 | Ask what happened when context is missing, then follow the visitor’s description of eating distress. |

The archived templates include placeholders. The listed project revision preserves the exact menus and library used to fill them.

The current assistant is Breeze. Version 10 changes the displayed identity across languages and preserves the v9 recovery instructions. [Read v10](v10.mjs).

## For the next change

Create the next numbered file. Keep previous versions and record the date, reason, and test result in a new row. Import the new version in the agent and run the chat tests before release. For a live trial, record the version and outcome with a fictional scenario. Keep private messages and access codes out of this log.

## On-device kids’ chat

Kids prompt v1 (November 2026) runs in the browser. It uses a child-oriented writer and a separate review of original text before display. Medical questions use local library material. The original kids instructions are preserved in revision 1d9c38f. Version 2 adds social-comparison and help-seeking guidance to the writer and reviewer. The current instructions are kept in [kids-chat.js](../../site/assets/kids-chat.js).

Kids v3 asks the writer for a message addressed to the recipient when it recognizes a request for a draft. The same safety review still applies. A real on-device test of v2 had responded to the child instead.

Kids v4 updates the writer and reviewer to distinguish a disclosure about eating distress from a request for clinical advice.

Kids v5 adds a listening response for distress about meal photos. In the v4 live trial a child’s disclosure opened a library fallback. Both the writer and the reviewer can now select this response.
