(async function () {
  'use strict';
  const owner = localStorage.getItem('isLoggedIn') === 'true' ? localStorage.getItem('username') || 'account' : 'guest';
  const key = 'cheradip.tutor.settings.' + owner;
  const schema = await (await fetch('settings-schema.json')).json();
  const data = await fetch('/api/tutor/models/').then(r=>r.json()).catch(()=>({error:'Home AI is unavailable. Settings remain accessible.'}));
  let values; try { values = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { values = {}; }
  const defaults = { ...schema.values, model:'auto', chatMode:'ask', webSearch:true, promptReadyEnabled:true, taskWrapUpEnabled:true, userRules:'' };
  values = { ...defaults, ...values };
  try {
    const chat = JSON.parse(localStorage.getItem('cheradip.tutor.v1.' + owner) || '{}');
    if (chat.model) values.model = chat.model;
    if (chat.mode) values.chatMode = chat.mode;
  } catch (_) { /* Keep usable defaults if the saved chat is damaged. */ }
  values.apiUrl = data.tutor?.home_ai_url || values.apiUrl;
  const supported = new Set(['model','chatMode','userRules','webSearch','promptReadyEnabled','taskWrapUpEnabled']);
  const app = document.getElementById('app');
  function element(tag, text, cls) { const n=document.createElement(tag); if(text)n.textContent=text; if(cls)n.className=cls; return n; }
  function toast(text) { const n=document.getElementById('toast'); n.textContent=text; n.classList.add('show'); setTimeout(()=>n.classList.remove('show'),3500); }
  function save() { localStorage.setItem(key,JSON.stringify(values)); parent.postMessage({type:'tutorSettingsChanged'},location.origin); }
  function render() {
    app.replaceChildren();
    const account=element('section',null,'card'); account.append(element('h2','Account, Plans & Subscription'));
    account.append(element('p',owner==='guest'?'Guest — sign in through the website to manage your account.':'Signed in as '+owner));
    if(data.error)account.append(element('p',data.error));
    const nav=element('nav',null,'settings-nav');
    for(const [label,path] of [['Account','/auth'],['Plans & billing','/packages'],['User manual','/ailt']]) { const a=element('a',label); a.href=path; a.target='_top'; nav.append(a); } account.append(nav); app.append(account);
    for(const section of schema.sections) {
      const card=element('section',null,'card'); card.append(element('h2',section.title));
      for(const field of section.fields) {
        const row=element('div',null,'row'), label=element('div',null,'row-label'), control=element('div',null,'row-control');
        label.append(element('div',field.label,'row-title')); if(field.desc)label.append(element('div',field.desc,'row-desc'));
        const enabled=supported.has(field.key);
        if(!enabled)label.append(element('div',['apiUrl','provider'].includes(field.key)?'Managed by the website server.':'Extension default shown — inactive in this browser; requires VS Code.','browser-note'));
        let input;
        if(field.key==='model') { input=element('select'); for(const m of data.models||[])if(m.available!==false && !['vision','translation'].includes(m.category))input.add(new Option(m.label,m.id)); }
        else if(field.type==='select'){ input=element('select'); for(const o of field.options||[])input.add(new Option(o.label,o.value)); }
        else if(field.type==='textarea') {input=element('textarea');input.rows=5;}
        else {input=element('input');input.type=field.type==='bool'?'checkbox':field.type==='number'?'number':'text';}
        input.setAttribute('aria-label',field.label); input.disabled=!enabled;
        if(input.type==='checkbox')input.checked=!!values[field.key]; else input.value=values[field.key]??'';
        input.addEventListener('change',()=>{values[field.key]=input.type==='checkbox'?input.checked:input.value;save();toast('Saved');});
        control.append(input); row.append(label,control);card.append(row);
      } app.append(card);
    }
    const web=element('section',null,'card');web.append(element('h2','Tutor research'));const label=element('label',' Search public web references for resolved topics ');const check=element('input');check.type='checkbox';check.checked=values.webSearch;check.addEventListener('change',()=>{values.webSearch=check.checked;save();});label.prepend(check);web.append(label);app.append(web);
    const git=element('section',null,'card');git.append(element('h2','Connect to Git / Others'),element('p','GitHub, GitLab, Bitbucket and custom remotes use the VS Code extension’s local workspace. This browser does not execute Git or store Git passwords.'));app.append(git);
    const keys=element('section',null,'card');keys.append(element('h2','API Keys'),element('p','Home AI is connected through the website server. Cloud provider keys require a server-side account integration; they are not stored in browser history.'));
    for(const name of ['OpenAI','Anthropic','Google','Groq','Mistral','DeepSeek']){const row=element('div',null,'row');row.append(element('span',name),element('span','Configure in the VS Code extension','browser-note'));keys.append(row);}app.append(keys);
  }
  document.getElementById('rawConfig').onclick=()=>{document.getElementById('config-json').value=JSON.stringify(values,null,2);document.getElementById('config-dialog').showModal();};
  document.getElementById('config-close').onclick=()=>document.getElementById('config-dialog').close();
  document.getElementById('resetConfig').onclick=()=>{values={...defaults};save();render();toast('Browser settings reset');};
  document.getElementById('back').onclick=()=>parent.postMessage({type:'closeTutorSettings'},location.origin);
  render();
})();
