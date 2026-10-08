export type FaqMainType = 'start' | 'student' | 'teacher' | 'jobseeker' | 'ai' | 'commerce' | 'account';

export interface FaqLink {
  label: string;
  route: string;
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  steps?: string[];
  note?: string;
  links?: FaqLink[];
  types: FaqMainType[];
  keywords?: string;
  topic?: string;
  subtopic?: string;
  tags?: string[];
}

export interface FaqChapter {
  id: string;
  number: number;
  title: string;
  summary: string;
  icon: string;
  entries: FaqEntry[];
}

export const FAQ_TYPE_OPTIONS: Array<{ id: 'all' | FaqMainType; label: string; icon: string }> = [
  { id: 'all', label: 'All topics', icon: 'fa-book' },
  { id: 'start', label: 'Getting started', icon: 'fa-compass' },
  { id: 'student', label: 'Students', icon: 'fa-graduation-cap' },
  { id: 'teacher', label: 'Teachers', icon: 'fa-pencil-square-o' },
  { id: 'jobseeker', label: 'Job seekers', icon: 'fa-briefcase' },
  { id: 'ai', label: 'AI services', icon: 'fa-comments' },
  { id: 'commerce', label: 'Shopping & money', icon: 'fa-shopping-cart' },
  { id: 'account', label: 'Account & security', icon: 'fa-user-circle' },
];

