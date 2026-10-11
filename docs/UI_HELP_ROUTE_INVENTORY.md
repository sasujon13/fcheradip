# Cheradip page and subdomain help inventory

This is the source checklist for the shared hover/focus help system. Local paths remain active in development and production; product subdomains render the matching local route.

## Product domains

| Website | Local path | Purpose |
| --- | --- | --- |
| `cheradip.com` | `/` and `/index` | Main Cheradip platform directory |
| `ai.cheradip.com` | `/ai` | Cheradip AI service directory |
| `tutor.cheradip.com` | `/tutor` | Curriculum-aware AI Tutor |
| `ailt.cheradip.com` | `/ailt` | AI Language Tutor manual and app information |
| `agent.cheradip.com` | `/agent` and legacy `/cheradip` | Cheradip AI Agent manual |
| `ecommerce.cheradip.com` | `/ecommerce` | Cheradip Marketplace |

## Main public services

- `/`, `/index` — home and platform directory
- `/packages` — Student and Teacher packages, badges and benefits
- `/books` — books and eBooks
- `/ecommerce` — marketplace, cart entry and order tracking
- `/ai` — AI product directory
- `/faqs` — user manual and FAQs
- `/live_chat` — guided support
- `/about_us` — Cheradip information
- `/choice`, `/cart` — saved choices and shopping cart
- `/question` and dynamic subject/chapter/question paths — question browsing and study

## AI product and policy pages

- `/tutor`
- `/ailt`, `/ailt/terms`, `/ailt/privacy`, `/ailt/refunds`, `/ailt/delete-account`
- `/agent`, `/cheradip`, `/aicodingagent`
- `/aicodingagent/pricing`, `/aicodingagent/paddle`, `/aicodingagent/policy`
- `/aicodingagent/terms`, `/aicodingagent/privacy`, `/aicodingagent/refunds`, `/aicodingagent/support`
- `/aicodingagent/billing/success`, `/aicodingagent/billing/cancel`
- Legacy aliases `/support` and old `/ailt/*` coding-agent paths remain routable through redirects.

## NTRCA and institute services

- `/ntrca`
- `/vacant5`, `/vacant6`, `/vacant7`, `/vacant8`
- `/merit5`, `/merit6`, `/merit7`, `/merit8`
- `/recommend5`, `/recommend6`, `/recommend7`, `/recommend8`
- `/institute`, `/institutes` and dynamic `/institutes/**` college pages

## Account, wallet and order pages

- `/login`, `/auth`
- `/dashboard`, `/profile`, `/settings`, `/password`, `/mobile`
- `/refer`, `/withdraw`, `/history`
- `/order`, `/myorder`
- `/created-questions`, `/disappeared-questions`, `/liked-questions`

Protected pages retain their existing login and account guards. Hover notes explain the requirement without bypassing it.

## Question and exam pages

- `/question/create`
- `/question/:subject`
- `/question/:subject/chapter/:chapterName`
- `/question/:subject/chapter/:chapterName/question/:id`
- `/question/:subject/chapter/:chapterName/new`
- `/student/dashboard`
- `/student/liveexam`, `/student/regularexam`, `/student/archive`
- `/student/exam-set/:id`, `/student/exam/:id`
- `/student/report`, `/student/stats`, `/student/leaderboard`, `/student/tutor`

## Administrative and development pages

- `/admin` — redirects outside the Angular application to the separate Django administration site at `/api/admin/`; the user-facing help layer does not alter Django Admin.
- `/scrape`
- `/welcome` and redirect `/dev/welcome-ceremony`

## Help coverage rules

The shared help layer covers:

- navigation links and icon-only links;
- buttons and button-like controls;
- form fields, dropdowns and filters;
- page and section headings;
- table column headings;
- major cards, articles and service blocks;
- package rows, activation options, requirements and included services;
- dynamically loaded Angular content;
- same-origin Tutor, AILT and Agent iframe pages.

Existing explicit `title` text is preserved as the preferred note. Route-specific and action-specific descriptions take priority over generated fallback text. Help appears on hover and keyboard focus, closes on pointer exit, blur, scrolling or Escape, and does not change the original click action.

## Verification record

On 2026-10-11, 66 routable frontend URLs from this inventory were opened in the local application. Help annotations were present on every Angular page that rendered. `/admin` was the only URL outside that scope because it correctly redirected to the independently rendered Django administration site. Same-origin help annotations were also verified inside the Tutor, AILT and Agent iframe documents.
