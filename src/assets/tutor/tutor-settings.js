(async function () {
  'use strict';
  const owner = localStorage.getItem('isLoggedIn') === 'true' ? localStorage.getItem('username') || 'account' : 'guest';
  const authToken = localStorage.getItem('isLoggedIn') === 'true' ? localStorage.getItem('authToken') || '' : '';
  const key = 'cheradip.tutor.settings.' + owner;
  const schema = await (await fetch('settings-schema.json')).json();
  const data = await fetch('/api/tutor/models/').then(r => r.json()).catch(() => ({ models: [], providers: {}, warning: 'Tutor services are unavailable.' }));
  const accountSettings = authToken ? await fetch('/api/tutor/settings/', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + authToken } }).then(r => r.json()).catch(() => ({})) : {};
  let values; try { values = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { values = {}; }
  const defaults = { ...schema.values, model: 'auto', chatMode: 'ask', webSearch: true, promptReadyEnabled: true, taskWrapUpEnabled: true, userRules: '', apiKeys: {} };
  values = { ...defaults, ...values, apiKeys: { ...(defaults.apiKeys || {}), ...(values.apiKeys || {}) } };
  if (accountSettings.signed_in) {
    values.provider = accountSettings.provider || values.provider;
    values.model = accountSettings.model || values.model;
    // Signed-in keys belong in the encrypted account JSON, not in browser storage.
    values.apiKeys = {};
    localStorage.setItem(key, JSON.stringify(values));
  }
  try {
    const chat = JSON.parse(localStorage.getItem('cheradip.tutor.v1.' + owner) || '{}');
    if (chat.model) values.model = chat.model;
    if (chat.mode) values.chatMode = chat.mode;
  } catch (_) { /* Keep usable defaults if the saved chat is damaged. */ }
  values.apiUrl = data.tutor?.home_ai_url || values.apiUrl;
  const supported = new Set(['provider', 'model', 'chatMode', 'userRules', 'webSearch', 'promptReadyEnabled', 'taskWrapUpEnabled']);
  const providerLabels = { cheradip: 'Cheradip Home AI', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google Gemini', groq: 'Groq', mistral: 'Mistral', deepseek: 'DeepSeek', openrouter: 'OpenRouter' };
  const app = document.getElementById('app');
  function element(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
  function toast(text) { const n = document.getElementById('toast'); n.textContent = text; n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 3500); }
  async function syncAccount(apiKeys) {
    if (!authToken) return true;
    try {
      const response = await fetch('/api/tutor/settings/', { method: 'POST', headers: {
        'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + authToken,
      }, body: JSON.stringify({ provider: values.provider, model: values.model, api_keys: apiKeys || {} }) });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Account settings could not be saved.');
      accountSettings.key_status = result.key_status || accountSettings.key_status;
      return true;
    } catch (error) { toast(error.message); return false; }
  }
  function save() { localStorage.setItem(key, JSON.stringify(values)); void syncAccount(); parent.postMessage({ type: 'tutorSettingsChanged' }, location.origin); }
  function providerModels(provider) {
    if (provider === 'cheradip') return (data.models || []).filter(m => m.available !== false && !['vision', 'translation'].includes(m.category));
    const info = data.providers?.[provider] || {};
    return (info.models || []).map(id => ({ id, label: id }));
  }
  function render() {
    app.replaceChildren();
    for (const section of schema.sections) {
      const visibleFields = section.fields.filter(field => supported.has(field.key));
      if (!visibleFields.length) continue;
      const card = element('section', null, 'card'); card.append(element('h2', section.title));
      for (const field of visibleFields) {
        const row = element('div', null, 'row'), label = element('div', null, 'row-label'), control = element('div', null, 'row-control');
        label.append(element('div', field.label, 'row-title')); if (field.desc) label.append(element('div', field.desc, 'row-desc'));
        let input;
        if (field.key === 'provider') {
          input = element('select');
          for (const id of Object.keys(providerLabels)) input.add(new Option(providerLabels[id], id));
        } else if (field.key === 'model') {
          input = element('select');
          const models = providerModels(values.provider);
          for (const item of models) input.add(new Option(item.label || item.id, item.id));
          if (!models.some(item => item.id === values.model)) {
            values.model = values.provider === 'cheradip' ? (data.default_model || models[0]?.id || 'auto') : (data.providers?.[values.provider]?.default_model || models[0]?.id || 'auto');
          }
        } else if (field.type === 'select') { input = element('select'); for (const o of field.options || []) input.add(new Option(o.label, o.value)); }
        else if (field.type === 'textarea') { input = element('textarea'); input.rows = 5; }
        else { input = element('input'); input.type = field.type === 'bool' ? 'checkbox' : field.type === 'number' ? 'number' : 'text'; }
        input.setAttribute('aria-label', field.label);
        if (field.placeholder) {
          input.placeholder = field.placeholder;
          input.addEventListener('focus', () => { input.placeholder = ''; });
          input.addEventListener('blur', () => { if (!input.value) input.placeholder = field.placeholder; });
        }
        if (input.type === 'checkbox') input.checked = !!values[field.key]; else input.value = values[field.key] ?? '';
        input.addEventListener('change', () => {
          values[field.key] = input.type === 'checkbox' ? input.checked : input.value;
          if (field.key === 'provider') values.model = values.provider === 'cheradip' ? (data.default_model || 'auto') : (data.providers?.[values.provider]?.default_model || 'auto');
          save(); toast('Saved'); if (field.key === 'provider') render();
        });
        control.append(input); row.append(label, control); card.append(row);
      } app.append(card);
    }
    const web = element('section', null, 'card'); web.append(element('h2', 'Tutor research')); const label = element('label', ' Search public web references for resolved topics '); const check = element('input'); check.type = 'checkbox'; check.checked = values.webSearch; check.addEventListener('change', () => { values.webSearch = check.checked; save(); }); label.prepend(check); web.append(label); app.append(web);
    const git = element('section', null, 'card'); git.append(element('h2', 'Connect to Git / Others'), element('p', 'GitHub, GitLab, Bitbucket and custom remotes use the VS Code extension’s local workspace. This browser does not execute Git or store Git passwords.')); app.append(git);
    const keys = element('section', null, 'card');
    keys.append(element('h2', 'Tutor API Keys'), element('p', authToken ? 'Personal keys are saved securely inside your Cheradip account settings. When no personal key exists, Tutor uses the enabled shared key from the AI provider database.' : 'Sign in to save keys to your account. Guest keys remain only in this browser.'));
    for (const id of ['openai', 'anthropic', 'google', 'groq', 'mistral', 'deepseek', 'openrouter']) {
      const row = element('div', null, 'row'), label = element('div', null, 'row-label'), control = element('div', null, 'row-control');
      label.append(element('div', providerLabels[id], 'row-title'));
      const status = accountSettings.key_status?.[id] || {};
      if (status.personal) label.append(element('div', 'Personal account key configured', 'browser-note'));
      else if (status.shared) label.append(element('div', 'Using shared server key until you add a personal key', 'browser-note'));
      const input = element('input'); input.type = 'password'; input.autocomplete = 'off'; input.placeholder = status.personal ? 'Personal key saved — enter a replacement' : 'Enter ' + providerLabels[id] + ' API key'; input.value = values.apiKeys[id] || '';
      input.setAttribute('aria-label', providerLabels[id] + ' API key');
      input.addEventListener('change', async () => {
        const entered = input.value.trim();
        if (authToken) {
          if (!await syncAccount({ [id]: entered })) return;
          delete values.apiKeys[id]; input.value = '';
        } else values.apiKeys[id] = entered;
        localStorage.setItem(key, JSON.stringify(values));
        parent.postMessage({ type: 'tutorSettingsChanged' }, location.origin);
        toast(authToken ? providerLabels[id] + ' key saved to your account' : providerLabels[id] + ' key saved in this browser');
      });
      const clear = element('button', 'Clear personal key', 'ghost'); clear.type = 'button'; clear.addEventListener('click', async () => {
        if (authToken && !await syncAccount({ [id]: null })) return;
        delete values.apiKeys[id]; input.value = ''; localStorage.setItem(key, JSON.stringify(values));
        parent.postMessage({ type: 'tutorSettingsChanged' }, location.origin); toast(providerLabels[id] + ' personal key cleared');
      });
      control.append(input, clear); row.append(label, control); keys.append(row);
    }
    app.append(keys);
  }
  document.getElementById('rawConfig').onclick = () => {
    const safe = { ...values, apiKeys: Object.fromEntries(Object.keys(values.apiKeys || {}).map(id => [id, values.apiKeys[id] ? 'configured' : ''])) };
    document.getElementById('config-json').value = JSON.stringify(safe, null, 2); document.getElementById('config-dialog').showModal();
  };
  document.getElementById('config-close').onclick = () => document.getElementById('config-dialog').close();
  document.getElementById('resetConfig').onclick = () => {
    const cleared = Object.fromEntries(['openai', 'anthropic', 'google', 'groq', 'mistral', 'deepseek', 'openrouter'].map(id => [id, null]));
    values = { ...defaults, apiKeys: {} }; localStorage.setItem(key, JSON.stringify(values)); void syncAccount(cleared);
    parent.postMessage({ type: 'tutorSettingsChanged' }, location.origin); render(); toast('Tutor settings and personal API keys reset');
  };
  document.getElementById('back').onclick = () => parent.postMessage({ type: 'closeTutorSettings' }, location.origin);
  render();
})();
