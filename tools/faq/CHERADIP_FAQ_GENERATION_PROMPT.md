# Cheradip FAQ knowledge-generation prompt

Use this prompt only after reading the current source files. Its purpose is to refresh the FAQ knowledge base when routes or product behavior change; it must not invent features merely to reach a question count.

## Role

Act as a product-documentation editor and support engineer for Cheradip. Build a reliable FAQ/user manual from verified implementation evidence. A user should be able to solve a problem without opening live support.

## Required evidence pass

Read these sources before drafting:

1. `src/app/app-routing.module.ts` for every active route, alias, guard, and product page.
2. `src/app/component/index/` and `src/app/shared/header/` for navigation, account menus, balances, and platform listings.
3. Every routed component under `src/app/component/`, especially Questions, Question Creator, Student Dashboard, Exams, Packages, Books, eCommerce, Profile, Refer, Withdraw, Tutor, NTRCA, Institutes, AI landing, AI Agent, AI Language Tutor, FAQ, and Live Chat.
4. The Angular services and guards used by those pages so access and session answers match actual behavior.
5. Django URLs, views, serializers, models, membership logic, commerce logic, and AI routing in the sibling `bcheradip` project.
6. Product subdomain and retained-path configuration for `cheradip.com`, `ai.cheradip.com`, `tutor.cheradip.com`, `agent.cheradip.com`, `ailt.cheradip.com`, and `ecommerce.cheradip.com`.
7. Existing `faq-content.ts`; preserve correct editorial answers, replace obsolete claims, and add only genuinely missing problems.

For every factual statement, identify the route, component, service, view, model, or configuration that supports it. If implementation is incomplete or ambiguous, say that clearly. Never describe planned behavior as already available.

## Content rules

- One FAQ entry must solve one distinct user problem. Do not create “Quick answer”, “Step-by-step”, “Where is it?”, or similar copies of the same entry.
- Questions should use the wording a Student, Teacher, Job Seeker, shopper, or administrator would naturally type.
- Answers must lead with the direct result, then explain conditions, exact steps, expected outcome, and a safe recovery path when those details are relevant.
- State whether login, package access, coins, quota, payment approval, stock, or a private tracking token is required.
- Distinguish Student packages from Teacher packages and digital books from hard copies.
- Never expose passwords, OTPs, PINs, API keys, private tracking tokens, or private download URLs.
- Do not promise a refund, payment, quota, external AI response, or human-support response unless the current implementation guarantees it.
- Use internal links only when the route exists in `app-routing.module.ts`.
- Prefer precise values only when verified in current code. Otherwise instruct the reader to check the amount or state currently displayed.
- Keep answers concise but complete—normally 60–180 words or 3–7 ordered steps.
- Write canonical FAQ content in clear English. Include Bengali interface labels where they help users identify the actual control.

## Coverage checklist

Cover at least: onboarding; account types; login/session recovery; profiles and images; country/language; coins and TrxID; Student and Teacher packages; renewals, grace, downgrade and supersession; bases and badges; referrals and withdrawals; question filtering, locks and saved questions; MCQ/CQ creation; PDF/DOCX/math/code/image export; Regular, Live and Practice exams; dashboards, reports, stats and leaderboards; Tutor curriculum context and provider fallback; personal API keys and privacy; AI product differences; NTRCA and institutes; Books search, samples, formats, eBook/hard-copy purchase, payment approval and secure download; general eCommerce carts, stock, shipping, tracking and payment; error reporting; mobile use; and support escalation.

## Output schema

Return a TypeScript array containing only evidence-backed objects:

```ts
{
  id: 'stable-kebab-case-id',
  question: 'A unique user problem?',
  answer: 'Direct, complete answer.',
  steps: ['Optional ordered action'],
  note: 'Optional safety or limitation note.',
  links: [{ label: 'Existing page', route: '/verified-route' }],
  types: ['student'],
  keywords: 'useful synonyms',
  topic: 'Stable support topic',
  subtopic: 'Specific problem',
  tags: ['access', 'payment'],
}
```

## Final quality gate

Before returning content:

1. Reject duplicate IDs, normalized questions, and normalized answers.
2. Reject entries whose answer merely repeats the question or gives generic advice.
3. Verify every linked route exists.
4. Verify each chapter has a coherent purpose and no question belongs more naturally elsewhere.
5. Confirm all visible FAQ entries are independently useful; natural rephrasings belong in `searchQuestions`, not as visible entries.
6. Report coverage gaps separately instead of filling them with invented answers.
