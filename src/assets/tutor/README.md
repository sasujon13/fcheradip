# Tutor browser host

`/tutor` opens this chat directly through the existing Angular page host.

## Source and adaptation

`extension-chat.css` and `extension-chat.js` were copied from
`D:\VSCode\extention\cheradip\media` (Cheradip Coding Agent 2.7.6).
The session bar, composer markup and icons come from `src/ui/ChatViewProvider.ts`.
The extension checkout is unchanged. `tutor-web.css` supplies the website's existing
light/teal colors and sizing; `tutor-bridge.js` replaces the VS Code webview host.
The copied renderer has small web-only changes: message-origin checks, safe media
URL schemes, and the escaped text formatter in `tutor-format.js`.

## Behavior

- Open directly, without a landing-page or modal entry step.
- Authenticated profile lookup uses the site's Bearer token; registered class is preferred where it belongs to the chosen level.
- The level dropdown loads every level from the same `question_levels` catalog used by the website; SSC is the initial selection. Levels with multiple classes also show a class dropdown.
- Guests start on SSC in a fixed level dropdown, followed by common subjects from the real catalog.
- Subjects sort by catalog serial, then numeric subject code. Overflow uses conditional left/right arrows, with no visible scrollbar.
- Changing level opens subject/chapter dropdowns, preferring ICT and Chapter 5 when present (otherwise the first available entry).
- Available topics occupy a second row. A topic click hides it until a curriculum dropdown changes.
- Subject, chapter and topic selections stay inside the chat. Stored questions are used as reference material, not displayed as question-result cards.
- Typed messages and topic clicks use `বিস্তারিত আলোচনা করুন:` for Bengali, English, mixed Bengali-English, and romanized Bengali (Banglish). Recognized other languages use localized prompts; unsupported or ambiguous non-Latin scripts retain their original wording.
- English/Bengali/Banglish explanations and headings default to Bengali script, with English only where necessary for terms, names and code. Romanized Bengali is interpreted by the model; ambiguous phrases prompt a short clarification. Other languages retain their own reply language. Explicit requests for a different output/translation language take precedence.
- Enter inserts a new line. Ctrl+Enter or the arrow button sends the message.
- Ambiguous requests use the extension's original `cheradip-ask` option cards, Others alternatives, and “None, I will clarify again!” inline composer. Clarification text also uses Enter for a newline and Ctrl+Enter / the arrow to submit. Structured cards wait until complete before rendering; related-topic suggestions wait until an actual answer.
- Free-text requests receive a bounded intent check using the chosen model (Auto uses the configured fast model), with recent conversation context. Validated clarification cards stop before retrieval/answering. Selected catalog topics skip this check. A failed check falls back to the normal tutor, which also receives the clarification contract; model intent detection remains approximate.
- Completed answers include clickable related catalog topics. Matching uses query/answer words, common English/Bengali aliases, and sibling topics for topic clicks. Unmatched free-text questions do not receive unrelated suggestions.
- Suggestions retain their own subject/chapter context, persist with each answer, and work across chat sessions. The catalog index is cached and fetched with at most three subject requests in progress.
- The context includes the selected level, subject and chapter.
- History is local to the browser and separated by account. Attachments are not persisted.
- Sessions, close/undo/redo, message edit/delete/copy, response streaming, stop,
  queued prompts, text references, @ context, export, settings and related pages work in-browser.
- The lower-right handle resizes horizontally and vertically; its arrow keys also resize.

## API and deployment

The existing `/api` Angular development proxy is used unchanged.
Django provides `/api/tutor/profile/`, `/api/tutor/models/` and `/api/tutor/chat/`.
Chat/models call the extension's same Home AI `/ide/chat` and `/ide/models` endpoints.
Set `TUTOR_HOME_AI_URL` on the Django server to change the upstream. Its default is
`http://127.0.0.1:8787` in DEBUG, and `https://ai.cheradip.com` otherwise.
Production deployment requires both frontend assets and backend changes.
SSE responses disable buffering; reverse proxies should honor `X-Accel-Buffering: no`.

## Stored references and Auto models

Every chat request sends a structured snapshot of its selected curriculum. Django looks up
matching records through `TutorTopicIndex`, then reads the published subject question tables.
References contain the question, answer choices, saved answer, and all three explanation fields.
Every published record for a resolved topic is read, including all explanation fields. Large topics are reviewed in bounded batches and cached as study notes before answering; progress is shown in chat. This is slower on the first request. Typed questions use
bounded topic matching (including common Bengali/English aliases); if necessary a selected
subject gets a bounded question-text lookup. Unmatched queries never use popular unrelated records.
No pending/private submissions are read and no source records are changed.

