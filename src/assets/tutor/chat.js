(function () {
  'use strict';

  var overlay = document.getElementById('chat-overlay');
  var messages = document.getElementById('chat-messages');
  var input = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');
  var openBtn = document.getElementById('open-chat');
  var closeBtn = document.getElementById('chat-close');
  var fullscreenBtn = document.getElementById('chat-fullscreen');

  var API = '/api/tutor/search/';
  var SUGGESTIONS = ['পদার্থবিজ্ঞান', 'গণিত', 'রসায়ন', 'বাংলা', 'ICT', 'ইংরেজি', 'জীববিজ্ঞান'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function addMessage(html, className) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (className || 'assistant');
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function chip(label, query) {
    return '<button class="suggest-chip" type="button" data-q="' + esc(query) + '">' + esc(label) + '</button>';
  }

  function greeting() {
    var chips = SUGGESTIONS.map(function (s) { return chip(s, s); }).join('');
    addMessage(
      '<div class="chat-greet">আসসালামু আলাইকুম! 👋 I\'m the Cheradip AI Tutor. ' +
      'Ask me about a topic, chapter or subject and I\'ll find matching questions and suggest related topics.</div>' +
      '<div class="suggest-row">' + chips + '</div>',
      'assistant'
    );
  }

  function typingIndicator() {
    var div = document.createElement('div');
    div.className = 'chat-msg assistant chat-typing';
    div.id = 'chat-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    var t = document.getElementById('chat-typing');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }

  function topicCard(t) {
    var subj = [t.subject_name, t.chapter].filter(Boolean).join(' · ');
    return (
      '<a class="topic-card" href="' + esc(t.link) + '" target="_top">' +
        '<div class="topic-card__title">' + esc(t.topic) + '</div>' +
        '<div class="topic-card__meta">' + esc(subj || t.subject_tr || t.table_name) + '</div>' +
        '<div class="topic-card__count">' + esc(t.question_count) + ' questions →</div>' +
      '</a>'
    );
  }

  function relatedPill(t) {
    return '<a class="related-pill" href="' + esc(t.link) + '" target="_top">' + esc(t.topic) + '</a>';
  }

  function questionCard(q) {
    var opts = ['option_1', 'option_2', 'option_3', 'option_4'].map(function (k) {
      return q[k] ? '<li>' + esc(q[k]) + '</li>' : '';
    }).join('');
    return (
      '<div class="question-card">' +
        '<p class="question-card__q">' + esc(q.question) + '</p>' +
        (opts ? '<ol class="question-card__opts">' + opts + '</ol>' : '') +
        '<a class="question-card__more" href="' + esc(q.link) + '" target="_top">View in browser →</a>' +
      '</div>'
    );
  }

  function renderResult(data) {
    var html = '';
    var topics = data.topics || [];
    var related = data.related_topics || [];
    var questions = data.questions || [];

    if (topics.length) {
      html += '<div class="result-heading">🎯 Matching topics</div>';
      html += '<div class="topic-grid">' + topics.slice(0, 6).map(topicCard).join('') + '</div>';
    }
    if (related.length) {
      html += '<div class="result-heading">💡 Related topics</div>';
      html += '<div class="related-row">' + related.slice(0, 8).map(relatedPill).join('') + '</div>';
    }
    if (questions.length) {
      html += '<div class="result-heading">📝 Sample questions</div>';
      html += '<div class="questions">' + questions.map(questionCard).join('') + '</div>';
    }
    if (!html) {
      html = '<div class="chat-empty">Hmm, I couldn\'t find that in the question bank yet. ' +
        'Try a broader word — e.g. পদার্থবিজ্ঞান, গণিত or ICT.</div>';
    }
    addMessage(html, 'assistant');
  }

  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    addMessage('<p>' + esc(text) + '</p>', 'user');
    input.value = '';
    autoGrow();
    typingIndicator();
    var url = API + '?q=' + encodeURIComponent(text);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        removeTyping();
        renderResult(data);
      })
      .catch(function (err) {
        removeTyping();
        addMessage(
          '<div class="chat-empty">Sorry, something went wrong reaching the question bank (' +
          esc(err.message) + '). Please try again.</div>',
          'assistant'
        );
      });
  }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  function openChat() {
    overlay.hidden = false;
    document.body.classList.add('chat-open');
    if (!messages.children.length) greeting();
    input.focus();
  }

  function closeChat() {
    overlay.hidden = true;
    document.body.classList.remove('chat-open');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    }
  }

  if (openBtn) openBtn.addEventListener('click', openChat);
  if (closeBtn) closeBtn.addEventListener('click', closeChat);
  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (sendBtn) sendBtn.addEventListener('click', function () { send(input.value); });

  if (input) {
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });
  }

  if (messages) {
    messages.addEventListener('click', function (e) {
      var chipEl = e.target && e.target.closest ? e.target.closest('.suggest-chip') : null;
      if (chipEl) send(chipEl.getAttribute('data-q'));
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && !overlay.hidden) closeChat();
  });
})();
