/* Browser implementation of the extension webview's message contract. */
(function () {
  'use strict';
  const API = '/api/';
  const el = id => document.getElementById(id);
  const emit = data => window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: window }));
  const token = () => localStorage.getItem('isLoggedIn') === 'true' ? localStorage.getItem('authToken') || '' : '';
  const owner = () => token() ? localStorage.getItem('username') || 'account' : 'guest';
  let storageKey = 'cheradip.tutor.v1.' + owner();
  let sessions = [], activeId, model = 'auto', mode = 'ask';
  let models = [], controller = null, queue = [], closed = [], redone = [], subject = null, chapter = null;
  let subjects = [], catalogRequest = 0, registered = false, context = '', initialized = false;
  const catalog = window.TutorCurriculum;
  let levels = [], levelIndex = 0, chapters = [], topics = [], pendingTopic = null;
  let classChoices = [], selectedClass = '', profileClass = '';
  const catalogCache = new Map();
  let indexPromise = null;
  const active = () => sessions.find(s => s.id === activeId);
  const newSession = () => ({ id: crypto.randomUUID(), title: 'New chat', messages: [], files: [] });
  function remember(action = { kind: 'config', model, mode }) { closed.push(action); if (closed.length > 20) closed.shift(); redone = []; }
  function applyHistory(action) {
    let inverse;
    if (action.kind === 'config') {
      inverse = { kind: 'config', model, mode }; model = action.model; mode = action.mode;
    } else if (action.kind === 'restore') {
      sessions.splice(Math.min(action.index, sessions.length), 0, action.session); activeId = action.session.id;
      inverse = { kind: 'close', id: action.session.id };
    } else {
      const index = sessions.findIndex(s => s.id === action.id);
      if (index < 0 || sessions.length < 2) return null;
      inverse = { kind: 'restore', index, session: sessions.splice(index, 1)[0] };
      if (!active()) activeId = sessions[0].id;
    }
    context = active().context || ''; el('settings-model').value = model; save(); return inverse;
  }
  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (data && Array.isArray(data.sessions)) {
        sessions = data.sessions.filter(s => s && typeof s.id === 'string' && Array.isArray(s.messages)).map(s => ({ ...s, files: [] }));
        activeId = data.activeId; model = data.model || model; mode = data.mode || 'ask';
      }
    } catch (_) { /* Corrupt local history must not prevent starting a new chat. */ }
    if (!sessions.length) sessions = [newSession()];
    if (!active()) activeId = sessions[0].id;
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ sessions: sessions.map(s => ({ ...s, files: [] })), activeId, model, mode })); }
    catch (_) { emit({ type: 'statusUpdate', text: 'Browser storage is full. Export this chat to keep it.' }); }
  }
  function init() {
    emit({ type: 'init', providers: [{ id: 'cheradip', label: 'Cheradip Home AI' }],
      activeProvider: 'cheradip', models: models.length ? models : [{ id: model, label: model }], activeModel: model,
      sessions: sessions.map(s => ({ id: s.id, title: s.title, active: s.id === activeId })),
      messages: active().messages, attachments: active().files.map(f => f.path), chatMode: mode,
      statusLine: 'Ready', canUndo: closed.length > 0, canRedo: redone.length > 0 });
    const empty = document.querySelector('#messages .empty p');
    if (empty) empty.textContent = 'Choose a subject, chapter and topic, or ask anything.';
    renderSuggestions();
  }
  async function json(path, options = {}) {
    const response = await fetch(API + path, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Request failed (' + response.status + ')');
    return data;
  }
  async function refreshModels() {
    try {
      const data = await json('tutor/models/');
      models = (data.models || []).filter(m => m.available !== false && !['vision', 'translation'].includes(m.category));
      models = models.map(m => m.id === 'auto' ? { ...m, label: 'Auto · curriculum + specialists' } : m);
      if (!models.some(m => m.id === model)) model = data.default_model || models[0]?.id || 'auto';
      emit({ type: 'updateModels', models, activeModel: model });
      el('settings-model').replaceChildren(...models.map(m => new Option(m.label, m.id, false, m.id === model)));
      el('connection-status').textContent = 'Home AI connected'; save();
    } catch (error) {
      el('connection-status').textContent = error.message;
      emit({ type: 'statusUpdate', text: error.message });
    }
  }
  function button(text, onClick, parent) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', onClick); parent.appendChild(b); return b;
  }
  const levelLabel = level => ({ Secondary: 'SSC', 'Higher Secondary': 'HSC' }[level.level_tr] || level.level_tr);
  const levelSubjects = () => subjects.filter(s => s.level_tr === levels[levelIndex]?.level_tr && s.class_level === selectedClass);
  const commonSubject = s => /^(bangla|bengali|english)(\s|$)|^(mathematics|general mathematics|general math|ict)$|^information.*communication/i.test(s.subject_tr);
  function updateArrows() {
    document.querySelectorAll('.curriculum-rail').forEach(rail => {
      const content = rail.querySelector('.rail-content');
      rail.querySelector('[data-direction="-1"]').hidden = rail.hidden || content.scrollLeft <= 1;
      rail.querySelector('[data-direction="1"]').hidden = rail.hidden || content.scrollLeft + content.clientWidth >= content.scrollWidth - 2;
    });
  }
  function refreshRail(id) { el(id).scrollLeft = 0; requestAnimationFrame(updateArrows); }
  function showSubjects() {
    catalogRequest++; subject = null; chapter = null; context = ''; topics = [];
    el('topics-row').hidden = true;
    const node = el('curriculum-list'); node.replaceChildren();
    for (const item of levelSubjects().filter(s => registered || !['Secondary', 'Higher Secondary'].includes(s.level_tr) || commonSubject(s))) button(item.name, () => showChapters(item), node);
    if (!node.childElementCount) node.textContent = 'No subjects available for this level yet.';
    refreshRail('curriculum-list');
  }
  function selectors() {
    const node = el('curriculum-list'); node.replaceChildren();
    if (classChoices.length > 1) {
      const classSelect = document.createElement('select'); classSelect.id = 'class-select'; classSelect.setAttribute('aria-label', 'Class');
      classChoices.forEach(value => classSelect.add(new Option('Class ' + value, value, false, value === selectedClass)));
      classSelect.addEventListener('change', () => {
        selectedClass = classSelect.value; indexPromise = null;
        const selected = catalog.defaultSubject(levelSubjects()); if (selected) void showChapters(selected);
      }); node.appendChild(classSelect);
    }
    const subjectSelect = document.createElement('select'); subjectSelect.id = 'subject-select'; subjectSelect.setAttribute('aria-label', 'Subject');
    const items = levelSubjects();
    items.forEach((s, index) => subjectSelect.add(new Option(s.name, String(index), false, s.subject_tr === subject?.subject_tr)));
    subjectSelect.addEventListener('change', () => showChapters(items[Number(subjectSelect.value)])); node.appendChild(subjectSelect);
    const chapterSelect = document.createElement('select'); chapterSelect.id = 'chapter-select'; chapterSelect.setAttribute('aria-label', 'Chapter');
    if (!chapters.length) { chapterSelect.add(new Option('No chapters available', '')); chapterSelect.disabled = true; }
    chapters.forEach((c, index) => chapterSelect.add(new Option((c.chapter_no ? c.chapter_no + '. ' : '') + c.name, String(index), false, c === chapter)));
    chapterSelect.addEventListener('change', () => showTopics(chapters[Number(chapterSelect.value)])); node.appendChild(chapterSelect);
    refreshRail('curriculum-list');
  }
  async function loadSubjects() {
    const request = ++catalogRequest; el('curriculum-list').textContent = 'Loading subjects…';
    try {
      const [profile, allLevels] = await Promise.all([
        json('tutor/profile/', { headers: token() ? { Authorization: 'Bearer ' + token() } : {} }),
        json('question_levels/')
      ]);
      if (request !== catalogRequest) return;
      registered = profile.registered; levels = allLevels.levels || []; profileClass = profile.levels?.[0]?.class_level || '';
      levelIndex = Math.max(0, levels.findIndex(level => level.level_tr === 'Secondary'));
      el('level-select').replaceChildren(...levels.map((level, index) => new Option(levelLabel(level), String(index), false, index === levelIndex)));
      el('level-select').disabled = !levels.length;
      if (levels.length) await selectLevel(false);
      else el('curriculum-list').textContent = 'No curriculum levels are available yet. You can still chat below.';
    } catch (error) {
      if (request !== catalogRequest) return;
      el('curriculum-list').textContent = error.message;
      button('Retry', loadSubjects, el('curriculum-list'));
    }
  }
  async function selectLevel(openSelectors = true) {
    const request = ++catalogRequest; const level = levels[levelIndex];
    subject = null; chapter = null; topics = []; context = ''; subjects = []; indexPromise = null;
    el('topics-row').hidden = true; el('curriculum-list').textContent = 'Loading subjects…'; updateArrows();
    try {
      const data = await cached('question_subjects/?' + new URLSearchParams({ level_tr: level.level_tr }));
      if (request !== catalogRequest) return;
      subjects = catalog.sortSubjects(data.subjects || []);
      classChoices = [...new Set(subjects.map(s => s.class_level))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      selectedClass = classChoices.includes(profileClass) ? profileClass : classChoices[classChoices.length - 1] || '';
      showSubjects();
      const selected = catalog.defaultSubject(levelSubjects());
      if (openSelectors && selected) await showChapters(selected);
    } catch (error) {
      if (request !== catalogRequest) return;
      el('curriculum-list').textContent = error.message;
      button('Retry', () => selectLevel(openSelectors), el('curriculum-list')); updateArrows();
    }
  }
  function subjectParams(s) { return { level_tr: s.level_tr, class_level: s.class_level, subject_tr: s.subject_tr }; }
  function cached(path) {
    if (!catalogCache.has(path)) catalogCache.set(path, json(path).catch(error => { catalogCache.delete(path); throw error; }));
    return catalogCache.get(path);
  }
  async function showChapters(selected) {
    const request = ++catalogRequest; subject = selected; chapter = null; context = ''; topics = [];
    el('topics-row').hidden = false; el('topic-list').textContent = 'Loading topics…';
    el('curriculum-list').textContent = 'Loading chapters…';
    try {
      const data = await cached('question_chapters/?' + new URLSearchParams(subjectParams(selected)));
      if (request !== catalogRequest) return;
      chapters = catalog.sortChapters(data.chapters || []); chapter = catalog.defaultChapter(chapters); selectors();
      if (chapter) await showTopics(chapter);
      else { el('topic-list').textContent = 'No topics available for this subject yet.'; updateArrows(); }
    } catch (error) { if (request === catalogRequest) { el('curriculum-list').textContent = error.message; button('Retry', () => showChapters(selected), el('curriculum-list')); } }
  }
  async function showTopics(selected) {
    const request = ++catalogRequest; chapter = selected; topics = []; context = ''; selectors();
    el('topics-row').hidden = false; el('topic-list').textContent = 'Loading topics…';
    try {
      const data = await cached('question_topics/?' + new URLSearchParams({ ...subjectParams(subject), chapter: selected.chapter_no || selected.name }));
      if (request !== catalogRequest) return;
      topics = (data.topics || []).map(t => ({ ...t, subject, chapter: selected }));
      el('topic-list').replaceChildren(); topics.forEach(topic => button(topic.name, () => discussTopic(topic), el('topic-list')));
      if (!topics.length) el('topic-list').textContent = 'No topics available for this chapter yet.';
      refreshRail('topic-list');
    } catch (error) { if (request === catalogRequest) { el('topic-list').textContent = error.message; button('Retry', () => showTopics(selected), el('topic-list')); updateArrows(); } }
  }
  function discussTopic(topic) {
    context = [topic.subject?.level_tr, topic.subject?.class_level, topic.subject?.name, topic.chapter?.name, topic.name].filter(Boolean).join(' → ');
    pendingTopic = topic; catalogRequest++; el('topics-row').hidden = true; updateArrows();
    const topicName = /^all topics$/i.test(topic.name) ? topic.chapter.name + ' — ' + topic.name : topic.name;
    el('prompt').value = catalog.discussionPrompt(topicName);
    el('prompt').focus(); el('send').click();
  }
  async function subjectTopics(s) {
    const params = new URLSearchParams(subjectParams(s));
    const [chapterData, topicData] = await Promise.all([cached('question_chapters/?' + params), cached('question_topics/?' + params)]);
    return (topicData.topics || []).map(t => {
      const c = (chapterData.chapters || []).find(c => String(c.chapter_no) === String(t.chapter_no));
      return { ...t, subject: s, chapter: c || { name: t.chapter_no ? 'Chapter ' + t.chapter_no : '', chapter_no: t.chapter_no } };
    });
  }
  async function topicIndex() {
    if (!indexPromise) indexPromise = (async () => {
      const indexSubjects = [...levelSubjects()];
      const result = []; let next = 0, failed = false;
      // Bounded catalog requests; responses contain topic names, never question content.
      await Promise.all(Array.from({ length: Math.min(3, indexSubjects.length) }, async () => {
        while (next < indexSubjects.length) {
          const s = indexSubjects[next++];
          try {
            result.push(...await subjectTopics(s));
          } catch (_) { failed = true; }
        }
      }));
      if (failed) indexPromise = null; // Retry failed catalog requests on the next answer.
      return result;
    })();
    return indexPromise;
  }
  function renderSuggestions() {
    if (!active()) return;
    document.querySelectorAll('#messages .topic-suggestions').forEach(node => node.remove());
    const nodes = el('messages').querySelectorAll('.msg');
    active().messages.forEach((message, index) => {
      if (message.role !== 'assistant' || !message.suggestions?.length || !nodes[index]) return;
      const box = document.createElement('section'); box.className = 'topic-suggestions'; box.setAttribute('aria-label', 'Suggested topics');
      const title = document.createElement('strong'); title.textContent = 'Related topics'; box.appendChild(title);
      const buttons = document.createElement('div'); box.appendChild(buttons);
      message.suggestions.forEach(topic => {
        const b = button(topic.name, () => discussTopic(topic), buttons);
        b.title = [levelLabel(topic.subject), topic.subject.name, topic.chapter.name].filter(Boolean).join(' → ');
      });
      nodes[index].appendChild(box);
    });
  }
  async function suggest(session, responseMessage, text, selected, poolPromise) {
    const pool = await poolPromise;
    if (!session.messages.includes(responseMessage)) return;
    responseMessage.suggestions = catalog.rankTopics(pool, text, responseMessage.content, selected);
    save();
    if (active() === session) {
      const pane = el('messages'), nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100;
      renderSuggestions(); if (nearBottom) pane.scrollTop = pane.scrollHeight;
    }
  }
  function queueState() { emit({ type: 'queueSync', running: !!controller, items: queue.map(q => ({ id: q.id, text: q.text })) }); }
  function learningScope(selected) {
    const s = selected?.subject || subject, c = selected?.chapter || chapter;
    return { level_tr: s?.level_tr || levels[levelIndex]?.level_tr || '', class_level: s?.class_level || selectedClass || '',
      subject_tr: s?.subject_tr || '', chapter: c?.name || '', chapter_no: String(c?.chapter_no || ''),
      topic: selected?.name || '', selected_topic: !!selected };
  }
  async function send(message) {
    const text = String(message.text || '').trim(); if (!text) return;
    if (controller) { queue.push({ ...message, id: crypto.randomUUID(), context }); queueState(); return; }
    const session = active();
    const suggestionPool = message.selectedTopic
      ? subjectTopics(message.selectedTopic.subject).catch(() => topics.slice())
      : topicIndex();
    if (Number.isInteger(message.editFromMessageIndex)) {
      session.messages = session.messages.slice(0, message.editFromMessageIndex);
      emit({ type: 'resyncMessages', messages: session.messages });
    }
    session.messages.push({ role: 'user', content: text });
    if (session.messages.length === 1) { session.title = text.slice(0, 45); init(); }
    else emit({ type: 'userMessage', text });
    const run = new AbortController(); controller = run; queueState();
    emit({ type: 'assistantStart' }); let full = '', responseInfo = null;
    const files = [...session.files];
    const topicContext = message.context === undefined ? context : message.context;
    session.context = topicContext;
    if (topicContext) files.push({ path: 'Selected learning topic', language: 'text', content: topicContext });
    try {
      const response = await fetch(API + 'tutor/chat/', { method: 'POST', signal: run.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ messages: session.messages, model, mode, file_context: files, learning_context: message.learningContext || learningScope(message.selectedTopic) }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || data.detail || 'Chat request failed (' + response.status + ')'); }
      if (!response.body) throw new Error('Streaming is unavailable in this browser.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      const line = value => {
        if (!value.startsWith('data:')) return;
        const payload = value.slice(5).trim(); if (!payload || payload === '[DONE]') return;
        let data; try { data = JSON.parse(payload); } catch (_) { throw new Error('Invalid response from Home AI.'); }
        if (data.error) throw new Error(data.error);
        if (data.reset) { full = ''; emit({ type: 'assistantChunk', text: '' }); }
        if (data.tutor) {
          responseInfo = data.tutor;
          const text = data.tutor.reference_count ? 'Using ' + data.tutor.reference_count + ' saved curriculum references' :
            data.tutor.retrieval_unavailable ? 'Stored references unavailable · answering with Home AI' : 'Answering with Home AI';
          emit({ type: 'statusUpdate', text: data.status || text });
        }
        if (data.content) { full += data.content; emit({ type: 'assistantChunk', text: full }); }
      };
      while (true) {
        const part = await reader.read(); buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
        const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(line);
        if (part.done) { if (buffer.trim()) line(buffer); break; }
      }
      if (!full.trim()) throw new Error('Home AI returned no answer. Please retry.');
    } catch (error) {
      if (error.name === 'AbortError') full += '\n\n[Stopped]';
      else full += '\n\nUnable to complete this response: ' + error.message;
      emit({ type: 'assistantChunk', text: full });
    } finally {
      const responseMessage = { role: 'assistant', content: full, references: responseInfo?.references || [] };
      session.messages.push(responseMessage);
      emit({ type: 'assistantEnd', model: responseInfo?.answer_model || model }); controller = null; save(); queueState();
      if (!run.signal.aborted && !full.includes('Unable to complete this response:') && !full.includes('```cheradip-ask')) void suggest(session, responseMessage, text, message.selectedTopic, suggestionPool);
      if (queue.length) { const next = queue.shift(); queueState(); void send(next); }
    }
  }
  function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function notice(text) { emit({ type: 'statusUpdate', text }); }
  async function handle(msg) {
    if (controller && ['newSession','switchSession','closeSession','undo','redo','deleteMessage','resetConfig','setModel','setChatMode'].includes(msg.type)) { notice('Stop the current response before changing chats or settings.'); return; }
    switch (msg.type) {
      case 'ready': if (!initialized) { initialized = true; restore(); init(); await Promise.all([refreshModels(), loadSubjects()]); } break;
      case 'send': { const selectedTopic = pendingTopic; pendingTopic = null; void send({ ...msg, text: catalog.discussionPrompt(msg.text), selectedTopic, learningContext: learningScope(selectedTopic) }); break; }
      case 'stopGeneration': queue = []; controller?.abort(); queueState(); break;
      case 'newSession': { const session = newSession(); sessions.push(session); activeId = session.id; context = ''; init(); save(); break; }
      case 'switchSession': if (sessions.some(s => s.id === msg.sessionId)) { activeId = msg.sessionId; context = active().context || ''; init(); save(); } break;
      case 'closeSession': {
        const index = sessions.findIndex(s => s.id === msg.sessionId);
        if (index >= 0 && sessions.length > 1) { remember({ kind: 'restore', index, session: sessions[index] }); sessions.splice(index, 1); if (!active()) activeId = sessions[0].id; init(); save(); } break;
      }
      case 'undo': if (closed.length) { const inverse = applyHistory(closed.pop()); if (inverse) redone.push(inverse); init(); } break;
      case 'redo': if (redone.length) { const inverse = applyHistory(redone.pop()); if (inverse) closed.push(inverse); init(); } break;
      case 'setModel': if (model !== msg.model && models.some(m => m.id === msg.model)) { remember(); model = msg.model; el('settings-model').value = model; init(); save(); } break;
      case 'setProvider': init(); break;
      case 'setChatMode': remember(); mode = msg.mode; init(); save(); if (['agent','composer'].includes(mode)) notice('Web mode prepares answers and code. Workspace execution is available in the VS Code extension.'); break;
      case 'resetConfig': remember(); model = 'auto'; mode = 'ask'; init(); save(); break;
      case 'openSettings': el('settings-dialog').showModal(); break;
      case 'copyText': await navigator.clipboard.writeText(msg.text || ''); break;
      case 'attachMedia': el('file-picker').click(); break;
      case 'removeAttachment': active().files = active().files.filter(f => f.path !== msg.path); emit({ type: 'attachments', files: active().files.map(f => f.path) }); break;
      case 'deleteMessage': {
        const index = msg.messageIndex, messages = active().messages;
        if (Number.isInteger(index) && index >= 0 && index < messages.length) {
          const count = messages[index].role === 'user' && messages[index + 1]?.role === 'assistant' ? 2 : 1;
          messages.splice(index, count); init(); save();
        }
        break;
      }
      case 'insertMention': emit({ type: 'insertAtPrompt', text: '@' }); handle({ type: 'requestMentionMenu' }); break;
      case 'insertMentionAt': emit({ type: 'insertAtPrompt', text: msg.text }); break;
      case 'requestMentionMenu': emit({ type: 'mentionMenu', items: [
        ...(context ? [{ label: 'Selected topic', insert: context, description: 'Subject → chapter → topic' }] : []),
        ...active().files.map(f => ({ label: f.path, insert: '@' + f.path, description: 'Attached reference' }))] }); break;
      case 'removeQueueItem': queue = queue.filter(q => q.id !== msg.id); queueState(); break;
      case 'updateQueueItem': { const q = queue.find(q => q.id === msg.id); if (q) q.text = msg.text; queueState(); break; }
      case 'applyCode': download(msg.code, 'cheradip-code.txt'); break;
      case 'downloadMedia': { const url = new URL(msg.url, location.href); if (!['http:','https:','blob:'].includes(url.protocol)) throw new Error('Unsupported download URL'); const a = document.createElement('a'); a.href = url.href; a.download = msg.filename || 'download'; a.target = '_blank'; a.rel = 'noopener'; a.click(); break; }
      default: notice('This action needs the Cheradip VS Code extension.');
    }
  }
  window.acquireVsCodeApi = () => ({ postMessage: msg => { Promise.resolve(handle(msg)).catch(error => notice(error.message)); } });
  el('level-select').addEventListener('change', () => {
    levelIndex = Number(el('level-select').value); void selectLevel();
  });
  document.querySelectorAll('.curriculum-rail').forEach(rail => {
    const content = rail.querySelector('.rail-content');
    rail.querySelectorAll('.rail-arrow').forEach(arrow => arrow.addEventListener('click', () => {
      content.scrollBy({ left: Number(arrow.dataset.direction) * Math.max(160, content.clientWidth * .7), behavior: 'smooth' });
    }));
    content.addEventListener('scroll', updateArrows, { passive: true });
    new ResizeObserver(updateArrows).observe(content);
  });
  el('file-picker').addEventListener('change', async event => {
    const session = active();
    for (const file of event.target.files) {
      if (session.files.length >= 9 || file.size > 150000) { notice('Use up to 9 reference files, each under 150 KB.'); break; }
      if (session.files.some(f => f.path === file.name)) continue;
      if (/^(image|audio|video)\//.test(file.type) || /\.pdf$/i.test(file.name)) {
        notice('This Home AI chat API accepts text context. Extract text from media/PDF files before attaching.'); continue;
      }
      session.files.push({ path: file.name, content: await file.text(), language: 'text' });
    }
    event.target.value = ''; emit({ type: 'attachments', files: active().files.map(f => f.path) });
  });
  el('settings-model').addEventListener('change', event => { handle({ type: 'setModel', model: event.target.value }); emit({ type: 'updateModels', models, activeModel: model }); });
  el('refresh-models').addEventListener('click', refreshModels);
  el('export-chat').addEventListener('click', () => download(active().messages.map(m => m.role.toUpperCase() + '\n' + m.content).join('\n\n'), 'cheradip-chat.txt'));
  el('resize-reset').addEventListener('click', () => { el('chat-shell').style.width = ''; el('chat-shell').style.height = ''; });
  const handleResize = el('resize-handle'), shell = el('chat-shell');
  let drag = null;
  function resize(width, height) {
    const available = document.body.clientWidth - (innerWidth <= 600 ? 0 : 36);
    shell.style.width = Math.max(Math.min(360, available), Math.min(width, available)) + 'px';
    shell.style.height = Math.max(430, Math.min(height, innerHeight - (innerWidth <= 600 ? 0 : 36))) + 'px';
  }
  handleResize.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY, width: shell.offsetWidth, height: shell.offsetHeight };
    handleResize.setPointerCapture(event.pointerId); event.preventDefault();
  });
  handleResize.addEventListener('pointermove', event => { if (drag) resize(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y); });
  handleResize.addEventListener('pointerup', () => { drag = null; });
  handleResize.addEventListener('pointercancel', () => { drag = null; });
  handleResize.addEventListener('keydown', event => {
    const change = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
    if (change) { event.preventDefault(); resize(shell.offsetWidth + change[0], shell.offsetHeight + change[1]); }
  });
  el('fullscreen').addEventListener('click', () => { const action = document.fullscreenElement ? document.exitFullscreen() : el('chat-shell').requestFullscreen(); action.catch(error => notice(error.message)); });
  document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
    el('related-frame').src = '/assets/aicodingagent/' + (b.dataset.page === 'manual' ? 'index' : b.dataset.page) + '.html';
    el('page-dialog').showModal();
  }));
  window.addEventListener('storage', event => {
    if (['authToken','isLoggedIn','username'].includes(event.key)) {
      // A reload cancels the old account's work before loading the new account's history.
      queue = []; controller?.abort(); location.reload();
    }
  });
})();