Retrieved context is cached for 60 seconds by query and full curriculum scope; new edits may
take up to 60 seconds to appear. Table metadata and the available-model list have separate caches.
Generated answers are not cached. Retrieval failures fall back to normal chat with a visible status.
The stream holds a small tail to detect repeated-symbol corruption (including `@@@@@@@@`) across
chunks. Corrupt replies are cleared and retried once on a different available text model; if that
fails, the user receives a readable error. Corrupt old assistant turns are excluded from model context.
Repeated prose sentences also trigger this guard; code blocks are excluded from sentence detection.
The model is told to answer the latest request, use selected curriculum context for lesson titles,
and stop after one structured clarification rather than repeatedly asking the same question.
The answer may cite source references such as `[Q1]`; source IDs are retained with chat history.
Records are evidence, not infallible instructions: the tutor checks contradictions and preserves
the input language. Retrieval improves grounding but does not guarantee model correctness.

Choose **Auto · curriculum + specialists** for adaptive routing (default for new browser histories).
The local Ollama connection uses Qwen 14B for Auto answers. Hosted Home AI deployments retain their configured routing; simple hosted questions use Qwen 7B directly. Complex coding questions use a brief Qwen 7B outline then
Qwen Coder 14B; complex general/reasoning questions use Qwen 14B after the outline. Runs are
sequential to avoid launching multiple large models together on a 16 GB GPU. The outline is
capped at 256 tokens and times out after 30 seconds; failure still permits a direct answer.
Unavailable specialist models fall back to an available model. Explicit model choices are preserved
and still receive retrieved references. Planning/model loading can make complex replies slower.

Server settings: `TUTOR_FAST_MODEL`, `TUTOR_CODING_MODEL`, `TUTOR_REASONING_MODEL`,
and `TUTOR_PLANNING_ENABLED` (defaults documented above). No model installation or index rebuild
is performed by chat requests. Keep the existing topic index updated through the site's normal workflow.

There are no sample/model fallback answers. Unrecoverable generation failures offer smaller steps through a clarification card.
The old `chat.js` question-search implementation remains in Git/workspace but is no longer loaded.

## Browser limits

VS Code's terminal, workspace edits, Git operations and provider secret storage cannot
be cloned into a normal browser page. This host uses Home AI; Agent/Composer modes
prepare explanations/code and do not execute desktop operations. Apply exports code.
The current tutor file upload accepts text context, so PDF/media OCR needs a separate
extraction service. This host reports that limit rather than sending binary files as text.
Levels absent from the catalog show an empty-state message, never invented subjects.

## Verification

Frontend: `node node_modules/@angular/cli/bin/ng.js build --configuration=development`
Formatter: `node --test scripts/test-tutor-format.cjs`
Curriculum: `node --test scripts/test-tutor-curriculum.cjs`
Backend: `venv\Scripts\python.exe manage.py test cheradip.tests.test_tutor_chat cheradip.tests.test_tutor_knowledge cheradip.tests.test_tutor_stream cheradip.tests.test_tutor_clarification cheradip.tests.test_tutor_research`

## Research, recovery and full settings

Local development can set `TUTOR_HOME_AI_URL=http://127.0.0.1:8787` and
`TUTOR_OLLAMA_URL=http://127.0.0.1:11434` in the server environment. The latter
uses Ollama structured chat roles, an 8K context and bounded generation settings.
An empty Ollama URL retains the hosted Home AI adapter. No browser-supplied upstream URL is accepted.

Resolved lesson topics query public web search and read up to three public HTML pages.
Private/local destinations, credentials in URLs and non-HTTP schemes are blocked.
Sources distinguish full article reads from search excerpts; unavailable search is reported.
The model must check that results match the lesson identity and must not invent authors or quotations.
Web lookup can be disabled in Tutor research settings.

Repeated or unreadable output is retried once with another model. If generation or
reference review still fails, a transparent clarification card offers smaller sequential
steps and free-text input instead of a dead-end error. A follow-up retains the original topic scope.

Settings now opens a full page using the extension's settings stylesheet and all 32
original field definitions. Model, chat mode, prompt preparation, related-topic footer,
user rules and web research work in the browser and are saved per account. Git,
workspace tools, cloud API keys and desktop background processes require their
respective extension/server integrations and are explicitly marked unavailable here.
The page does not pretend these desktop operations ran or store provider secrets.

Reference review notes and individual completed batches are cached for seven days under the ignored `.tutor-cache/notes` server directory. Keys include the model and exact source content, so changed explanations automatically trigger a new review. Completed batches survive server restarts and partial failures. The initial review can take several minutes for a large topic; cached follow-ups skip that work.
