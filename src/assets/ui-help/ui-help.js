(function () {
  'use strict';

  var initializedDocuments = new WeakSet();
  var routeNotes = [
    [/^\/$|^\/index\/?$/, 'Cheradip home: open education, AI, books, marketplace and account services from one place.'],
    [/^\/packages\/?$/, 'Compare Student and Teacher packages, package tracks, durations, prices, badges and referral benefits.'],
    [/^\/books\/?$/, 'Browse Cheradip books and eBooks, filter copy type, review details and place an order.'],
    [/^\/ecommerce\/?$/, 'Browse Marketplace products, search categories, manage the cart and track orders.'],
    [/^\/ai\/?$/, 'Open the Cheradip AI service directory and choose the AI product that matches your task.'],
    [/^\/tutor\/?$/, 'Use the curriculum-aware AI Tutor by selecting level, subject, chapter and topic before asking a question.'],
    [/^\/ailt(?:\/|$)/, 'Read the AI Language Tutor guide, policies and offline-first language-learning instructions.'],
    [/^\/(?:agent|cheradip|aicodingagent)(?:\/|$)/, 'Read about Cheradip AI Agent features, setup, plans, privacy, billing and support.'],
    [/^\/faqs\/?$/, 'Search the Cheradip user manual by service, chapter, topic or keyword.'],
    [/^\/live_chat\/?$/, 'Ask the support bot first, review suggested answers and continue to live support when needed.'],
    [/^\/about_us\/?$/, 'Learn about Cheradip, its purpose, services and contact information.'],
    [/^\/ntrca\/?$/, 'Open NTRCA vacancy, merit, recommendation and institute services.'],
    [/^\/vacant[5-8]\/?$/, 'Search and filter NTRCA vacant-post information for the selected cycle.'],
    [/^\/merit[5-8]\/?$/, 'Search and filter NTRCA merit information for the selected cycle.'],
    [/^\/recommend[5-8]\/?$/, 'Search and filter NTRCA recommendation information for the selected cycle.'],
    [/^\/institute\/?$/, 'Search BANBEIS institute records using the available location and institution filters.'],
    [/^\/institutes(?:\/|$)/, 'Find an institution or open its public college information page.'],
    [/^\/question\/create\/?$/, 'Create MCQ, CQ and other question types. Login, package allowance or Coins may be required.'],
    [/^\/question(?:\/|$)/, 'Browse, filter, study, unlock and manage questions for the selected curriculum.'],
    [/^\/liked-questions\/?$/, 'Review your liked questions saved for later study.'],
    [/^\/cart\/?$/, 'Review selected products, quantities and prices before checkout.'],
    [/^\/order\/?$/, 'Enter delivery and payment details to place an order. Login is required.'],
    [/^\/history\/?$/, 'Review package, product and eBook orders, then track an order by its Order ID.'],
    [/^\/login\/?$/, 'Sign in to restore your wallet, packages, orders, profile and learning records.'],
    [/^\/auth\/?$/, 'Create a Cheradip account. The optional Reference field credits a valid referrer.'],
    [/^\/dashboard\/?$/, 'Open the dashboard that matches the signed-in account and available services.'],
    [/^\/profile\/?$/, 'Review and update the signed-in user profile and profile picture.'],
    [/^\/refer\/?$/, 'Copy and share your verified reference link, then review referral earnings.'],
    [/^\/withdraw\/?$/, 'Request withdrawal from eligible reference earnings. The minimum request is Tk 100.'],
    [/^\/settings\/?$/, 'Manage account preferences and settings for the signed-in user.'],
    [/^\/password\/?$/, 'Change the password for the signed-in Cheradip account.'],
    [/^\/mobile\/?$/, 'Update and verify the mobile number connected to the Cheradip account.'],
    [/^\/created-questions\/?$/, 'Review questions created by this account.'],
    [/^\/disappeared-questions\/?$/, 'Review questions that are no longer visible in their original listing.'],
    [/^\/liked-questions\/?$/, 'Review questions saved or liked by this account.'],
    [/^\/student\/dashboard\/?$/, 'Review the active package, base progress, badge, wallet and exam activity.'],
    [/^\/student\/liveexam\/?$/, 'Find scheduled live exams and use filters to choose the correct exam.'],
    [/^\/student\/regularexam\/?$/, 'Find regular exams and use filters to choose the correct exam.'],
    [/^\/student\/archive\/?$/, 'Find practice and archived exams using the available filters.'],
    [/^\/student\/exam-set\//, 'Review the selected exam set before starting or continuing the session.'],
    [/^\/student\/exam\//, 'Answer the current exam questions and submit within the displayed rules and time.'],
    [/^\/student\/report\/?$/, 'Review completed-exam results, scores and answer details.'],
    [/^\/student\/stats\/?$/, 'Review exam totals, average score, rank, streak and progress statistics.'],
    [/^\/student\/leaderboard\/?$/, 'Compare eligible learner rankings and performance.'],
    [/^\/student\/tutor\/?$/, 'Open the signed-in student tutor experience.'],
    [/^\/admin\/?$/, 'Open the available administration entry page. Administrative permission may be required.'],
    [/^\/scrape\/?$/, 'Run the configured content collection tool. Use only permitted sources and settings.']
  ];

  var hrefNotes = {
    '/': 'Go to the Cheradip home page.',
    '/index': 'Go to the Cheradip home page.',
    '/institutes': 'Search institutions and open college information pages.',
    '/dashboard': 'Open your account dashboard.',
    '/student/dashboard': 'Open the Student Dashboard and exam progress.',
    '/question': 'Browse questions or open Study/Create Question according to your account type.',
    '/question/create': 'Create a new question. Login and a Teacher Package allowance or Coins may be required.',
    '/ntrca': 'Open NTRCA services.',
    '/liked-questions': 'Open your liked questions for later study.',
    '/cart': 'Open your shopping cart.',
    '/books': 'Browse books and eBooks.',
    '/packages': 'Compare and activate Cheradip packages.',
    '/faqs': 'Open the complete user manual and FAQs.',
    '/live_chat': 'Open guided support and live-chat escalation.',
    '/login': 'Sign in to your Cheradip account.',
    '/auth': 'Create a new Cheradip account.',
    '/profile': 'Open your profile.',
    '/history': 'Open order and purchase history.',
    '/refer': 'Open Refer & Earn and copy your verified referral link.',
    '/withdraw': 'Request an eligible reference-balance withdrawal.',
    '/settings': 'Open account settings.',
    '/ai': 'Open the Cheradip AI service directory.',
    '/tutor': 'Open the curriculum-aware AI Tutor.',
    '/ailt': 'Open the AI Language Tutor guide.',
    '/agent': 'Open the Cheradip AI Agent guide.',
    '/cheradip': 'Open the Cheradip AI Agent guide.',
    '/ecommerce': 'Open Cheradip Marketplace.'
  };

  var actionNotes = {
    'apply': 'Apply the value or selection currently entered.',
    'activate': 'Review the charge and requirements, then confirm package activation.',
    'cancel': 'Close this action without saving or charging.',
    'save': 'Save the current changes.',
    'update': 'Update the saved information with the current values.',
    'delete': 'Remove this item after confirmation. This action may not be reversible.',
    'clear': 'Clear the current value or uploaded item.',
    'search': 'Search using the entered text and selected filters.',
    'filter': 'Apply or change the filters used to narrow these results.',
    'reset': 'Return these fields or filters to their default values.',
    'submit': 'Submit the completed information for processing.',
    'login': 'Sign in to access your saved profile, wallet, packages and history.',
    'sign in': 'Sign in to access your saved profile, wallet, packages and history.',
    'signup': 'Create a Cheradip account.',
    'sign up': 'Create a Cheradip account.',
    'buy': 'Open the payment or purchase action for this item.',
    'add to cart': 'Add this item to your cart without placing the order yet.',
    'checkout': 'Review delivery and payment information before placing the order.',
    'refer': 'Open sharing options for your verified referral link.',
    'get referral link': 'Copy or prepare your verified referral link for sharing.',
    'withdraw': 'Open the reference-earnings withdrawal request.',
    'track': 'Check the current status using the entered Order ID.',
    'give exam': 'Open the exam area. Attending exams is free.',
    'start exam': 'Start the selected exam under its displayed rules and timer.',
    'create question': 'Open question creation. A package allowance or Coins may be required.',
    'study': 'Open the question area for studying and practice.',
    'unlock': 'Unlock the selected question or page. Coins may be charged when package access is unavailable.',
    'lock': 'Hide the unlocked content while preserving previously purchased access.',
    'download': 'Download the selected file to this device.',
    'export': 'Create an export using the selected format and content.',
    'print': 'Open the print view for the current content.',
    'close': 'Close this panel or message.',
    'back': 'Return to the previous page or step.',
    'next': 'Continue to the next step or item.',
    'previous': 'Return to the previous step or item.'
  };

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function routePath(doc) {
    try {
      return doc.defaultView.top.location.pathname || '/';
    } catch (_) {
      return doc.defaultView.location.pathname || '/';
    }
  }

  function pageNote(path) {
    for (var i = 0; i < routeNotes.length; i += 1) {
      if (routeNotes[i][0].test(path)) return routeNotes[i][1];
    }
    return 'Use the controls on this page to complete the displayed Cheradip service.';
  }

  function normalizedHref(element) {
    var raw = element.getAttribute('href') || element.getAttribute('routerlink') || '';
    if (!raw || raw.charAt(0) === '#') return raw;
    try {
      return new URL(raw, element.ownerDocument.baseURI).pathname.replace(/\/$/, '') || '/';
    } catch (_) {
      return raw.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
    }
  }

  function labelFor(element) {
    var explicit = cleanText(element.getAttribute('aria-label'));
    if (explicit) return explicit;
    if (element.id) {
      var label = element.ownerDocument.querySelector('label[for="' + CSS.escape(element.id) + '"]');
      if (label) return cleanText(label.textContent);
    }
    var wrappingLabel = element.closest('label');
    if (wrappingLabel) return cleanText(wrappingLabel.textContent);
    return cleanText(element.getAttribute('placeholder') || element.getAttribute('name') || element.id);
  }

  function inputNote(element) {
    var label = labelFor(element).toLowerCase();
    var type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox') return 'Select or clear this option to include or exclude the described setting.';
    if (type === 'radio') return 'Choose this option from the available choices.';
    if (label.indexOf('trx') >= 0) return 'Enter the 8 or 10 digit payment Transaction ID, then select Apply for verification.';
    if (label.indexOf('order') >= 0 && label.indexOf('id') >= 0) return 'Enter an Order ID from History to check its current status.';
    if (label.indexOf('reference') >= 0) return 'Optional: enter the referrer’s registered mobile number. Leave empty when there is no reference; self-reference is not allowed.';
    if (label.indexOf('password') >= 0 || type === 'password') return 'Enter the account password. Keep it private and do not share it with anyone.';
    if (label.indexOf('mobile') >= 0 || label.indexOf('phone') >= 0 || type === 'tel') return 'Enter the mobile number requested by this form using the displayed format.';
    if (label.indexOf('email') >= 0 || type === 'email') return 'Enter a valid email address connected to this account or request.';
    if (label.indexOf('search') >= 0 || type === 'search') return 'Type keywords to narrow the visible results.';
    if (label.indexOf('amount') >= 0) return 'Enter an amount within the displayed minimum and available-balance limits.';
    if (type === 'file') return 'Choose a supported file from this device. Review any displayed size and format requirements.';
    return label ? 'Enter ' + label.replace(/[.:]+$/, '') + ' here.' : 'Enter the requested value in this field.';
  }

  function selectNote(element) {
    var label = labelFor(element).toLowerCase();
    if (label.indexOf('country') >= 0 || label.indexOf('language') >= 0) return 'Choose your country or language to translate supported page content.';
    if (label.indexOf('level') >= 0) return 'Choose the education level used to load relevant classes, subjects and content.';
    if (label.indexOf('class') >= 0) return 'Choose the class used to load relevant subjects and content.';
    if (label.indexOf('subject') >= 0) return 'Choose a subject to load its chapters, topics, questions or exams.';
    if (label.indexOf('chapter') >= 0) return 'Choose a chapter to narrow the available topics and learning content.';
    if (label.indexOf('topic') >= 0) return 'Choose a topic to narrow the question, exam or tutor context.';
    if (label.indexOf('provider') >= 0) return 'Choose the preferred AI provider. Automatic fallback may be used when it is unavailable.';
    if (label.indexOf('model') >= 0) return 'Choose an available AI model for the selected provider.';
    if (label.indexOf('method') >= 0 || label.indexOf('access') >= 0) return 'Choose how Cheradip should access the selected AI service.';
    if (label.indexOf('copy') >= 0) return 'Choose Hard Copy, Soft Copy or Both to filter books by available format.';
    if (label.indexOf('category') >= 0) return 'Choose a category to show only matching items.';
    if (label.indexOf('filter') >= 0) return 'Choose a filter to narrow the visible results.';
    return label ? 'Choose the required ' + label.replace(/[.:]+$/, '') + '.' : 'Choose one of the available options.';
  }

  function packageNote(element) {
    var text = cleanText(element.getAttribute('aria-label') || element.textContent);
    var disabled = element.getAttribute('aria-disabled') === 'true' || element.classList.contains('package-link--disabled');
    if (disabled) return text + ' This option is already included, active or unavailable for the current selection.';
    return text + '. Review the duration, track and displayed wallet charge before confirming activation.';
  }

  function actionNoteForText(lower) {
    for (var action in actionNotes) {
      if (lower === action || lower.indexOf(action + ' ') === 0) return actionNotes[action];
    }
    return '';
  }

  function noteFor(element, path) {
    var originalTitle = cleanText(element.getAttribute('title'));
    if (originalTitle) return originalTitle;
    if (element.classList.contains('package-link')) return packageNote(element);

    var tag = element.tagName.toLowerCase();
    var text = cleanText(element.textContent).slice(0, 140);
    var lower = text.toLowerCase().replace(/[.!?:]+$/, '');
    var role = (element.getAttribute('role') || '').toLowerCase();

    if (element.classList.contains('header-country-trigger')) return 'Choose a country or language to translate supported page content.';
    if (element.classList.contains('profile-icon-trigger') || element.classList.contains('commerce-profile-trigger')) return 'Open profile, wallet, dashboard, history, withdrawal and logout options. Right-click for profile-picture options.';
    if (element.classList.contains('menu-toggle')) return 'Open or close the main navigation menu.';

    if (tag === 'input' || tag === 'textarea') return inputNote(element);
    if (tag === 'select' || role === 'combobox' || element.getAttribute('aria-haspopup') === 'listbox') return selectNote(element);
    if (tag === 'summary') return 'Expand or collapse this section.';

    if (tag === 'a') {
      var linkAction = actionNoteForText(lower);
      if (linkAction) return linkAction;
      var href = normalizedHref(element);
      if (hrefNotes[href]) return hrefNotes[href];
      if (/^https?:/i.test(element.getAttribute('href') || '')) return 'Open this external link in the configured browser tab.';
      if (text) return 'Open “' + text + '”.';
    }

    if (tag === 'button' || role === 'button' || role === 'tab' || role === 'menuitem') {
      var buttonAction = actionNoteForText(lower);
      if (buttonAction) return buttonAction;
      return text ? 'Select “' + text + '” to perform this action.' : 'Select this control to perform its action.';
    }

    if (/^h[1-6]$/.test(tag) || role === 'heading') {
      return tag === 'h1' || element.getAttribute('aria-level') === '1' ? pageNote(path) : 'This section explains “' + text + '”.';
    }

    if (tag === 'label') return 'This label identifies the related field or option: ' + text + '.';
    if (tag === 'legend') return 'These fields belong to the “' + text + '” group.';
    if (tag === 'th') return 'This column contains ' + text.replace(/[.:]+$/, '') + ' information.';

    var heading = element.querySelector && element.querySelector('h1, h2, h3, h4');
    if (heading) return 'This block contains information and actions for “' + cleanText(heading.textContent) + '”.';
    return '';
  }

  function setNote(element, note) {
    if (!note || element.getAttribute('data-ui-note') === 'off') return;
    element.setAttribute('data-ui-note', note);
    element.classList.add('ui-help-ready');
    if (element.hasAttribute('title')) {
      element.setAttribute('data-ui-original-title', element.getAttribute('title'));
      element.removeAttribute('title');
    }
  }

  function annotatePackageRows(doc) {
    if (routePath(doc).replace(/\/$/, '') !== '/packages') return;
    Array.prototype.forEach.call(doc.querySelectorAll('table.package tr'), function (row) {
      if (row.querySelector('.package-link')) {
        setNote(row, 'This row shows one package duration. Select Academic, Admission or Combined to review activation and payment.');
      } else if (row.querySelectorAll('td').length >= 5) {
        setNote(row, 'This badge row shows its required base or activity, benefit rate, renewal discount and referral value.');
      }
    });
  }

  function annotate(root, doc) {
    if (!root || root.nodeType !== 1 && root.nodeType !== 9) return;
    var path = routePath(doc);
    var selector = [
      'button', 'a[href]', 'select', 'input:not([type="hidden"])', 'textarea', 'summary',
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="combobox"]',
      '[aria-haspopup="listbox"]', '[tabindex]:not([tabindex="-1"])', '.menu-toggle',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]', 'label', 'legend', 'th', 'article', '.home-tile', '.image-container',
      '.book-card', '.product-card', '.dashboard-card', '.package-guide__article'
    ].join(',');
    var elements = root.matches && root.matches(selector) ? [root] : [];
    if (root.querySelectorAll) elements = elements.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
    elements.forEach(function (element) {
      if (element.closest('.ui-help-tooltip') || element.getAttribute('data-ui-note') === 'off') return;
      if (element.hasAttribute('data-ui-note')) return;
      setNote(element, noteFor(element, path));
    });
    annotatePackageRows(doc);
  }

  function injectStyle(doc) {
    if (doc.querySelector('link[data-ui-help-style]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/ui-help/ui-help.css';
    link.setAttribute('data-ui-help-style', 'true');
    doc.head.appendChild(link);
  }

  function initializeDocument(doc) {
    if (!doc || initializedDocuments.has(doc)) return;
    initializedDocuments.add(doc);
    injectStyle(doc);

    var tooltip = doc.createElement('div');
    tooltip.id = 'ui-help-tooltip';
    tooltip.className = 'ui-help-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(tooltip);

    var active = null;
    var showTimer = 0;
    var win = doc.defaultView;

    function position(target) {
      var rect = target.getBoundingClientRect();
      var margin = 8;
      var width = tooltip.offsetWidth;
      var height = tooltip.offsetHeight;
      var left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), win.innerWidth - width - margin);
      var top = rect.bottom + 9;
      if (top + height > win.innerHeight - margin) top = Math.max(margin, rect.top - height - 9);
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.top = Math.round(top) + 'px';
    }

    function show(target, immediate) {
      var note = target && target.getAttribute('data-ui-note');
      if (!note || note === 'off') return;
      win.clearTimeout(showTimer);
      showTimer = win.setTimeout(function () {
        active = target;
        tooltip.textContent = note;
        tooltip.setAttribute('aria-hidden', 'false');
        target.setAttribute('aria-describedby', tooltip.id);
        tooltip.classList.add('ui-help-tooltip--visible');
        position(target);
      }, immediate ? 0 : 360);
    }

    function hide(target) {
      win.clearTimeout(showTimer);
      if (target && active && target !== active) return;
      if (active && active.getAttribute('aria-describedby') === tooltip.id) active.removeAttribute('aria-describedby');
      active = null;
      tooltip.classList.remove('ui-help-tooltip--visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }

    doc.addEventListener('mouseover', function (event) {
      var target = event.target.closest && event.target.closest('[data-ui-note]:not([data-ui-note="off"])');
      if (target) show(target, false);
    }, true);
    doc.addEventListener('mouseout', function (event) {
      var target = event.target.closest && event.target.closest('[data-ui-note]:not([data-ui-note="off"])');
      if (target && (!event.relatedTarget || !target.contains(event.relatedTarget))) hide(target);
    }, true);
    doc.addEventListener('focusin', function (event) {
      var target = event.target.closest && event.target.closest('[data-ui-note]:not([data-ui-note="off"])');
      if (target) show(target, true);
    }, true);
    doc.addEventListener('focusout', function (event) {
      var target = event.target.closest && event.target.closest('[data-ui-note]:not([data-ui-note="off"])');
      if (target) hide(target);
    }, true);
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') hide(active);
    });
    win.addEventListener('scroll', function () { hide(active); }, true);
    win.addEventListener('resize', function () { if (active) position(active); });

    annotate(doc, doc);
    var queued = false;
    var pending = [];
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (node.nodeType === 1) pending.push(node);
        });
      });
      if (queued || !pending.length) return;
      queued = true;
      win.requestAnimationFrame(function () {
        queued = false;
        var nodes = pending.splice(0, pending.length);
        nodes.forEach(function (node) { annotate(node, doc); attachFrames(node); });
      });
    }).observe(doc.body, { childList: true, subtree: true });
  }

  function attachFrame(frame) {
    function onLoad() {
      try { initializeDocument(frame.contentDocument); } catch (_) { /* Cross-origin frames keep their own help UI. */ }
    }
    if (frame.getAttribute('data-ui-help-frame') === 'true') return;
    frame.setAttribute('data-ui-help-frame', 'true');
    frame.addEventListener('load', onLoad);
    onLoad();
  }

  function attachFrames(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.tagName && root.tagName.toLowerCase() === 'iframe') attachFrame(root);
    Array.prototype.forEach.call(root.querySelectorAll('iframe'), attachFrame);
  }

  function start() {
    initializeDocument(document);
    attachFrames(document);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