const BASE_FAQ_CHAPTERS: FaqChapter[] = [
  {
    id: 'welcome-navigation', number: 1, title: 'Welcome and navigation', icon: 'fa-map-signs',
    summary: 'Understand the Cheradip platform, its main services, and where to begin.',
    entries: [
      { id: 'what-is-cheradip', question: 'What is Cheradip?', answer: 'Cheradip is a connected education and digital-services platform. Its main website provides curriculum questions, exams, dashboards, packages, AI learning tools, institutional information, account services, referrals, wallet facilities, and shopping features.', types: ['start'], keywords: 'overview purpose website' },
      { id: 'where-start', question: 'Where should a new user start?', answer: 'Begin on the home page, choose the service you need, then create an account if you want saved progress, packages, coins, exams, question creation, referrals, or wallet features.', steps: ['Open the home page.', 'Choose Questions, Student Zone, Packages, AI Tutor, NTRCA, Institutes, or eCommerce.', 'Use SignUp to create an account, then Login.'], links: [{ label: 'Home', route: '/' }, { label: 'Create account', route: '/auth' }], types: ['start'] },
      { id: 'platform-list', question: 'Which services are available from the home page?', answer: 'The platform directory links to education services, Questions and Topics, Student Zone, Packages, NTRCA, Institutes, Cheradip AI, AI Tutor, Cheradip AI Agent, AI Language Tutor, eCommerce, Cart, and Choice tools. Availability may depend on account state or the selected product.', links: [{ label: 'Platform directory', route: '/index' }], types: ['start', 'ai', 'commerce'] },
      { id: 'old-paths-subdomains', question: 'Do old paths and product subdomains open the same services?', answer: 'Yes. Existing routes such as /tutor, /agent, /cheradip, /ailt, and /ecommerce remain supported, while product subdomains can present the corresponding service directly.', types: ['start', 'ai'] },
      { id: 'main-domain', question: 'What is available at cheradip.com?', answer: 'cheradip.com is the main platform entrance for accounts, questions, exams, packages, dashboards, NTRCA and institute information, referrals, rewards, shopping links, FAQs, and the directory of Cheradip products.', links: [{ label: 'Cheradip home', route: '/' }], types: ['start'], keywords: 'main domain website homepage' },
      { id: 'ai-subdomain', question: 'What is ai.cheradip.com for?', answer: 'ai.cheradip.com is the Cheradip AI landing page. It introduces and links the AI Tutor, Cheradip AI Agent, and AI Language Tutor services. During local development the equivalent retained route is /ai.', links: [{ label: 'Cheradip AI', route: '/ai' }], types: ['start', 'ai'], keywords: 'ai.cheradip.com subdomain /ai' },
      { id: 'tutor-subdomain', question: 'What is tutor.cheradip.com for?', answer: 'tutor.cheradip.com opens the curriculum-aware AI Tutor where learners select education level, subject, chapter, and topic before asking a question. The retained local and direct route is /tutor.', links: [{ label: 'AI Tutor', route: '/tutor' }], types: ['student', 'teacher', 'jobseeker', 'ai'], keywords: 'tutor.cheradip.com subdomain /tutor curriculum' },
      { id: 'agent-subdomain', question: 'What is agent.cheradip.com for?', answer: 'agent.cheradip.com presents the Cheradip AI Agent product and its user manual for coding, chat, planning, composer, and multi-file assistance. The retained routes are /agent and the previously published /cheradip alias.', links: [{ label: 'Cheradip AI Agent', route: '/agent' }], types: ['start', 'ai'], keywords: 'agent.cheradip.com subdomain /agent /cheradip coding agent' },
      { id: 'ailt-subdomain', question: 'What is ailt.cheradip.com for?', answer: 'ailt.cheradip.com presents AI Language Tutor, including offline-first language learning, pronunciation, translation, practice, and AI explanations. The retained route is /ailt.', links: [{ label: 'AI Language Tutor', route: '/ailt' }], types: ['student', 'teacher', 'jobseeker', 'ai'], keywords: 'ailt.cheradip.com subdomain /ailt language tutor' },
      { id: 'ecommerce-subdomain', question: 'What is ecommerce.cheradip.com for?', answer: 'ecommerce.cheradip.com is the Cheradip marketplace for products, categories, carts, orders, and commerce features as they become available. The retained route is /ecommerce.', links: [{ label: 'eCommerce', route: '/ecommerce' }], types: ['start', 'commerce'], keywords: 'ecommerce.cheradip.com subdomain /ecommerce marketplace shop' },
      { id: 'header-country', question: 'What does the country flag in the header control?', answer: 'It selects the website country and preferred language context. Bangladesh is the default. Your explicit later selection is remembered in the browser.', types: ['start', 'account'], keywords: 'flag language bangladesh translate' },
      { id: 'header-coins', question: 'What is the coin counter near the token box?', answer: 'It displays the current Cheradip account coin balance. Coins are used for eligible paid actions when a package does not cover them.', types: ['start', 'commerce', 'account'] },
    ],
  },
  {
    id: 'accounts-login', number: 2, title: 'Accounts, login and security', icon: 'fa-lock',
    summary: 'Create and secure Student, Teacher, or Job Seeker accounts.',
    entries: [
      { id: 'account-types', question: 'Which account types can I create?', answer: 'You can create a Student, Teacher, or Job Seeker account. “Job Seeker” is stored internally as JobSeeker, but it is shown with the readable label throughout the site.', types: ['start', 'account', 'student', 'teacher', 'jobseeker'] },
      { id: 'student-teacher-features', question: 'Can a Student use Teacher features?', answer: 'Yes. Students can activate Teacher packages separately and can create questions under the same package-or-coin rules. Student and Teacher subscriptions remain independent.', types: ['student', 'teacher'] },
      { id: 'teacher-student-features', question: 'Can Teachers and Job Seekers use Student packages?', answer: 'Yes. Teachers and Job Seekers can activate Student packages for study access and Teacher packages for question creation. Each family is purchased and tracked separately.', types: ['teacher', 'jobseeker', 'student'] },
      { id: 'login-method', question: 'How do I log in?', answer: 'Open Login and enter the registered mobile number or supported account identifier with your password. After successful authentication, the login overlay closes and your profile, coins, packages, and records are loaded.', links: [{ label: 'Login', route: '/login' }], types: ['account', 'start'] },
      { id: 'session-ended', question: 'Why did the site log me out?', answer: 'If the server no longer accepts the saved session, Cheradip clears the stale local login instead of showing an incorrect logged-in profile with zero coins. Log in again to create a fresh session.', types: ['account'], keywords: 'token expired zero coins session' },
      { id: 'change-password-mobile', question: 'Where can I change my password or mobile number?', answer: 'Open the profile menu and choose Update Password or Update Mobile Number. These pages require an authenticated session.', links: [{ label: 'Update password', route: '/password' }, { label: 'Update mobile', route: '/mobile' }], types: ['account'] },
      { id: 'self-reference', question: 'Can I use my own mobile number as a signup reference?', answer: 'No. The optional Reference field accepts another user’s valid reference, but self-reference is rejected.', types: ['account', 'commerce'] },
    ],
  },
  {
    id: 'profile-settings', number: 3, title: 'Profile, picture and settings', icon: 'fa-user',
    summary: 'Manage personal details, profile image, country, and account menus.',
    entries: [
      { id: 'update-profile', question: 'How do I update my profile information?', answer: 'Open the profile icon menu and select Update Profile. Save valid details for your account type; some education or professional fields appear only when relevant.', links: [{ label: 'Update profile', route: '/profile' }], types: ['account', 'student', 'teacher', 'jobseeker'] },
      { id: 'profile-picture', question: 'How do I add or replace my profile picture?', answer: 'Click or right-click the profile badge, choose Update, and select a JPG, PNG, or WebP image up to 5 MB. Cheradip crops from the centre into the existing circular badge area.', types: ['account'] },
      { id: 'clear-picture', question: 'How do I remove my uploaded profile picture?', answer: 'Click or right-click the profile badge. When a picture exists, choose Clear. The badge icon and ring become visible again.', types: ['account'] },
      { id: 'badge-ring', question: 'What does the coloured ring around my profile mean?', answer: 'The ring represents the current badge level. Free users have no earned badge; paid and activity-qualified users can progress through Star, Silver, Gold, Gold+, Platinum, Platinum+, and Titanium.', types: ['account', 'student', 'teacher', 'jobseeker'] },
      { id: 'profile-menu-balances', question: 'What do the two balances in the profile menu mean?', answer: 'The first value is the main account balance in Coins. The second is the withdrawable referral balance in Taka. They are intentionally tracked separately.', types: ['account', 'commerce'] },
      { id: 'settings-purpose', question: 'What can I control from Settings?', answer: 'Settings contains account-related preferences and, for supported AI products, provider configuration and user rules. Product-specific settings may differ between the main site, AI Tutor, AI Agent, and AI Language Tutor.', links: [{ label: 'Settings', route: '/settings' }], types: ['account', 'ai'] },
    ],
  },
  {
    id: 'coins-payments', number: 4, title: 'Coins, payments and transactions', icon: 'fa-money',
    summary: 'Understand coins, TrxID activation, purchases, and transaction history.',
    entries: [
      { id: 'coin-value-use', question: 'What are Cheradip Coins used for?', answer: 'Coins pay for eligible actions when no active package entitlement covers them, such as certain question unlocks or creation activities. Package-covered actions do not deduct coins.', types: ['commerce', 'student', 'teacher', 'jobseeker'] },
      { id: 'add-money', question: 'How do I add money or coins?', answer: 'Follow the payment instructions beside the token box, send the supported minimum payment, enter the 8- or 10-digit transaction ID, and press Apply. If automatic verification fails, contact support with the payment confirmation.', types: ['commerce', 'account'], keywords: 'trxid bkash nagad recharge token' },
      { id: 'minimum-payment', question: 'What is the minimum manual recharge amount?', answer: 'The current token-box instructions specify a minimum payment of Tk 20 through the listed bKash or Nagad number.', types: ['commerce'] },
      { id: 'transactions', question: 'Where can I see purchases and transaction records?', answer: 'Open the profile menu and choose All Transactions. This is the central place for available order and payment history.', links: [{ label: 'All transactions', route: '/myorder' }], types: ['commerce', 'account'] },
      { id: 'zero-coins-after-login', question: 'Why do I briefly see zero coins?', answer: 'The site refreshes the balance from the authenticated server session. If the session is invalid it logs out; if it is valid, the stored balance replaces the temporary display.', types: ['commerce', 'account'], keywords: 'balance missing stale login' },
      { id: 'insufficient-balance', question: 'What happens when I cannot afford a package or coin action?', answer: 'The action is not completed. A centred warning shows the required amount, available coins, and a recharge action where applicable.', types: ['commerce', 'student', 'teacher', 'jobseeker'] },
    ],
  },
  {
    id: 'packages-badges', number: 5, title: 'Packages, bases and badges', icon: 'fa-cube',
    summary: 'Learn how Student and Teacher subscriptions, renewals, levels, and discounts work.',
    entries: [
      { id: 'student-free', question: 'What does the Student Free package include?', answer: 'It automatically grants Academic and Admission study access for one month. Questions covered by the active Student package can be unlocked without coin deductions. A seven-day expiry grace follows the one-month period.', types: ['student'], keywords: 'free duration grace academic admission combined' },
      { id: 'teacher-free', question: 'What does the Teacher Free package include?', answer: 'Teacher Free remains available for 36 months and currently provides 15 Academic and 15 Admission question-creation units. Students and Job Seekers can also use this separate Teacher entitlement.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'paid-removes-free', question: 'What happens to Free packages when I activate a higher package?', answer: 'Activating any paid Student package supersedes active Student Free packages. Activating any paid Teacher package supersedes active Teacher Free packages. The other package family remains independent.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'multiple-packages', question: 'Can I keep Academic and Admission packages together?', answer: 'Yes. Academic and Admission can remain active separately. Combined covers both tracks and prevents duplicate renewal charges for the covered individual packages.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'upgrade-downgrade', question: 'How are upgrades and downgrades charged?', answer: 'A higher plan is charged and begins from its activation date. A lower plan can replace the current track without an additional charge under the downgrade rule. Activating the same unexhausted plan again reports that it is already active.', types: ['student', 'teacher', 'jobseeker', 'commerce'] },
      { id: 'renewal-grace', question: 'What happens if an automatic paid renewal fails?', answer: 'Cheradip keeps the subscription in a payment grace state for up to seven days, retries under the renewal rules, and shows periodic warnings while the user is active. Access is cancelled after the final day if payment remains unavailable.', types: ['student', 'teacher', 'jobseeker', 'commerce'] },
      { id: 'student-badges', question: 'How do Student badges progress?', answer: 'Paid status establishes New/Star or Premium/Silver bases. Higher badges depend on examinations attended and the required passing rate: Gold begins above 99 exams, followed by Gold+, Platinum, Platinum+, and Titanium.', types: ['student'] },
      { id: 'teacher-badges', question: 'How do Teacher and Job Seeker badges progress?', answer: 'Teacher-side progress uses created-question totals. Gold begins above 99 created questions, followed by Gold+, Platinum, Platinum+, and Titanium. Job Seekers use the same question-count thresholds.', types: ['teacher', 'jobseeker'] },
      { id: 'badge-maintenance', question: 'Can I lose a badge?', answer: 'Yes. To hold an earned badge, Students must attend at least 50 exams and Teachers must create at least 50 questions during the most recent three months. If maintenance is not met, the badge/base can step down while historical counts remain recorded.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'package-abbreviations', question: 'What do Aca., Adm., Com., PR, Disc., RV, Q and E mean?', answer: 'Aca. is Academic, Adm. is Admission, Com. is Combined, PR is passing rate, Disc. is the discount on the next renewal, RV is referral commission value, Q is questions created, and E is exams attended.', types: ['student', 'teacher', 'jobseeker', 'commerce'] },
    ],
  },
  {
    id: 'questions-study', number: 6, title: 'Finding and studying questions', icon: 'fa-question-circle',
    summary: 'Browse curricula, filter questions, unlock content, and save items for later.',
    entries: [
      { id: 'find-questions', question: 'How do I find questions?', answer: 'Open Questions and Topics, then select the available level, class, group, subject, chapter, topic, question type, source, or year filters. Available filters depend on the selected curriculum data.', links: [{ label: 'Questions and topics', route: '/question' }], types: ['student', 'teacher', 'jobseeker'] },
      { id: 'academic-admission-filter', question: 'How are Academic and Admission questions separated?', answer: 'Academic questions use the configured board-style subsource prefixes or an empty subsource. Admission questions use other non-empty subsources. Combined access allows both.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'unlock-one', question: 'How do I unlock one question?', answer: 'Use the lock button on that question. If a Student package covers it, no coins are deducted. Otherwise the displayed coin rule applies.', types: ['student', 'jobseeker'] },
      { id: 'unlock-page', question: 'How do I unlock or lock all questions on the current page?', answer: 'Use the page-level lock control. Individual icons update with the page state. Previously coin-purchased questions remain remembered and can be shown again without another charge.', types: ['student', 'jobseeker'] },
      { id: 'lock-colours', question: 'What do the question lock colours mean?', answer: 'A teal lock identifies a question that was already paid for and can be revealed again free. A golden lock identifies content that still requires package access or coins.', types: ['student', 'jobseeker'] },
      { id: 'liked-disappeared', question: 'Where can I find liked or hidden questions?', answer: 'Use Liked Questions for saved favourites and Disappeared Questions for questions you hid from the normal list. Both links are available from the profile menu.', links: [{ label: 'Liked questions', route: '/liked-questions' }, { label: 'Disappeared questions', route: '/disappeared-questions' }], types: ['student', 'teacher', 'jobseeker'] },
      { id: 'math-code-images', question: 'Does the question viewer support formulas, programming code, and images?', answer: 'Yes. Supported question, option, answer, and explanation content is normalised and rendered as formatted mathematics, code blocks, rich text, and images rather than raw markup whenever possible.', types: ['student', 'teacher', 'jobseeker'] },
    ],
  },
  {
    id: 'question-creation', number: 7, title: 'Creating and managing questions', icon: 'fa-pencil',
    summary: 'Create MCQ/CQ sets, use package quotas, and manage saved work.',
    entries: [
      { id: 'open-creator', question: 'How do I create questions?', answer: 'Open Questions, choose the relevant curriculum context, and use the Create Question workflow when available. Students and Job Seekers see Study wording in student-facing navigation but can still access creation under package-or-coin rules.', links: [{ label: 'Questions', route: '/question' }], types: ['teacher', 'student', 'jobseeker'] },
      { id: 'creation-cost', question: 'When are coins deducted for creating questions?', answer: 'If no active Teacher package covers the question track, creation uses the configured coin charge. With a valid Teacher package and remaining quota, the corresponding package unit is used instead.', types: ['teacher', 'student', 'jobseeker', 'commerce'] },
      { id: 'question-set-count', question: 'How are Teacher package question units counted?', answer: 'A saved MCQ batch counts as one creation unit regardless of the number of MCQs in that batch. A CQ batch also counts as one. A mixed MCQ and CQ save consumes two units.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'quota-exhausted', question: 'What happens when the Teacher question limit is exhausted?', answer: 'Further package-covered creation is blocked for that track until the package is repaid/reactivated or another eligible entitlement is used. The UI reports the exhausted quota.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'created-list', question: 'Where can I find questions I created?', answer: 'Open the profile menu and choose Created Questions. This keeps authored material separate from liked and hidden question lists.', links: [{ label: 'Created questions', route: '/created-questions' }], types: ['teacher', 'student', 'jobseeker'] },
      { id: 'question-explanations', question: 'How are answers and explanations labelled?', answer: 'Non-English subjects use the Bengali labels “উত্তর” and “ব্যাখ্যা”. Subjects whose names contain English or ইংরেজি use English answer/explanation wording. MCQ answers include the related option marker.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'report-content-problem', question: 'What should I do if a question, answer, or explanation is incorrect?', answer: 'Use the available edit/change or feedback controls where shown. Exam review pages can expose an edit workflow, while backend administrators can review submitted or pending corrections.', types: ['teacher', 'student', 'jobseeker'] },
    ],
  },
  {
    id: 'export-print', number: 8, title: 'Preview, PDF and Word export', icon: 'fa-file-pdf-o',
    summary: 'Prepare editable and printable question documents with consistent formatting.',
    entries: [
      { id: 'preview-export-match', question: 'Should exported files match the question preview?', answer: 'Yes. The export workflow is designed to preserve the question preview’s layout, option markers, labels, mathematics, code blocks, images, spacing, and page settings as closely as the target format allows.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'pdf-export', question: 'What is PDF export best for?', answer: 'Use PDF when you need a stable printable layout. Rich HTML rendering preserves formatted mathematics and images for the generated pages.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'word-export', question: 'Can exported Word equations be edited?', answer: 'The Word exporter first attempts editable OMML equation conversion. If conversion is unavailable for a formula, it can fall back to an equation image and finally to readable raw text rather than dropping the content.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'word-images', question: 'Are question images embedded in Word files?', answer: 'The exporter attempts to fetch and embed the actual image content instead of leaving only a link. An unreachable or unsupported source can still prevent embedding.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'code-export', question: 'How is programming code exported?', answer: 'Detected program blocks are kept on separate lines and use a monospaced style such as Consolas. Braced C/C++-style snippets and line-based programs should not be merged into ordinary prose.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'export-layout-controls', question: 'Which preview layout controls are available?', answer: 'The creator includes controls for font size, line height, question padding and gap, page sections, section gap, column count, column gap, and option columns. Available controls may vary by the current export mode.', types: ['teacher', 'student', 'jobseeker'] },
    ],
  },
  {
    id: 'exams-results', number: 9, title: 'Exams, results and leaderboard', icon: 'fa-clock-o',
    summary: 'Choose exams, submit attempts, review answers, and understand dashboard statistics.',
    entries: [
      { id: 'exam-types', question: 'Which exam types are available?', answer: 'The Student Zone supports Regular, Live, and Practice/Archive exam flows. Available sets can be filtered by their curriculum information.', links: [{ label: 'Student dashboard', route: '/student/dashboard' }], types: ['student', 'jobseeker'] },
      { id: 'exam-cost', question: 'Does attending an exam deduct coins?', answer: 'No. Attending every supported exam type is free. Exam activity still contributes to Student progress, statistics, rank, streak, and badge qualification where applicable.', types: ['student', 'jobseeker'] },
      { id: 'regular-filter', question: 'Can I filter exam lists?', answer: 'Yes. Exam lists use curriculum and exam-mode filters so users can narrow large collections and select a relevant exam more easily.', types: ['student', 'jobseeker'] },
      { id: 'during-exam', question: 'What information is shown during an exam?', answer: 'The exam session shows the remaining time, answered count, question options, and submission controls. The side panel can show related result and next-exam information.', types: ['student', 'jobseeker'] },
      { id: 'after-submit', question: 'What can I review after submitting?', answer: 'The result view shows score-related information, correct/wrong states, answers, expandable explanations, and available like or correction actions. You can retake the exam or move to another set.', types: ['student', 'jobseeker'] },
      { id: 'dashboard-stats', question: 'What do Exams Completed, Average Score, Current Rank and Login Streak mean?', answer: 'They aggregate exam and account activity for the logged-in user. Statistics are intended to include supported exam types rather than only Regular exams.', types: ['student', 'jobseeker'] },
      { id: 'reports-leaderboard', question: 'Where are detailed reports and rankings?', answer: 'Use Report for result history, Stats for performance summaries, and Leaderboard for comparative rank. These are available from the Student dashboard.', links: [{ label: 'Reports', route: '/student/report' }, { label: 'Statistics', route: '/student/stats' }, { label: 'Leaderboard', route: '/student/leaderboard' }], types: ['student', 'jobseeker'] },
    ],
  },
  {
    id: 'tutor-ai', number: 10, title: 'AI Tutor and AI services', icon: 'fa-comments-o',
    summary: 'Use curriculum-aware tutoring, Cloud/Home providers, and related Cheradip AI products.',
    entries: [
      { id: 'tutor-start', question: 'How do I start an AI Tutor discussion?', answer: 'Choose the education level, subject, chapter, and topic. Selecting a topic prepares a curriculum-aware discussion request. You can also type a separate question.', links: [{ label: 'Open AI Tutor', route: '/tutor' }], types: ['ai', 'student', 'teacher', 'jobseeker'] },
      { id: 'tutor-language', question: 'Which language will the Tutor use?', answer: 'The Tutor is instructed to reply in the same language as the learner’s question. English-subject answers can additionally include word meanings, sentence pronunciation support, and Bengali passage meanings where relevant.', types: ['ai', 'student'] },
      { id: 'curriculum-context', question: 'How does the Tutor use my selected topic?', answer: 'The selected level, subject, chapter, and topic are sent as silent learning context. If the question matches, the answer uses that context; otherwise it answers normally without showing a mismatch warning.', types: ['ai', 'student', 'teacher'] },
      { id: 'cloud-routing', question: 'How does Cloud AI choose a provider?', answer: 'Cloud mode can automatically choose an available provider and model. A manually selected provider is tried first when supported, followed by configured fallbacks, Brave/search-supported routing where enabled, other providers, and finally Home AI before an error is shown.', types: ['ai'] },
      { id: 'user-api-keys', question: 'Are my own AI API keys used?', answer: 'When a user saves supported provider keys in Tutor settings, requests should prefer that user-specific key. If none is configured, server-side provider configuration and fallback routing are used.', types: ['ai', 'account'] },
      { id: 'ai-quota', question: 'What happens when every Cloud provider reaches its quota?', answer: 'Cheradip tries the remaining configured fallbacks. If no Cloud or Home AI route is available, it displays an availability or quota message instead of inventing an answer.', types: ['ai'] },
      { id: 'ai-products-difference', question: 'What is the difference between AI Tutor, Cheradip AI Agent, and AI Language Tutor?', answer: 'AI Tutor focuses on curriculum learning. Cheradip AI Agent is the coding/agent product and manual. AI Language Tutor is the language-learning product. The Cheradip AI landing page helps users choose among them.', links: [{ label: 'Cheradip AI', route: '/ai' }, { label: 'AI Agent manual', route: '/agent' }, { label: 'AI Language Tutor', route: '/ailt' }], types: ['ai', 'start'] },
    ],
  },
  {
    id: 'referral-wallet', number: 11, title: 'Refer, earn and withdraw', icon: 'fa-share-alt',
    summary: 'Share a verified reference, earn commission, and request a payout safely.',
    entries: [
      { id: 'reference-link', question: 'Where do I find my reference link?', answer: 'Open Refer & Earn from the profile menu. The link uses the account’s verified mobile-based reference so it cannot be replaced by a different country-code format.', links: [{ label: 'Refer & Earn', route: '/refer' }], types: ['commerce', 'account'] },
      { id: 'referral-credit', question: 'How is referral commission credited?', answer: 'When an eligible referred user pays for a package, your current reference value determines the commission. The Taka amount is added to the Rewards Wallet, while the same earning is also converted to main-account Coins at 100 coins per Taka.', types: ['commerce', 'student', 'teacher', 'jobseeker'] },
      { id: 'rv-meaning', question: 'What is RV?', answer: 'RV means Reference Value—the percentage used to calculate eligible referral commission. It depends on the relevant membership base and badge.', types: ['commerce', 'student', 'teacher', 'jobseeker'] },
      { id: 'withdraw-limit', question: 'How much can I withdraw?', answer: 'The maximum is the currently available referral balance, not the main coin balance. The minimum withdrawal request is Tk 100.', types: ['commerce', 'account'] },
      { id: 'withdraw-methods', question: 'Which withdrawal methods are supported?', answer: 'The withdrawal page currently offers bKash, Nagad, DBBL/Rocket, and Sonali Bank. Bank withdrawal can require the account-holder name.', links: [{ label: 'Withdraw', route: '/withdraw' }], types: ['commerce', 'account'] },
      { id: 'withdraw-status', question: 'What do Pending, Processing, Approved, Rejected and Cancelled mean?', answer: 'Pending can still be cancelled by the user. Processing means an administrator has started payment and cancellation is disabled. Approved means paid. Rejected returns the reserved amount. Cancelled returns a still-pending amount to the Rewards Wallet.', types: ['commerce', 'account'] },
      { id: 'withdraw-return', question: 'Where do I go after submitting a withdrawal?', answer: 'After a successful request, Cheradip returns to the page from which you opened Withdraw. If Withdraw was opened directly, it returns to the home page.', types: ['commerce', 'account'] },
    ],
  },
  {
    id: 'ntrca-institutes', number: 12, title: 'NTRCA, institutes and education data', icon: 'fa-university',
    summary: 'Navigate public education tools, recommendation data, vacancies, and institute pages.',
    entries: [
      { id: 'ntrca-purpose', question: 'What is available in the NTRCA section?', answer: 'The NTRCA area groups supported vacancy, merit, recommendation, institute, and related education-information tools. Use the page navigation and filters appropriate to the selected dataset.', links: [{ label: 'NTRCA', route: '/ntrca' }], types: ['jobseeker', 'teacher', 'start'] },
      { id: 'vacancy-pages', question: 'Why are there different vacancy and merit pages?', answer: 'Separate pages correspond to different source rounds or datasets. Choose the round relevant to the information you need rather than combining results from unrelated cycles.', types: ['jobseeker', 'teacher'] },
      { id: 'institutes', question: 'How do I browse institutes?', answer: 'Open Institutes from the platform directory. The institute routes can show the directory and institution-specific themed pages.', links: [{ label: 'Institutes', route: '/institutes' }], types: ['jobseeker', 'teacher', 'student'] },
      { id: 'education-data-errors', question: 'What should I do if public education data looks outdated?', answer: 'Confirm the selected round, filters, and source context first. For suspected source-data problems, contact Cheradip support and include the page, record, and expected correction.', types: ['jobseeker', 'teacher'] },
      { id: 'ntrca-login', question: 'Do all NTRCA and institute pages require login?', answer: 'Public listings can be viewed without authentication where the route allows it. Saved, account-specific, paid, or administrative actions can still require login.', types: ['jobseeker', 'teacher', 'account'] },
    ],
  },
  {
    id: 'shopping-ecommerce', number: 13, title: 'Books, cart and eCommerce', icon: 'fa-shopping-bag',
    summary: 'Browse products, use the cart, and understand the Cheradip storefront.',
    entries: [
      { id: 'ecommerce-open', question: 'How do I open the Cheradip store?', answer: 'Choose eCommerce from the platform directory or open the retained /ecommerce route. The same product can also be presented through its configured subdomain.', links: [{ label: 'eCommerce', route: '/ecommerce' }], types: ['commerce', 'start'] },
      { id: 'product-types', question: 'Which product types can the store support?', answer: 'The catalog structure supports broad product categories such as clothing, electronics, mobile accessories, computer accessories, gadgets, books, and other general merchandise configured by administrators.', types: ['commerce'] },
      { id: 'cart-purpose', question: 'What is the Cart page for?', answer: 'Cart collects selected items before checkout. Product options, quantity, pricing, and delivery details depend on the selected catalog item.', links: [{ label: 'Open cart', route: '/cart' }], types: ['commerce'] },
      { id: 'books-page', question: 'Where are books listed?', answer: 'Use the Books route for the dedicated book area. Store products may also include books depending on the current catalog.', links: [{ label: 'Books', route: '/books' }], types: ['commerce', 'student', 'teacher'] },
      { id: 'order-login', question: 'Do I need to log in to place or review an order?', answer: 'The checkout/order route and transaction history are protected account features. Log in so orders and payment records can be associated with the correct account.', types: ['commerce', 'account'] },
      { id: 'shipping', question: 'How is delivery cost shown?', answer: 'The storefront calculates or displays the applicable delivery rule during the shopping flow. Confirm the current amount in the order summary before completing an order.', types: ['commerce'] },
    ],
  },
  {
    id: 'troubleshooting-support', number: 14, title: 'Troubleshooting, privacy and support', icon: 'fa-life-ring',
    summary: 'Resolve common problems and know what information to provide when asking for help.',
    entries: [
      { id: 'page-not-loading', question: 'What should I try when a page does not load correctly?', answer: 'Refresh once, confirm the server is running, check the internet connection for online features, and sign in again if the page needs authentication. Preserve any visible error text before contacting support.', types: ['start', 'account'] },
      { id: 'stale-page', question: 'Why do I still see an older design after an update?', answer: 'The browser may be using cached frontend files. Perform a hard refresh or clear the site cache, then reopen the page. Do not clear saved data unless necessary.', types: ['start', 'account'], keywords: 'cache old css update' },
      { id: 'image-upload-fails', question: 'Why is my profile image not uploading?', answer: 'Use JPG, PNG, or WebP and keep the file within the displayed 5 MB limit. If it still fails, verify that your login session is valid and the backend media endpoint is reachable.', types: ['account'] },
      { id: 'formula-raw', question: 'What should I report if raw LaTeX or code appears?', answer: 'Provide the exact question ID, page, and raw fragment. Formatting repair depends on whether the content is in the question, option, answer, explanation, preview, PDF, or Word export.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'ai-wrong-answer', question: 'What should I do when an AI answer is inaccurate or unsafe?', answer: 'Do not rely on it as an authoritative source. Refine the question with the exact textbook context, try another configured provider, and report harmful or clearly unrelated references. AI output should not invent authors, quotations, or textbook facts.', types: ['ai', 'student', 'teacher'] },
      { id: 'privacy-keys', question: 'Where are personal AI keys stored?', answer: 'Supported Tutor keys are associated with the user’s server-side account data rather than browser history. Never paste private keys into public questions, screenshots, or support messages.', types: ['ai', 'account'] },
      { id: 'contact-support', question: 'What should a useful support request contain?', answer: 'Include the page URL, account type, action attempted, expected result, actual result, exact error message, and a screenshot when safe. Never include passwords, full API keys, or sensitive payment credentials.', links: [{ label: 'Support', route: '/support' }, { label: 'Live chat', route: '/live_chat' }], types: ['start', 'account'] },
      { id: 'faq-use', question: 'How do I use this manual efficiently?', answer: 'Use the left filter panel on wide screens or the filter button below the token area on smaller screens. Select a main type or chapter, search any word, expand individual questions, or use Expand all and Print manual.', types: ['start'] },
    ],
  },
  {
    id: 'guided-workflows', number: 15, title: 'Guided workflows', icon: 'fa-list-ol',
    summary: 'Follow short, practical paths for the most common goals on Cheradip.',
    entries: [
      { id: 'first-day-student', question: 'What should a Student do on the first day?', answer: 'Complete the profile, confirm the Student dashboard opens, review the automatically activated Student Free packages, choose a subject in Questions, try one Regular or Practice exam, and open AI Tutor with a selected topic.', steps: ['Complete Update Profile.', 'Check package and coin balances.', 'Choose a subject and chapter.', 'Attend a free exam.', 'Review the result and explanation.'], links: [{ label: 'Student dashboard', route: '/student/dashboard' }], types: ['student', 'start'] },
      { id: 'first-day-teacher', question: 'What should a Teacher do on the first day?', answer: 'Complete professional information, review Teacher Free creation limits, inspect existing questions for the relevant subject, create a small MCQ or CQ batch, and check it in Created Questions before preparing an export.', links: [{ label: 'Questions', route: '/question' }, { label: 'Created questions', route: '/created-questions' }], types: ['teacher', 'start'] },
      { id: 'first-day-jobseeker', question: 'What should a Job Seeker do on the first day?', answer: 'Complete the profile, explore NTRCA and institute information, use Student packages for study and exams, and use Teacher packages when practising question creation. Both package families are available independently.', links: [{ label: 'NTRCA', route: '/ntrca' }, { label: 'Packages', route: '/packages' }], types: ['jobseeker', 'start'] },
      { id: 'daily-study-routine', question: 'What is a useful daily study routine on Cheradip?', answer: 'Choose one topic, study its filtered questions, save difficult items with Like, ask AI Tutor for one unclear concept, then complete a short exam and review every wrong answer.', types: ['student', 'jobseeker'] },
      { id: 'exam-preparation-flow', question: 'How can I prepare for an exam using the site?', answer: 'Filter questions by the target subject/chapter/source, study explanations, take a Practice exam first, review the report, then attempt a timed Regular or Live exam when available.', steps: ['Filter the exact curriculum area.', 'Study and like difficult questions.', 'Take a Practice exam.', 'Review wrong answers and explanations.', 'Retake or move to a timed set.'], types: ['student', 'jobseeker'] },
      { id: 'teacher-paper-flow', question: 'How can a Teacher prepare a printable question paper?', answer: 'Select curriculum filters, collect or create the required MCQ/CQ material, open the creator preview, adjust columns and spacing, verify answers/explanations, then export PDF for stable printing or Word for editing.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'choose-student-package', question: 'How should I choose Academic, Admission, or Combined Student access?', answer: 'Choose Academic for board-style and empty-subsource questions, Admission for non-board admission sources, and Combined when both groups are needed. Compare duration and payable amount before activation.', types: ['student', 'jobseeker', 'commerce'] },
      { id: 'choose-teacher-package', question: 'How should I choose a Teacher package?', answer: 'Choose the track matching the questions you create and compare the displayed creation-unit limit. Combined can cover both Academic and Admission creation; a package must be repaid after its quota is exhausted.', types: ['teacher', 'student', 'jobseeker', 'commerce'] },
      { id: 'best-tutor-question', question: 'How do I ask a question that produces a better Tutor answer?', answer: 'Select the correct curriculum context, name the exact lesson or passage, state what you do not understand, and request the desired form—definition, step-by-step solution, examples, pronunciation, or Bengali meaning.', types: ['ai', 'student', 'teacher', 'jobseeker'] },
      { id: 'review-ai-answer', question: 'How should I verify an AI-generated learning answer?', answer: 'Compare factual claims, authors, quotations, formulas, and textbook-specific details with the official source. Use AI for explanation and practice, not as the only authority for high-stakes facts.', types: ['ai', 'student', 'teacher', 'jobseeker'] },
      { id: 'safe-payment-flow', question: 'What is the safest way to submit a manual payment?', answer: 'Use only the payment details shown by Cheradip, keep the confirmation message, enter the exact TrxID once, and check All Transactions. Never send passwords, OTPs, PINs, or full API keys.', types: ['commerce', 'account'] },
      { id: 'referral-workflow', question: 'How do I refer someone correctly?', answer: 'Open Refer & Earn, copy the generated link, share it without editing the embedded reference, and ask the new user to keep that reference during signup. Commission applies only to eligible paid activity.', links: [{ label: 'Refer & Earn', route: '/refer' }], types: ['commerce', 'account'] },
      { id: 'withdraw-workflow', question: 'What is the complete withdrawal process?', answer: 'Open Withdraw, verify the rewards balance is at least Tk 100, choose a method, enter correct account details and amount, submit, then monitor status. Cancel only while Pending; Processing means payment work has begun.', links: [{ label: 'Withdrawal page', route: '/withdraw' }], types: ['commerce', 'account'] },
      { id: 'use-mobile', question: 'Can I use the website comfortably on a phone?', answer: 'Yes. Major pages use responsive layouts. On this manual, the filter button appears at the upper-left below the header/token area and opens the chapter drawer. Exam and question pages also expose mobile navigation controls where needed.', types: ['start', 'student', 'teacher', 'jobseeker'] },
      { id: 'print-manual', question: 'Can I save this manual as a PDF?', answer: 'Use Print manual, then choose Save as PDF in the browser print dialog. The print view removes filters and controls, expands answers, and separates chapters for easier reading.', types: ['start'] },
    ],
  },
  {
    id: 'quick-problem-solver', number: 16, title: 'Quick problem solver', icon: 'fa-wrench',
    summary: 'Match a visible symptom to the most useful next check.',
    entries: [
      { id: 'logged-in-no-records', question: 'I appear logged in, but coins and records are missing. What should I do?', answer: 'Wait briefly for the authenticated refresh. If the session is invalid, the site should log out automatically. If it remains inconsistent, log out once, log in again, and report the page if records still do not load.', types: ['account', 'commerce'] },
      { id: 'free-package-not-visible', question: 'Why is my Free package not shown as active?', answer: 'A higher active package in the same Student or Teacher family supersedes its Free packages. Free history remains recorded but should not stay active beside paid access.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'paid-package-not-visible', question: 'I paid for a package but it is not active. What should I check?', answer: 'Confirm the activation snackbar completed, check All Transactions, refresh package status, and verify that the payment applied to the intended Student or Teacher plan and track. Keep the TrxID for support.', types: ['commerce', 'student', 'teacher', 'jobseeker'] },
      { id: 'unexpected-question-charge', question: 'Why was I asked for coins when viewing a question?', answer: 'Check whether the Student package is active, whether it covers Academic or Admission content, and whether the one-month Free period plus seven-day grace has ended. Coin-purchased questions should not charge twice.', types: ['student', 'jobseeker', 'commerce'] },
      { id: 'unexpected-creation-charge', question: 'Why were coins used when creating questions?', answer: 'Question creation uses Teacher entitlements, not Student study packages. The selected track may be uncovered, the creation quota may be exhausted, or the Teacher package may have expired or been superseded.', types: ['teacher', 'student', 'jobseeker', 'commerce'] },
      { id: 'exam-list-empty', question: 'Why is an exam list empty?', answer: 'Clear or broaden filters, confirm the level/subject combination, and check the selected exam mode. Some curricula or modes may not yet have a published set.', types: ['student', 'jobseeker'] },
      { id: 'exam-result-missing', question: 'Why is a completed exam missing from statistics?', answer: 'Confirm that submission completed and the result page loaded. Refresh the dashboard once. If it remains missing, report the exam set ID, approximate time, and account—without sharing the password.', types: ['student', 'jobseeker'] },
      { id: 'question-filter-empty', question: 'Why do question filters show no results?', answer: 'One or more filters may be too restrictive, the package track may exclude that subsource, or the selected subject table may not contain matching content. Clear filters progressively to find which condition removes the results.', types: ['student', 'teacher', 'jobseeker'] },
      { id: 'word-image-link', question: 'Why does a Word export show an image link instead of an image?', answer: 'The image source may be unavailable, blocked, malformed, or unsupported at export time. Report the question ID and source URL so embedding can be checked.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'word-equation-image', question: 'Why is a Word equation an image rather than editable text?', answer: 'Editable OMML conversion is attempted first. Complex or unsupported LaTeX can fall back to an image to preserve appearance; raw formula text is the final fallback.', types: ['teacher', 'student', 'jobseeker'] },
      { id: 'tutor-unavailable', question: 'Why does Tutor say an answer could not be generated?', answer: 'The selected provider may be unavailable, out of quota, incorrectly configured, or unable to return a safe response. Try a clearer prompt, another provider when selectable, or retry after quota reset.', types: ['ai', 'student', 'teacher', 'jobseeker'] },
      { id: 'tutor-wrong-language', question: 'Why did Tutor answer in the wrong language?', answer: 'Write the learner question clearly in the desired language and keep the correct subject selected. If it persists, report the exact prompt and provider because the routing prompt is intended to request the same language.', types: ['ai', 'student'] },
      { id: 'withdraw-button-missing', question: 'Why can I not see Withdraw?', answer: 'Withdraw is an authenticated profile-menu option. Confirm the session is valid and open the profile icon. The rewards balance can be zero, but the page should still be available to a logged-in account.', types: ['commerce', 'account'] },
      { id: 'withdraw-rejected', question: 'What happens when a withdrawal is rejected?', answer: 'The reserved amount is returned to the available Rewards Wallet balance. Read any available administrator note before submitting corrected account details.', types: ['commerce', 'account'] },
      { id: 'country-still-globe', question: 'Why do I still see a globe instead of the Bangladesh flag?', answer: 'Reload once so the new default-country migration can run in the browser. If you explicitly selected Website Language later, the globe is expected and that selection is remembered.', types: ['account', 'start'] },
      { id: 'filters-on-phone', question: 'Where is the FAQ filter on a phone or narrow screen?', answer: 'Use the filter icon fixed near the upper-left below the token/header area. It opens a drawer containing search, main-type filters, and all chapters. Tap outside or press Escape to close it.', types: ['start'] },
      { id: 'report-reproducibly', question: 'How can I report a bug so it can be fixed faster?', answer: 'Describe one reproducible sequence: starting page, account type, buttons pressed, filters selected, expected result, actual result, and exact message. Include IDs and a safe screenshot, but remove passwords, keys, OTPs, and payment secrets.', types: ['start', 'account'] },
    ],
  },
];

interface FaqSupportLens {
  id: string;
  label: string;
  question: (entry: FaqEntry) => string;
  answer: (entry: FaqEntry, chapter: FaqChapter) => string;
}

const audienceLabels: Record<FaqMainType, string> = {
  start: 'new and returning visitors',
  student: 'Students',
  teacher: 'Teachers',
  jobseeker: 'Job Seekers',
  ai: 'AI-service users',
  commerce: 'shopping, payment, or rewards users',
  account: 'signed-in account holders',
};

const faqTopicLabels: Record<FaqMainType, string> = {
  start: 'Getting started and navigation',
  student: 'Student learning',
  teacher: 'Teacher tools',
  jobseeker: 'Job Seeker services',
  ai: 'AI services',
  commerce: 'Shopping, payments and rewards',
  account: 'Accounts and security',
};

function relatedPageText(entry: FaqEntry): string {
  if (!entry.links?.length) return 'Use the page or control named in the answer, or search the platform directory if it is not currently visible.';
  return `Open ${entry.links.map(link => `${link.label} (${link.route})`).join(' or ')}.`;
}

function entryTags(entry: FaqEntry, chapter: FaqChapter): string[] {
  const raw = [
    chapter.id,
    chapter.title,
    ...entry.types,
    entry.keywords || '',
    ...(entry.links || []).flatMap(link => [link.label, link.route]),
  ].join(' ').toLocaleLowerCase();
  const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'what', 'how', 'why', 'can', 'does', 'where']);
  return Array.from(new Set(raw.split(/[^a-z0-9/.-]+/i)
    .filter(value => value.length > 1 && !stopWords.has(value)))).slice(0, 18);
}

const FAQ_SUPPORT_LENSES: FaqSupportLens[] = [
  {
    id: 'quick', label: 'Quick answer',
    question: entry => `Quick answer — ${entry.question}`,
    answer: entry => `In short: ${entry.answer} Use the related page link when one is provided, and confirm the current on-screen status before repeating a paid or account-changing action.`,
  },
  {
    id: 'steps', label: 'Step-by-step',
    question: entry => `Step-by-step help — ${entry.question}`,
    answer: entry => `${entry.answer} ${entry.steps?.length ? `Follow this order: ${entry.steps.join(' ')}` : `${relatedPageText(entry)} Read the visible instructions, complete one action at a time, and verify the result before continuing.`}`,
  },
  {
    id: 'location', label: 'Where to find it',
    question: entry => `Where can I find this? — ${entry.question}`,
    answer: entry => `${relatedPageText(entry)} The same feature may also be available from the header, profile menu, dashboard, or product directory according to your account and screen size. ${entry.answer}`,
  },
  {
    id: 'eligibility', label: 'Eligibility and access',
    question: entry => `Who can use this? — ${entry.question}`,
    answer: entry => `This guidance is primarily relevant to ${entry.types.map(type => audienceLabels[type]).join(', ')}. Login, active-package, role, quota, or coin requirements still apply where the feature performs a protected or paid action. ${entry.answer}`,
  },
  {
    id: 'prepare', label: 'Before you start',
    question: entry => `What should I prepare first? — ${entry.question}`,
    answer: entry => `Before starting, confirm the correct account, page, curriculum or product selection, available package or coin balance when relevant, and a stable connection for online actions. Never prepare or share a password, OTP, PIN, or full private API key. ${entry.answer}`,
  },
  {
    id: 'result', label: 'Expected result',
    question: entry => `What result should I expect? — ${entry.question}`,
    answer: entry => `${entry.answer} A successful action should produce a visible page change, updated status, result, balance, record, or confirmation appropriate to the feature. Avoid repeating a payment-related action until its first result is known.`,
  },
  {
    id: 'troubleshoot', label: 'Troubleshooting',
    question: entry => `What should I check if this fails? — ${entry.question}`,
    answer: entry => `First recheck the selected account, filters, route, package or quota, and the exact message shown. Refresh once and sign in again only if the session appears stale. ${entry.answer} If the problem continues, keep the page URL and safe error details for support.`,
  },
  {
    id: 'support', label: 'Further support',
    question: entry => `How do I get further help? — ${entry.question}`,
    answer: entry => `${entry.answer} If this answer does not resolve the issue, use the support bot to choose the matching chapter, topic, subtopic, and tags. For later human escalation, include the page URL, account type, expected result, actual result, and safe screenshot—never secrets.`,
  },
];

function enrichEntry(entry: FaqEntry, chapter: FaqChapter): FaqEntry[] {
  const topic = entry.topic || faqTopicLabels[entry.types[0]];
  const subtopic = entry.subtopic || entry.question.replace(/[?!.]+$/, '');
  const tags = entry.tags?.length ? entry.tags : entryTags(entry, chapter);
  const direct: FaqEntry = { ...entry, topic, subtopic, tags: Array.from(new Set([...tags, 'direct answer'])) };
  const variants = FAQ_SUPPORT_LENSES.map(lens => ({
    ...entry,
    id: `${entry.id}-${lens.id}`,
    question: lens.question(entry),
    answer: lens.answer(entry, chapter),
    topic,
    subtopic,
    tags: Array.from(new Set([...tags, lens.id, lens.label.toLocaleLowerCase()])),
  }));
  return [direct, ...variants];
}

/**
 * The compact editorial entries above are expanded through practical support lenses.
 * This keeps every answer grounded in reviewed Cheradip behavior while supplying
 * more than one thousand unique, searchable questions for the manual and support bot.
 */
export const FAQ_CHAPTERS: FaqChapter[] = BASE_FAQ_CHAPTERS.map(chapter => ({
  ...chapter,
  entries: chapter.entries.flatMap(entry => enrichEntry(entry, chapter)),
}));
