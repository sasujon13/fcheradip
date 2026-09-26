(function () {
  const vscode = acquireVsCodeApi();

  const messagesEl = document.getElementById("messages");
  const promptEl = document.getElementById("prompt");
  const sendBtn = document.getElementById("send");
  const providerEl = document.getElementById("provider");
  const modelEl = document.getElementById("model");
  const chatModeEl = document.getElementById("chatMode");
  const statusEl = document.getElementById("status");
  const statusActionsEl = document.getElementById("statusActions");
  const applyChangesBtn = document.getElementById("applyChangesBtn");
  const revertChangesBtn = document.getElementById("revertChangesBtn");
  const apiKeyRow = document.getElementById("apiKeyRow");
  const apiKeyEl = document.getElementById("apiKey");
  const saveKeyBtn = document.getElementById("saveKey");
  const newSessionBtn = document.getElementById("newSession");
  const sessionTabsEl = document.getElementById("sessionTabs");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const resetConfigBtn = document.getElementById("resetConfig");
  const attachBtn = document.getElementById("attachBtn");
  const mentionBtn = document.getElementById("mentionBtn");
  const composerBannerEl = document.getElementById("composerBanner");
  const attachChipsEl = document.getElementById("attachChips");
  const mentionMenuEl = document.getElementById("mentionMenu");
  const sendQueuePanelEl = document.getElementById("sendQueuePanel");
  const sendQueueHeaderEl = document.getElementById("sendQueueHeader");
  const sendQueueListEl = document.getElementById("sendQueueList");
  const composerBoxEl = document.querySelector(".composer-box");

  let streaming = false;
  let queueRunning = false;
  let queueItems = [];
  let queueExpanded = false;
  let editingQueueId = null;
  let editingQueueDraft = "";
  let currentAssistantWrap = null;
  let editFromMessageIndex = null;
  let sessions = [];
  let lastStatusLine = "Ready";
  let applyBlockSeq = 0;
  let mentionItems = [];
  let prepText = "";
  let currentPrepWrap = null;
  let applyRevertVisible = false;
  let askBlockSeq = 0;
  let activeTextTarget = null;
  const ASK_NONE_LABEL = "None, I will clarify again!";
  let stickToBottom = true;
  var SCROLL_NEAR_BOTTOM_PX = 64;

  function isNearBottom(el, threshold) {
    if (!el) return true;
    var t = threshold != null ? threshold : SCROLL_NEAR_BOTTOM_PX;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= t;
  }

  /** Scroll message list only when user is at bottom, unless force (e.g. user just sent). */
  function scrollMessagesToBottom(force) {
    if (!messagesEl) return;
    if (force) stickToBottom = true;
    if (stickToBottom) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function scrollPrepToBottom() {
    if (!currentPrepWrap) return;
    if (isNearBottom(currentPrepWrap, 48)) {
      currentPrepWrap.scrollTop = currentPrepWrap.scrollHeight;
    }
  }

  if (messagesEl) {
    messagesEl.addEventListener(
      "scroll",
      function () {
        stickToBottom = isNearBottom(messagesEl);
      },
      { passive: true },
    );
  }

  function renderSendQueueHeader(queuedCount) {
    if (!sendQueueHeaderEl) return;
    if (queuedCount <= 0) {
      sendQueueHeaderEl.innerHTML = "";
      return;
    }
    const label = queuedCount === 1 ? "1 Queued" : queuedCount + " Queued";
    sendQueueHeaderEl.innerHTML =
      '<button type="button" class="send-queue-toggle' +
      (queueExpanded ? " expanded" : "") +
      '" id="sendQueueToggle" aria-expanded="' +
      (queueExpanded ? "true" : "false") +
      '" title="Show queued messages">' +
      '<span class="send-queue-toggle-text">' +
      escapeHtml(label) +
      "</span>" +
      '<span class="send-queue-chevron" aria-hidden="true">▾</span>' +
      "</button>";
    const toggle = sendQueueHeaderEl.querySelector("#sendQueueToggle");
    if (toggle) {
      toggle.onclick = function () {
        toggleQueueExpanded();
      };
    }
  }

  function renderSendQueue(running, items) {
    queueRunning = !!running;
    queueItems = items || [];
    const queuedCount = queueItems.length;
    const show = queuedCount > 0;
    if (sendQueuePanelEl) sendQueuePanelEl.hidden = !show;

    if (queuedCount === 0) {
      queueExpanded = false;
    }

    renderSendQueueHeader(queuedCount);

    if (!sendQueueListEl) return;
    const showQueuedList = queuedCount > 0 && queueExpanded;
    sendQueueListEl.hidden = !showQueuedList;
    sendQueuePanelEl && sendQueuePanelEl.classList.toggle("expanded", showQueuedList);
    composerBoxEl && composerBoxEl.classList.toggle("queue-open", showQueuedList);
    if (!showQueuedList) {
      sendQueueListEl.innerHTML = "";
      return;
    }

    const html = queueItems
      .map(function (item) {
        const full = item.text || "";
        const idEnc = encodeURIComponent(item.id || "");
        if (editingQueueId === item.id) {
          return (
            '<li class="send-queue-item editing" data-id="' +
            idEnc +
            '">' +
            '<textarea class="send-queue-edit" rows="3" data-id="' +
            idEnc +
            '">' +
            escapeHtml(editingQueueDraft) +
            "</textarea>" +
            '<div class="send-queue-edit-actions">' +
            '<button type="button" class="send-queue-save" data-id="' +
            idEnc +
            '">Save</button>' +
            '<button type="button" class="send-queue-cancel-edit">Cancel</button>' +
            "</div></li>"
          );
        }
        const preview = full.length > 100 ? full.slice(0, 100) + "…" : full;
        return (
          '<li class="send-queue-item" data-id="' +
          idEnc +
          '">' +
          '<span class="send-queue-text" title="Click to edit">' +
          escapeHtml(preview) +
          "</span>" +
          '<div class="send-queue-item-actions">' +
          '<button type="button" class="send-queue-edit-btn" data-id="' +
          idEnc +
          '" title="Edit queued message" aria-label="Edit">' +
          ICON_EDIT +
          "</button>" +
          '<button type="button" class="send-queue-remove" data-id="' +
          idEnc +
          '" title="Remove from queue" aria-label="Remove">' +
          ICON_DELETE +
          "</button>" +
          "</div></li>"
        );
      })
      .join("");
    sendQueueListEl.innerHTML = html;
    if (editingQueueId) {
      const ta = sendQueueListEl.querySelector(".send-queue-edit");
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  }

  function toggleQueueExpanded() {
    if (!queueItems.length) return;
    queueExpanded = !queueExpanded;
    renderSendQueue(queueRunning, queueItems);
  }

  function startQueueEdit(id, text) {
    editingQueueId = id;
    editingQueueDraft = text || "";
    queueExpanded = true;
    renderSendQueue(queueRunning, queueItems);
  }

  function saveQueueEdit(id, text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    vscode.postMessage({ type: "updateQueueItem", id: id, text: trimmed });
    editingQueueId = null;
    editingQueueDraft = "";
  }

  function cancelQueueEdit() {
    editingQueueId = null;
    editingQueueDraft = "";
    renderSendQueue(queueRunning, queueItems);
  }

  function bindSendQueueControls() {
    if (sendQueueListEl) {
      sendQueueListEl.onclick = function (e) {
        const saveBtn = e.target.closest(".send-queue-save");
        if (saveBtn && saveBtn.dataset.id) {
          const row = saveQueueListEl.querySelector(
            '.send-queue-item.editing[data-id="' + saveBtn.dataset.id + '"]',
          );
          const ta = row && row.querySelector(".send-queue-edit");
          saveQueueEdit(decodeURIComponent(saveBtn.dataset.id), ta ? ta.value : editingQueueDraft);
          return;
        }
        const cancelBtn = e.target.closest(".send-queue-cancel-edit");
        if (cancelBtn) {
          cancelQueueEdit();
          return;
        }
        const editBtn = e.target.closest(".send-queue-edit-btn");
        if (editBtn && editBtn.dataset.id) {
          const id = decodeURIComponent(editBtn.dataset.id);
          const item = queueItems.find(function (q) {
            return q.id === id;
          });
          if (item) startQueueEdit(id, item.text);
          return;
        }
        const textEl = e.target.closest(".send-queue-text");
        if (textEl) {
          const row = textEl.closest(".send-queue-item");
          if (row && row.dataset.id) {
            const id = decodeURIComponent(row.dataset.id);
            const item = queueItems.find(function (q) {
              return q.id === id;
            });
            if (item) startQueueEdit(id, item.text);
          }
          return;
        }
        const rm = e.target.closest(".send-queue-remove");
        if (rm && rm.dataset.id) {
          vscode.postMessage({ type: "removeQueueItem", id: decodeURIComponent(rm.dataset.id) });
        }
      };
      sendQueueListEl.addEventListener("input", function (e) {
        const ta = e.target.closest(".send-queue-edit");
        if (ta) editingQueueDraft = ta.value;
      });
      sendQueueListEl.addEventListener("keydown", function (e) {
        const ta = e.target.closest(".send-queue-edit");
        if (!ta) return;
        if (e.key === "Escape") {
          e.preventDefault();
          cancelQueueEdit();
        }
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          const row = ta.closest(".send-queue-item");
          const id = row && row.dataset.id ? decodeURIComponent(row.dataset.id) : editingQueueId;
          if (id) saveQueueEdit(id, ta.value);
        }
      });
    }
  }

  function setApplyRevertVisible(showApply, showRevert) {
    const any = !!(showApply || showRevert);
    applyRevertVisible = any;
    if (statusEl) statusEl.style.display = any ? "none" : "";
    if (statusActionsEl) statusActionsEl.hidden = !any;
    if (applyChangesBtn) applyChangesBtn.hidden = !showApply;
    if (revertChangesBtn) revertChangesBtn.hidden = !showRevert;
  }

  function insertPrepAfterLastUser() {
    if (!messagesEl) return null;
    const users = messagesEl.querySelectorAll(".msg.user");
    const lastUser = users.length ? users[users.length - 1] : null;
    const div = document.createElement("div");
    div.className = "msg prep active";
    div.innerHTML =
      '<div class="prep-header">' +
      '<span class="prep-dot" aria-hidden="true"></span>' +
      '<span class="prep-title">Preparing prompt…</span>' +
      '<button type="button" class="prep-stop" title="Stop">✕</button>' +
      "</div>" +
      '<div class="prep-content"></div>';
    if (lastUser && lastUser.nextSibling) {
      messagesEl.insertBefore(div, lastUser.nextSibling);
    } else if (lastUser) {
      lastUser.insertAdjacentElement("afterend", div);
    } else {
      messagesEl.appendChild(div);
    }
    const stopBtn = div.querySelector(".prep-stop");
    if (stopBtn) {
      stopBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "stopGeneration" });
      });
    }
    scrollMessagesToBottom(false);
    return div;
  }

  function resetPrepPanel() {
    prepText = "";
    if (currentPrepWrap) {
      currentPrepWrap.remove();
      currentPrepWrap = null;
    }
  }

  function showPrepPanel(title) {
    if (!currentPrepWrap) currentPrepWrap = insertPrepAfterLastUser();
    if (!currentPrepWrap) return;
    const titleEl = currentPrepWrap.querySelector(".prep-title");
    if (titleEl && title) titleEl.textContent = title;
    currentPrepWrap.classList.add("active");
    if (statusEl) statusEl.textContent = title || "Preparing prompt…";
    scrollMessagesToBottom(false);
  }

  function appendPrepChunk(chunk) {
    if (!chunk) return;
    if (!currentPrepWrap) currentPrepWrap = insertPrepAfterLastUser();
    prepText += chunk;
    const contentEl = currentPrepWrap && currentPrepWrap.querySelector(".prep-content");
    if (contentEl) contentEl.innerHTML = renderMarkdown(prepText);
    scrollPrepToBottom();
    scrollMessagesToBottom(false);
  }

  function hidePrepPanel() {
    if (!currentPrepWrap) return;
    currentPrepWrap.classList.remove("active");
    currentPrepWrap.classList.add("done");
    window.setTimeout(function () {
      if (currentPrepWrap) {
        currentPrepWrap.remove();
        currentPrepWrap = null;
      }
      prepText = "";
    }, 400);
  }

  const ICON_COPY =
    '<svg class="action-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" fill="currentColor"/>' +
    '<path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2H10a1 1 0 0 1 1 1v1.25H9.25V3.5h-5.5v5.5H5V11H3.5A1.5 1.5 0 0 1 2 9.5z"/>' +
    "</svg>";
  const ICON_EDIT = "✎";
  const ICON_DELETE = "✕";
  const ICON_DOWNLOAD = "↓";

  function messageIndexFromEl(el) {
    if (!el || !messagesEl) return -1;
    const all = messagesEl.querySelectorAll(".msg");
    for (let i = 0; i < all.length; i++) {
      if (all[i] === el) return i;
    }
    return -1;
  }

  function reindexMessages() {
    if (!messagesEl) return;
    const all = messagesEl.querySelectorAll(".msg");
    for (let i = 0; i < all.length; i++) {
      all[i].dataset.msgIndex = String(i);
      const editBtn = all[i].querySelector(".edit-btn");
      if (editBtn) editBtn.dataset.msgIndex = String(i);
      const delBtn = all[i].querySelector(".delete-msg-btn");
      if (delBtn) delBtn.dataset.msgIndex = String(i);
    }
  }

  function tryParseAgentAction(code) {
    try {
      var o = JSON.parse(code.trim());
      var tools = [
        "readFile",
        "writeFile",
        "createFile",
        "deleteFile",
        "createDirectory",
        "deleteDirectory",
        "listFiles",
        "listProject",
        "searchText",
        "codebaseSearch",
        "applyPatch",
        "readDiagnostics",
        "gitStatus",
        "gitDiff",
        "gitLog",
        "findSymbol",
        "goToDefinition",
        "mcpTool",
        "runTerminal",
        "runCommand",
        "createTerminal",
        "createProject",
      ];
      if (o && o.tool && tools.indexOf(o.tool) >= 0) return o;
    } catch (e) {
      /* ignore */
    }
    return null;
  }
  function nextBlockId() {
    applyBlockSeq += 1;
    return "apply-" + applyBlockSeq;
  }

  function hideMentionMenu() {
    if (!mentionMenuEl) return;
    mentionMenuEl.style.display = "none";
    mentionMenuEl.innerHTML = "";
  }

  function showMentionMenu(filter) {
    if (!mentionMenuEl || !promptEl) return;
    const q = (filter || "").toLowerCase();
    const items = mentionItems.filter(function (m) {
      return !q || m.label.toLowerCase().indexOf(q) >= 0 || (m.description || "").toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) {
      hideMentionMenu();
      return;
    }
    mentionMenuEl.innerHTML = items
      .map(function (m, i) {
        return (
          '<button type="button" class="mention-item" data-idx="' +
          i +
          '" data-insert="' +
          encodeURIComponent(m.insert) +
          '"><span class="mention-label">' +
          escapeHtml(m.label) +
          '</span><span class="mention-desc">' +
          escapeHtml(m.description || "") +
          "</span></button>"
        );
      })
      .join("");
    mentionMenuEl.style.display = "block";
    mentionMenuEl._filtered = items;
  }

  function insertMentionToken(insert) {
    if (!promptEl) return;
    const val = promptEl.value;
    const pos = promptEl.selectionStart || val.length;
    const before = val.slice(0, pos);
    const at = before.lastIndexOf("@");
    const prefix = at >= 0 ? val.slice(0, at) : val.slice(0, pos);
    const suffix = at >= 0 ? val.slice(pos) : "";
    promptEl.value = prefix + insert + suffix;
    promptEl.focus();
    hideMentionMenu();
    if (insert === "@file:" || insert === "@folder:" || insert === "@symbol:") {
      vscode.postMessage({ type: "insertMentionAt", text: insert });
    }
  }

  function showSnackbar(text) {
    var el = document.getElementById("snackbar");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(showSnackbar._timer);
    showSnackbar._timer = setTimeout(function () {
      el.classList.remove("show");
    }, 2200);
  }

  function copyText(text) {
    if (!text) return;
    var done = function () {
      showSnackbar("Copied to clipboard!");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        vscode.postMessage({ type: "copyText", text: text });
        done();
      });
    } else {
      vscode.postMessage({ type: "copyText", text: text });
      done();
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fillSelect(el, items, selected) {
    if (!el) return;
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    el.innerHTML = list
      .map(function (item) {
        const val = item.id || "";
        const lab = item.label || val;
        return (
          '<option value="' +
          val.replace(/"/g, "&quot;") +
          '"' +
          (val === selected ? " selected" : "") +
          ">" +
          escapeHtml(lab) +
          "</option>"
        );
      })
      .join("");
  }

  function isMediaUrl(url) {
    return /\.(png|jpe?g|gif|webp|mp4|webm|mp3|wav|ogg|pdf)(\?|$)/i.test(url) || url.startsWith("data:image/") || url.startsWith("data:video/");
  }

  function renderInlineMedia(alt, url) {
    const safeUrl = escapeHtml(url);
    const safeAlt = escapeHtml(alt || "media");
    const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(url) || url.startsWith("data:video/");
    const isAudio = /\.(mp3|wav|ogg)(\?|$)/i.test(url) && !isVideo;
    let inner = "";
    if (isVideo) {
      inner = '<video class="media-el" src="' + safeUrl + '" controls></video>';
    } else if (isAudio) {
      inner = '<audio class="media-el" src="' + safeUrl + '" controls></audio>';
    } else {
      inner = '<img class="media-el" src="' + safeUrl + '" alt="' + safeAlt + '" />';
    }
    return (
      '<div class="media-block" data-url="' +
      safeUrl +
      '" data-filename="' +
      safeAlt +
      '">' +
      inner +
      '<button type="button" class="media-download-btn" title="Download">' +
      ICON_DOWNLOAD +
      "</button></div>"
    );
  }

  function renderPlainSegment(text) {
    const parts = [];
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let last = 0;
    let m;
    while ((m = imgRe.exec(text)) !== null) {
      if (m.index > last) {
        parts.push(window.tutorFormatText(text.slice(last, m.index)));
      }
      // Web-host adaptation: never render executable schemes from model output.
      if (!/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(m[2])) {
        parts.push("<p>" + escapeHtml(m[1] || m[2]) + "</p>");
      } else if (isMediaUrl(m[2])) {
        parts.push(renderInlineMedia(m[1], m[2]));
      } else {
        parts.push(
          '<p><a href="' + escapeHtml(m[2]) + '" target="_blank" rel="noopener">' + escapeHtml(m[1] || m[2]) + "</a></p>"
        );
      }
      last = imgRe.lastIndex;
    }
    if (last < text.length) {
      parts.push(window.tutorFormatText(text.slice(last)));
    }
    return parts.join("") || window.tutorFormatText(text);
  }

  function insertMentionToken(insert) {
    const target = activeTextTarget || promptEl;
    if (!target) return;
    const val = target.value;
    const pos = target.selectionStart || val.length;
    const before = val.slice(0, pos);
    const at = before.lastIndexOf("@");
    const prefix = at >= 0 ? val.slice(0, at) : val.slice(0, pos);
    const suffix = at >= 0 ? val.slice(pos) : "";
    target.value = prefix + insert + suffix;
    target.focus();
    hideMentionMenu();
    if (insert === "@file:" || insert === "@folder:" || insert === "@symbol:") {
      vscode.postMessage({ type: "insertMentionAt", text: insert });
    }
  }

  function clarifyComposerHtml(askId) {
    return (
      '<div class="ask-clarify-composer composer-box" data-ask-id="' +
      askId +
      '" hidden>' +
      '<div class="mention-menu ask-mention-menu" style="display:none"></div>' +
      '<textarea class="ask-clarify-input" rows="3" placeholder="Clarify your question… (@ for context)"></textarea>' +
      '<div class="composer-bar">' +
      '<button type="button" class="composer-icon ask-clarify-attach" title="Attach file">📎</button>' +
      '<button type="button" class="composer-icon ask-clarify-mention" title="Add @ context">@</button>' +
      '<span class="composer-bar-spacer" aria-hidden="true"></span>' +
      '<button type="button" class="send-btn ask-clarify-send" title="Send">↑</button>' +
      "</div></div>"
    );
  }

  function askOptionBtn(text, kind, multi, letter, displayText) {
    const cls = "ask-option" + (multi ? " ask-multi" : "");
    const letterHtml = letter
      ? '<span class="ask-letter" aria-hidden="true">' + escapeHtml(letter) + "</span>"
      : "";
    const label = displayText != null ? displayText : text;
    return (
      '<button type="button" class="' +
      cls +
      '" data-kind="' +
      kind +
      '" data-text="' +
      encodeURIComponent(text) +
      '">' +
      letterHtml +
      '<span class="ask-option-text">' +
      escapeHtml(label) +
      "</span></button>"
    );
  }

  function splitAskOptionLabel(text, idx, useLetters) {
    const letterChars = "ABCDEFGH";
    const trimmed = (text || "").trim();
    if (!useLetters) return { sendText: trimmed, displayText: trimmed, letter: "" };
    const letter = letterChars[idx] || String(idx + 1);
    const stripped = trimmed.replace(/^[A-H]\)\s*/i, "").trim();
    return {
      sendText: trimmed,
      displayText: stripped || trimmed,
      letter: letter,
    };
  }

  function resolveAskBlock(block) {
    if (!block || block.classList.contains("ask-block-resolved")) return;
    block.classList.add("ask-block-resolved");
    block.querySelectorAll("button, textarea, input").forEach(function (btn) {
      btn.disabled = true;
    });
    activeTextTarget = null;
  }

  function renderAskBlock(code) {
    let data;
    try {
      data = JSON.parse(code.trim());
    } catch (e) {
      return "";
    }
    if (!data || !data.question || !Array.isArray(data.options) || !data.options.length) {
      return "";
    }
    const variant = data.variant === "next" ? "next" : "ask";
    // Next-step picks are always single-select (one click sends). Clarify blocks allow multi.
    const multi = variant === "next" ? false : data.multi !== false;
    const useLetters = variant === "next" || data.letters === true;
    askBlockSeq += 1;
    const askId = "ask-" + askBlockSeq;

    const mainOpts = data.options
      .filter(function (o) {
        return typeof o === "string" && o.trim();
      })
      .slice(0, 6)
      .map(function (o, idx) {
        const parts = splitAskOptionLabel(o.trim(), idx, useLetters);
        return askOptionBtn(parts.sendText, "option", multi, parts.letter, parts.displayText);
      })
      .join("");

    const others = Array.isArray(data.others)
      ? data.others.filter(function (o) {
          return typeof o === "string" && o.trim();
        }).slice(0, 8)
      : [];

    let othersHtml = "";
    if (others.length) {
      const otherBtns = others
        .map(function (o, idx) {
          const parts = splitAskOptionLabel(o.trim(), idx, useLetters);
          return askOptionBtn(parts.sendText, "others", multi, parts.letter, parts.displayText);
        })
        .join("");
      othersHtml =
        '<div class="ask-others-wrap">' +
        '<button type="button" class="ask-option ask-others-toggle" data-kind="others-toggle">Others</button>' +
        '<div class="ask-others-list" hidden>' +
        otherBtns +
        "</div></div>";
    }

    const submitBar = multi
      ? '<div class="ask-submit-bar" hidden>' +
        '<span class="composer-bar-spacer" aria-hidden="true"></span>' +
        '<button type="button" class="send-btn ask-submit-btn" title="Apply selection (Enter)" aria-label="Apply">↑</button>' +
        "</div>"
      : "";

    return (
      '<div class="ask-block ask-variant-' +
      variant +
      '" data-ask-id="' +
      askId +
      '" data-multi="' +
      (multi ? "1" : "0") +
      '">' +
      (variant === "next"
        ? '<div class="ask-next-label">Next steps</div>'
        : "") +
      '<div class="ask-question">' +
      escapeHtml(data.question) +
      "</div>" +
      '<div class="ask-options ask-main-options">' +
      mainOpts +
      "</div>" +
      othersHtml +
      '<div class="ask-none-wrap">' +
      '<button type="button" class="ask-option ask-none-btn" data-kind="none">' +
      escapeHtml(ASK_NONE_LABEL) +
      "</button>" +
      clarifyComposerHtml(askId) +
      "</div>" +
      submitBar +
      "</div>"
    );
  }

  function renderMarkdown(text) {
    const parts = [];
    const re = /```([\w-]*)\s*\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        parts.push(renderPlainSegment(text.slice(last, m.index)));
      }
      const lang = m[1] || "text";
      const code = m[2];
      if (lang.toLowerCase() === "cheradip-ask") {
        const askHtml = renderAskBlock(code);
        if (askHtml) {
          parts.push(askHtml);
          last = re.lastIndex;
          continue;
        }
      }
      const blockId = nextBlockId();
      const agentAction = tryParseAgentAction(code);
      const actionBtn = agentAction
        ? '<button type="button" class="apply-btn run-agent-btn" data-block-id="' +
          blockId +
          '" data-code="' +
          encodeURIComponent(code) +
          '">Run</button>'
        : '<button type="button" class="apply-btn" data-block-id="' +
          blockId +
          '" data-code="' +
          encodeURIComponent(code) +
          '" data-lang="' +
          lang +
          '">Apply</button>';
      parts.push(
        '<div class="code-block">' +
          '<div class="code-toolbar">' +
          '<button type="button" class="copy-code-btn" title="Copy code" data-code="' +
          encodeURIComponent(code) +
          '">' +
          ICON_COPY +
          "</button>" +
          actionBtn +
          "</div>" +
          "<pre><code>" +
          escapeHtml(code) +
          "</code></pre></div>"
      );
      last = re.lastIndex;
    }
    if (last < text.length) {
      parts.push(renderPlainSegment(text.slice(last)));
    }
    return parts.join("") || renderPlainSegment(text);
  }

  function userActionsHtml(raw, msgIndex) {
    return (
      '<div class="msg-actions">' +
      '<button type="button" class="msg-action-btn delete-msg-btn" title="Delete question &amp; response" data-msg-index="' +
      msgIndex +
      '">' +
      ICON_DELETE +
      "</button>" +
      '<button type="button" class="msg-action-btn edit-btn" title="Edit &amp; branch from here" data-msg-index="' +
      msgIndex +
      '" data-raw="' +
      encodeURIComponent(raw) +
      '">' +
      ICON_EDIT +
      "</button>" +
      '<button type="button" class="msg-action-btn copy-user-btn" title="Copy" data-raw="' +
      encodeURIComponent(raw) +
      '">' +
      ICON_COPY +
      "</button></div>"
    );
  }

  function permissionActionsHtml() {
    return (
      '<div class="agent-perm-actions bottom" data-request-id="">' +
      '<button type="button" class="agent-perm-btn allow" disabled title="Allow this action once">Allow</button>' +
      '<button type="button" class="agent-perm-btn deny" disabled title="Deny this action">Deny</button>' +
      "</div>"
    );
  }

  function resetPermissionActions(actions) {
    if (!actions) return;
    actions.dataset.requestId = "";
    actions.classList.remove("pending");
    actions.title = "Agent permissions";
    actions.querySelectorAll(".agent-perm-btn").forEach(function (btn) {
      btn.disabled = true;
    });
  }

  function resetAllPermissionActions() {
    if (!messagesEl) return;
    messagesEl.querySelectorAll(".agent-perm-actions").forEach(resetPermissionActions);
  }

  function enablePermissionActions(msgEl, req) {
    if (!msgEl) return;
    resetAllPermissionActions();
    var actions = msgEl.querySelector(".agent-perm-actions");
    if (!actions) return;
    actions.dataset.requestId = req.requestId;
    actions.classList.add("pending");
    actions.title = req.summary || "Agent permission required";
    actions.querySelectorAll(".agent-perm-btn").forEach(function (btn) {
      btn.disabled = false;
    });
  }

  function findPermissionMessage(req) {
    if (currentAssistantWrap) return currentAssistantWrap;
    if (req.blockId && messagesEl) {
      var btn = messagesEl.querySelector('[data-block-id="' + req.blockId + '"]');
      if (btn) {
        var msg = btn.closest(".msg.assistant");
        if (msg) return msg;
      }
    }
    if (!messagesEl) return null;
    var all = messagesEl.querySelectorAll(".msg.assistant");
    return all.length ? all[all.length - 1] : null;
  }

  function assistantChrome(isStreaming) {
    var perm = permissionActionsHtml();
    return isStreaming
      ? perm +
          '<button type="button" class="msg-action-float bottom stop-gen-btn" title="Stop generating"></button>'
      : perm +
          '<div class="msg-float-group bottom">' +
          '<button type="button" class="msg-action-btn delete-msg-btn" title="Delete response">' +
          ICON_DELETE +
          "</button>" +
          '<button type="button" class="msg-action-btn copy-msg-btn" title="Copy">' +
          ICON_COPY +
          "</button></div>";
  }

  function swapStopToCopy() {
    if (!currentAssistantWrap) return;
    var stopBtn = currentAssistantWrap.querySelector(".stop-gen-btn");
    if (!stopBtn) return;
    var wrap = document.createElement("div");
    wrap.className = "msg-float-group bottom";
    wrap.innerHTML =
      '<button type="button" class="msg-action-btn delete-msg-btn" title="Delete response">' +
      ICON_DELETE +
      "</button>" +
      '<button type="button" class="msg-action-btn copy-msg-btn" title="Copy">' +
      ICON_COPY +
      "</button>";
    stopBtn.replaceWith(wrap);
    reindexMessages();
  }

  function setEditMode(active) {
    const composer = document.querySelector(".composer-box");
    if (composer) composer.classList.toggle("edit-branch-mode", !!active);
    if (promptEl) {
      promptEl.placeholder = active
        ? "Edit message — send to redo from this point…"
        : "Ask Cheradip…";
    }
  }

  function buildMessageEl(role, content, isStreaming, msgIndex) {
    const div = document.createElement("div");
    div.className = "msg " + role + (isStreaming ? " typing" : "");
    div.dataset.raw = content;
    if (msgIndex !== undefined && msgIndex !== null) {
      div.dataset.msgIndex = String(msgIndex);
    }

    if (role === "user") {
      div.innerHTML = '<div class="content"></div>' + userActionsHtml(content, msgIndex);
    } else {
      div.innerHTML = assistantChrome(isStreaming) + '<div class="content"></div>';
    }

    const contentEl = div.querySelector(".content");
    if (contentEl) contentEl.innerHTML = content ? renderMarkdown(content) : "";
    return { div, contentEl };
  }

  function appendMessage(role, content, isStreaming, msgIndex) {
    if (!messagesEl) return { contentEl: null, div: null };
    const built = buildMessageEl(role, content, isStreaming, msgIndex);
    messagesEl.appendChild(built.div);
    reindexMessages();
    return built;
  }

  function updateAssistant(text) {
    if (!currentAssistantWrap) return;
    const contentEl = currentAssistantWrap.querySelector(".content");
    if (contentEl) contentEl.innerHTML = renderMarkdown(text);
    currentAssistantWrap.dataset.raw = text;
    scrollMessagesToBottom(false);
  }

  function finalizeAssistantMessage() {
    if (!currentAssistantWrap) return;
    swapStopToCopy();
    currentAssistantWrap.classList.remove("typing");
    currentAssistantWrap = null;
  }

  function renderMessages(list) {
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    if (!list || !list.length) {
      messagesEl.innerHTML =
        '<div class="empty"><h2>Cheradip</h2><p>Ask anything about your code.</p></div>';
      return;
    }
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const built = appendMessage(m.role === "user" ? "user" : "assistant", m.content, false, i);
      if (m.role === "assistant" && list.slice(i + 1).some(function (next) { return next.role === "user"; })) {
        built.div.querySelectorAll(".ask-block").forEach(resolveAskBlock);
      }
    }
    scrollMessagesToBottom(true);
  }

  function restoreInFlightFromInit(msg) {
    streaming = true;
    var msgs = msg.messages || [];
    var draft = msg.inFlightAssistant || "";
    var displayMsgs = msgs;

    if (
      msgs.length &&
      msgs[msgs.length - 1].role === "assistant"
    ) {
      if (!draft) draft = msgs[msgs.length - 1].content;
      displayMsgs = msgs.slice(0, -1);
    }

    if (messagesEl && messagesEl.querySelector(".empty")) messagesEl.innerHTML = "";
    renderMessages(displayMsgs);

    if (msg.prepActive && msg.prepText) {
      resetPrepPanel();
      showPrepPanel("Preparing prompt…");
      appendPrepChunk(msg.prepText);
      if (statusEl) statusEl.textContent = "Preparing prompt…";
      return;
    }

    if (draft || msg.inFlightPhase === "streaming") {
      const built = appendMessage("assistant", draft, true);
      currentAssistantWrap = built.div;
      if (statusEl) statusEl.textContent = "Agent thinking…";
    }
  }

  function renderAttachChips(files) {
    if (!attachChipsEl) return;
    if (!files || !files.length) {
      attachChipsEl.innerHTML = "";
      attachChipsEl.style.display = "none";
      return;
    }
    attachChipsEl.style.display = "flex";
    attachChipsEl.innerHTML = files
      .map(function (f) {
        return (
          '<span class="attach-chip" data-path="' +
          escapeHtml(f) +
          '">' +
          escapeHtml(f) +
          '<button type="button" class="attach-chip-remove" data-path="' +
          escapeHtml(f) +
          '" title="Remove">×</button></span>'
        );
      })
      .join("");
  }

  function setChatMode(mode) {
    if (!chatModeEl) return;
    chatModeEl.value = mode || "agent";
  }

  function setComposerMode(on) {
    if (composerBannerEl) composerBannerEl.style.display = on ? "block" : "none";
    if (promptEl && on) promptEl.placeholder = "Composer — describe multi-file task…";
  }

  function renderSessionTabs(list) {
    if (!sessionTabsEl) return;
    sessions = list || [];
    sessionTabsEl.innerHTML = "";
    for (const s of sessions) {
      const tab = document.createElement("div");
      tab.className = "session-tab" + (s.active ? " active" : "") + (s.generating ? " generating" : "");
      tab.dataset.id = s.id;
      tab.title = s.title;
      const label = document.createElement("span");
      label.className = "session-tab-label";
      label.textContent = s.title;
      tab.appendChild(label);
      if (sessions.length > 1) {
        const close = document.createElement("button");
        close.className = "session-tab-close";
        close.type = "button";
        close.innerHTML = "×";
        close.title = "Close chat";
        close.dataset.id = s.id;
        tab.appendChild(close);
      }
      sessionTabsEl.appendChild(tab);
    }
    const activeTab = sessionTabsEl.querySelector(".session-tab.active");
    if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function setUndoRedo(canUndo, canRedo) {
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
  }

  var lastOptionSendAt = 0;
  var lastOptionSendText = "";

  function sendOptionText(text) {
    if (!text) return;
    const trimmed = text.trim();
    const now = Date.now();
    if (trimmed === lastOptionSendText && now - lastOptionSendAt < 2500) return;
    lastOptionSendText = trimmed;
    lastOptionSendAt = now;
    editFromMessageIndex = null;
    setEditMode(false);
    activeTextTarget = null;
    vscode.postMessage({ type: "send", text: trimmed });
  }

  function removeGitSyncAskHost() {
    const host = document.getElementById("gitSyncAskHost");
    if (host) host.remove();
  }

  function postGitSyncChoice(block, choice) {
    if (!block || !block.dataset.gitSyncRequestId) return false;
    vscode.postMessage({
      type: "gitSyncAskResponse",
      requestId: block.dataset.gitSyncRequestId,
      choice: choice || "",
    });
    resolveAskBlock(block);
    removeGitSyncAskHost();
    return true;
  }

  function showGitSyncAsk(msg) {
    if (!messagesEl) return;
    removeGitSyncAskHost();
    const host = document.createElement("div");
    host.id = "gitSyncAskHost";
    host.className = "git-sync-ask-host";
    const payload = {
      question: msg.question || "Git sync",
      options: msg.options || [],
      others: msg.others || [],
      multi: !!msg.multi,
    };
    const html = renderAskBlock(JSON.stringify(payload));
    if (!html) return;
    host.innerHTML = html;
    const block = host.querySelector(".ask-block");
    if (block && msg.requestId) block.dataset.gitSyncRequestId = msg.requestId;
    messagesEl.appendChild(host);
    scrollMessagesToBottom(false);
    if (statusEl) statusEl.textContent = "Git sync — choose an option";
  }

  function updateAskSubmitBar(block) {
    if (!block) return;
    const bar = block.querySelector(".ask-submit-bar");
    if (!bar) return;
    const any = block.querySelectorAll(".ask-option.selected").length > 0;
    bar.hidden = !any;
    const btn = bar.querySelector(".ask-submit-btn");
    if (btn) btn.disabled = !any;
  }

  function toggleAskMultiOption(btn) {
    btn.classList.toggle("selected");
    updateAskSubmitBar(btn.closest(".ask-block"));
  }

  function sendAskMultiSelection(block) {
    if (!block || block.classList.contains("ask-block-resolved")) return;
    const selected = block.querySelectorAll(".ask-option.selected");
    const texts = [];
    selected.forEach(function (btn) {
      const t = decodeURIComponent(btn.dataset.text || "");
      if (t) texts.push(t);
    });
    if (!texts.length) return;
    resolveAskBlock(block);
    sendOptionText(texts.join(", "));
  }

  function openAskClarifyComposer(block) {
    if (!block) return;
    const noneBtn = block.querySelector(".ask-none-btn");
    const composer = block.querySelector(".ask-clarify-composer");
    if (noneBtn) noneBtn.hidden = true;
    if (composer) {
      composer.hidden = false;
      const input = composer.querySelector(".ask-clarify-input");
      if (input) {
        activeTextTarget = input;
        input.focus();
      }
    }
    block.querySelectorAll(".ask-option:not(.ask-none-btn)").forEach(function (btn) {
      btn.disabled = true;
    });
    const bar = block.querySelector(".ask-submit-bar");
    if (bar) bar.hidden = true;
  }

  function showAskMentionMenu(menuEl, inputEl, filter) {
    if (!menuEl || !inputEl) return;
    const q = (filter || "").toLowerCase();
    const items = mentionItems.filter(function (m) {
      return !q || m.label.toLowerCase().indexOf(q) >= 0 || (m.description || "").toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) {
      menuEl.style.display = "none";
      menuEl.innerHTML = "";
      return;
    }
    menuEl.innerHTML = items
      .map(function (m, i) {
        return (
          '<button type="button" class="mention-item" data-idx="' +
          i +
          '" data-insert="' +
          encodeURIComponent(m.insert) +
          '"><span class="mention-label">' +
          escapeHtml(m.label) +
          '</span><span class="mention-desc">' +
          escapeHtml(m.description || "") +
          "</span></button>"
        );
      })
      .join("");
    menuEl.style.display = "block";
    menuEl._filtered = items;
    menuEl._inputEl = inputEl;
  }

  function doSend() {
    if (!promptEl) return;
    const text = promptEl.value.trim();
    if (!text) return;
    const branchIndex = editFromMessageIndex;
    promptEl.value = "";
    editFromMessageIndex = null;
    setEditMode(false);
    const payload = { type: "send", text: text };
    if (branchIndex !== null && branchIndex !== undefined) {
      payload.editFromMessageIndex = branchIndex;
    }
    vscode.postMessage(payload);
  }

  function bind() {
    if (sendBtn) sendBtn.addEventListener("click", doSend);
    if (promptEl) {
      promptEl.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && editFromMessageIndex !== null) {
          e.preventDefault();
          editFromMessageIndex = null;
          setEditMode(false);
          promptEl.value = "";
          return;
        }
        if (mentionMenuEl && mentionMenuEl.style.display === "block" && e.key === "Escape") {
          hideMentionMenu();
          e.preventDefault();
          return;
        }
        if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !e.isComposing) {
          e.preventDefault();
          doSend();
        }
      });
      promptEl.addEventListener("input", function () {
        const val = promptEl.value;
        const pos = promptEl.selectionStart || val.length;
        const before = val.slice(0, pos);
        const at = before.lastIndexOf("@");
        if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]))) {
          const frag = before.slice(at + 1);
          if (!frag.includes(" ") && frag.length <= 24) {
            if (!mentionItems.length) vscode.postMessage({ type: "requestMentionMenu" });
            showMentionMenu(frag);
            return;
          }
        }
        hideMentionMenu();
      });
    }
    if (mentionMenuEl) {
      mentionMenuEl.addEventListener("click", function (e) {
        const btn = e.target.closest(".mention-item");
        if (!btn) return;
        insertMentionToken(decodeURIComponent(btn.dataset.insert || ""));
      });
    }
    if (providerEl) {
      providerEl.addEventListener("change", function () {
        vscode.postMessage({ type: "setProvider", provider: providerEl.value });
      });
    }
    if (modelEl) {
      modelEl.addEventListener("change", function () {
        vscode.postMessage({ type: "setModel", model: modelEl.value });
      });
    }
    if (chatModeEl) {
      chatModeEl.addEventListener("change", function () {
        vscode.postMessage({ type: "setChatMode", mode: chatModeEl.value });
      });
    }
    if (newSessionBtn) {
      newSessionBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "newSession" });
      });
    }
    if (attachBtn) {
      attachBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "attachMedia" });
      });
    }
    if (mentionBtn) {
      mentionBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "insertMention" });
      });
    }
    if (attachChipsEl) {
      attachChipsEl.addEventListener("click", function (e) {
        const rm = e.target.closest(".attach-chip-remove");
        if (rm && rm.dataset.path) {
          vscode.postMessage({ type: "removeAttachment", path: rm.dataset.path });
        }
      });
    }
    const openConfigBtn = document.getElementById("openConfig");
    if (openConfigBtn) {
      openConfigBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "openSettings" });
      });
    }
    if (undoBtn) undoBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "undo" });
    });
    if (redoBtn) redoBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "redo" });
    });
    if (resetConfigBtn) {
      resetConfigBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "resetConfig" });
      });
    }
    if (saveKeyBtn && apiKeyEl) {
      saveKeyBtn.addEventListener("click", function () {
        vscode.postMessage({
          type: "setApiKey",
          provider: providerEl ? providerEl.value : "",
          apiKey: apiKeyEl.value,
        });
      });
    }
    if (applyChangesBtn) {
      applyChangesBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "applyResponseChanges" });
      });
    }
    if (revertChangesBtn) {
      revertChangesBtn.addEventListener("click", function () {
        vscode.postMessage({ type: "revertResponseChanges" });
      });
    }
    if (sessionTabsEl) {
      sessionTabsEl.addEventListener("click", function (e) {
        const close = e.target.closest(".session-tab-close");
        if (close) {
          e.stopPropagation();
          vscode.postMessage({ type: "closeSession", sessionId: close.dataset.id });
          return;
        }
        const tab = e.target.closest(".session-tab");
        if (tab && tab.dataset.id) {
          vscode.postMessage({ type: "switchSession", sessionId: tab.dataset.id });
        }
      });
    }
    if (messagesEl) {
      messagesEl.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
        if (e.target.closest(".ask-clarify-input")) return;
        const block = e.target.closest('.ask-block[data-multi="1"]');
        if (!block || block.classList.contains("ask-block-resolved")) return;
        const selected = block.querySelectorAll(".ask-option.selected");
        if (!selected.length) return;
        e.preventDefault();
        sendAskMultiSelection(block);
      });
      messagesEl.addEventListener("click", function (e) {
        const permBtn = e.target.closest(".agent-perm-btn");
        if (permBtn) {
          const actions = permBtn.closest(".agent-perm-actions");
          if (actions && actions.dataset.requestId && !permBtn.disabled) {
            const choice = permBtn.classList.contains("allow") ? "allow" : "deny";
            vscode.postMessage({
              type: "agentPermissionResponse",
              requestId: actions.dataset.requestId,
              choice: choice,
            });
            resetPermissionActions(actions);
          }
          return;
        }
        const askOption = e.target.closest(".ask-option");
        if (askOption && !askOption.disabled) {
          const block = askOption.closest(".ask-block");
          if (block && block.classList.contains("ask-block-resolved")) return;
          const kind = askOption.dataset.kind || "option";
          const isGitSync = !!(block && block.dataset.gitSyncRequestId);
          if (kind === "others-toggle") {
            const list = block && block.querySelector(".ask-others-list");
            if (list) {
              const open = list.hidden;
              list.hidden = !open;
              askOption.classList.toggle("open", open);
            }
            return;
          }
          if (kind === "none") {
            openAskClarifyComposer(block);
            return;
          }
          const multi = block && block.dataset.multi === "1";
          if (multi && (kind === "option" || kind === "others")) {
            toggleAskMultiOption(askOption);
            return;
          }
          const choiceText = decodeURIComponent(askOption.dataset.text || "");
          if (isGitSync && postGitSyncChoice(block, choiceText)) return;
          resolveAskBlock(block);
          sendOptionText(choiceText);
          return;
        }
        const askSubmit = e.target.closest(".ask-submit-btn");
        if (askSubmit && !askSubmit.disabled) {
          const block = askSubmit.closest(".ask-block");
          if (block && block.dataset.gitSyncRequestId) {
            const selected = block.querySelectorAll(".ask-option.selected");
            const texts = [];
            selected.forEach(function (btn) {
              const t = decodeURIComponent(btn.dataset.text || "");
              if (t) texts.push(t);
            });
            if (texts.length && postGitSyncChoice(block, texts.join(", "))) return;
          }
          sendAskMultiSelection(askSubmit.closest(".ask-block"));
          return;
        }
        const clarifySend = e.target.closest(".ask-clarify-send");
        if (clarifySend) {
          const composer = clarifySend.closest(".ask-clarify-composer");
          const block = clarifySend.closest(".ask-block");
          const input = composer && composer.querySelector(".ask-clarify-input");
          const text = input ? input.value.trim() : "";
          if (!text) return;
          if (block && block.dataset.gitSyncRequestId && postGitSyncChoice(block, text)) return;
          resolveAskBlock(block);
          sendOptionText(text);
          return;
        }
        const clarifyMention = e.target.closest(".ask-clarify-mention");
        if (clarifyMention) {
          const composer = clarifyMention.closest(".ask-clarify-composer");
          const input = composer && composer.querySelector(".ask-clarify-input");
          if (input) {
            activeTextTarget = input;
            if (!mentionItems.length) vscode.postMessage({ type: "requestMentionMenu" });
            vscode.postMessage({ type: "insertMention" });
          }
          return;
        }
        const clarifyAttach = e.target.closest(".ask-clarify-attach");
        if (clarifyAttach) {
          const composer = clarifyAttach.closest(".ask-clarify-composer");
          const input = composer && composer.querySelector(".ask-clarify-input");
          if (input) activeTextTarget = input;
          vscode.postMessage({ type: "attachMedia" });
          return;
        }
        const runAgent = e.target.closest(".run-agent-btn");
        if (runAgent) {
          if (runAgent.disabled || runAgent.classList.contains("applied")) return;
          vscode.postMessage({
            type: "runAgentAction",
            code: decodeURIComponent(runAgent.dataset.code || ""),
            blockId: runAgent.dataset.blockId || "",
          });
          return;
        }
        const apply = e.target.closest(".apply-btn");
        if (apply) {
          if (apply.disabled || apply.classList.contains("applied")) return;
          vscode.postMessage({
            type: "applyCode",
            code: decodeURIComponent(apply.dataset.code || ""),
            language: apply.dataset.lang || "",
            blockId: apply.dataset.blockId || "",
          });
          return;
        }
        const stopGen = e.target.closest(".stop-gen-btn");
        if (stopGen) {
          vscode.postMessage({ type: "stopGeneration" });
          return;
        }
        const copyCode = e.target.closest(".copy-code-btn");
        if (copyCode) {
          copyText(decodeURIComponent(copyCode.dataset.code || ""));
          return;
        }
        const copyUser = e.target.closest(".copy-user-btn");
        if (copyUser) {
          copyText(decodeURIComponent(copyUser.dataset.raw || ""));
          return;
        }
        const copyMsg = e.target.closest(".copy-msg-btn");
        if (copyMsg) {
          const msg = copyMsg.closest(".msg");
          copyText(msg ? msg.dataset.raw || "" : "");
          return;
        }
        const deleteMsg = e.target.closest(".delete-msg-btn");
        if (deleteMsg) {
          const msgEl = deleteMsg.closest(".msg");
          if (!msgEl) return;
          const idx = messageIndexFromEl(msgEl);
          if (idx < 0) return;
          vscode.postMessage({ type: "deleteMessage", messageIndex: idx });
          return;
        }
        const editBtn = e.target.closest(".edit-btn");
        if (editBtn && promptEl) {
          const msgEl = editBtn.closest(".msg.user");
          if (!msgEl) return;
          const idx = messageIndexFromEl(msgEl);
          if (idx < 0) return;
          editFromMessageIndex = idx;
          setEditMode(true);
          promptEl.value = decodeURIComponent(editBtn.dataset.raw || msgEl.dataset.raw || "");
          promptEl.focus();
          return;
        }
        const dl = e.target.closest(".media-download-btn");
        if (dl) {
          const block = dl.closest(".media-block");
          if (block) {
            vscode.postMessage({
              type: "downloadMedia",
              url: block.dataset.url || "",
              filename: block.dataset.filename || "download",
            });
          }
        }
        const askMentionItem = e.target.closest(".ask-mention-menu .mention-item");
        if (askMentionItem) {
          const clarifyComposer = askMentionItem.closest(".ask-clarify-composer");
          const clarifyInput = clarifyComposer && clarifyComposer.querySelector(".ask-clarify-input");
          if (clarifyInput) activeTextTarget = clarifyInput;
          insertMentionToken(decodeURIComponent(askMentionItem.dataset.insert || ""));
          const menu = askMentionItem.closest(".ask-mention-menu");
          if (menu) {
            menu.style.display = "none";
            menu.innerHTML = "";
          }
        }
      });
      messagesEl.addEventListener("input", function (e) {
        const input = e.target.closest(".ask-clarify-input");
        if (!input) return;
        activeTextTarget = input;
        const val = input.value;
        const pos = input.selectionStart || val.length;
        const before = val.slice(0, pos);
        const at = before.lastIndexOf("@");
        const composer = input.closest(".ask-clarify-composer");
        const menu = composer && composer.querySelector(".ask-mention-menu");
        if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]))) {
          const frag = before.slice(at + 1);
          if (!frag.includes(" ") && frag.length <= 24) {
            if (!mentionItems.length) vscode.postMessage({ type: "requestMentionMenu" });
            showAskMentionMenu(menu, input, frag);
            return;
          }
        }
        if (menu) {
          menu.style.display = "none";
          menu.innerHTML = "";
        }
      });
      messagesEl.addEventListener("keydown", function (e) {
        const input = e.target.closest(".ask-clarify-input");
        if (!input) return;
        if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !e.isComposing) {
          e.preventDefault();
          const block = input.closest(".ask-block");
          const text = input.value.trim();
          if (!text) return;
          if (block && block.dataset.gitSyncRequestId && postGitSyncChoice(block, text)) return;
          resolveAskBlock(block);
          sendOptionText(text);
        }
      });
    }
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case "init":
        fillSelect(providerEl, msg.providers, msg.activeProvider);
        fillSelect(modelEl, msg.models, msg.activeModel);
        if (apiKeyRow) apiKeyRow.style.display = msg.needsApiKey ? "flex" : "none";
        if (apiKeyEl && msg.apiKey !== undefined) {
          apiKeyEl.value = msg.apiKey;
          apiKeyEl.placeholder = msg.apiKeyPlaceholder || "Paste your API key";
        }
        renderSessionTabs(msg.sessions);
        setUndoRedo(msg.canUndo, msg.canRedo);
        if (msg.inFlight) {
          restoreInFlightFromInit(msg);
        } else {
          streaming = false;
          currentAssistantWrap = null;
          resetPrepPanel();
          renderMessages(msg.messages);
        }
        renderAttachChips(msg.attachments);
        setComposerMode(!!msg.composerMode);
        setChatMode(msg.chatMode || (msg.composerMode ? "composer" : "agent"));
        if (statusEl) {
          var keyHint =
            msg.keyStatus === "cheradip"
              ? " · Included key"
              : msg.keyStatus === "custom"
                ? " · Key: set"
                : msg.needsApiKey
                  ? " · Add API key"
                  : "";
          lastStatusLine = (msg.statusLine || "Ready") + keyHint;
          if (!applyRevertVisible) statusEl.textContent = lastStatusLine;
        }
        setApplyRevertVisible(!!msg.pendingApplyRevert, !!msg.pendingApplyRevert);
        renderSendQueue(!!msg.queueRunning, msg.queueItems || []);
        break;
      case "showApplyRevert":
        setApplyRevertVisible(!!msg.showApply, !!msg.showRevert);
        break;
      case "hideApplyRevert":
        setApplyRevertVisible(false, false);
        if (statusEl) statusEl.textContent = lastStatusLine;
        break;
      case "attachments":
        renderAttachChips(msg.files);
        break;
      case "statusUpdate":
        if (statusEl && msg.text) {
          lastStatusLine = msg.text;
          if (!applyRevertVisible) statusEl.textContent = msg.text;
        }
        break;
      case "sessionTitle":
        if (sessionTabsEl && msg.sessionId && msg.title) {
          const tab = sessionTabsEl.querySelector('.session-tab[data-id="' + msg.sessionId + '"]');
          if (tab) {
            tab.title = msg.title;
            const label = tab.querySelector(".session-tab-label");
            if (label) label.textContent = msg.title;
          }
        }
        break;
      case "updateContext":
        renderAttachChips(msg.files || []);
        break;
      case "insertAtPrompt":
        if (msg.text) {
          const target = activeTextTarget || promptEl;
          if (target) {
            target.value = (target.value + msg.text).trim() + " ";
            target.focus();
          }
        }
        break;
      case "composerMode":
        setComposerMode(!!msg.enabled);
        break;
      case "resyncMessages":
        editFromMessageIndex = null;
        setEditMode(false);
        if (messagesEl) messagesEl.innerHTML = "";
        renderMessages(msg.messages || []);
        break;
      case "userMessage":
        if (messagesEl && messagesEl.querySelector(".empty")) messagesEl.innerHTML = "";
        appendMessage("user", msg.text, false);
        scrollMessagesToBottom(true);
        break;
      case "prepStart":
        setApplyRevertVisible(false, false);
        resetPrepPanel();
        showPrepPanel("Preparing prompt…");
        break;
      case "prepPhase":
        if (msg.label) showPrepPanel(msg.label);
        break;
      case "prepChunk":
        appendPrepChunk(msg.text || "");
        break;
      case "prepEnd":
        hidePrepPanel();
        if (msg.cancelled) {
          streaming = false;
          swapStopToCopy();
          if (statusEl) statusEl.textContent = "Stopped";
          lastStatusLine = "Stopped";
          break;
        }
        if (statusEl && !streaming) {
          statusEl.textContent = msg.error ? "Prompt prep failed — continuing" : "Running…";
        }
        break;
      case "assistantStart":
        streaming = true;
        if (statusEl) statusEl.textContent = "Agent thinking…";
        const built = appendMessage("assistant", "", true);
        currentAssistantWrap = built.div;
        break;
      case "agentStep":
        if (statusEl && msg.detail && !applyRevertVisible) {
          var phase =
            msg.phase === "tool"
              ? "Running"
              : msg.phase === "done"
                ? "Done"
                : msg.phase === "preparing"
                  ? "Preparing"
                  : "Agent";
          statusEl.textContent = phase + ": " + msg.detail;
        }
        break;
      case "assistantChunk":
        updateAssistant(msg.text);
        break;
      case "assistantEnd":
        streaming = false;
        if (statusEl && !applyRevertVisible) {
          statusEl.textContent = msg.model ? lastStatusLine + " · " + msg.model : lastStatusLine;
        }
        finalizeAssistantMessage();
        break;
      case "queueStatus": {
        var q = msg.queued || 0;
        var running = !!msg.running;
        if (msg.items) {
          renderSendQueue(running, msg.items);
        } else {
          renderSendQueue(running, queueItems);
        }
        if (q > 0 || running) {
          if (running && q > 0) {
            lastStatusLine = "Running + " + q + " queued";
          } else if (running) {
            lastStatusLine = "Running…";
          } else {
            lastStatusLine = q === 1 ? "1 message queued" : q + " messages queued";
          }
          if (statusEl && !applyRevertVisible) statusEl.textContent = lastStatusLine;
        } else if (!streaming && statusEl) {
          lastStatusLine = "Ready";
          statusEl.textContent = lastStatusLine;
        }
        break;
      }
      case "queueSync":
        renderSendQueue(!!msg.running, msg.items || []);
        if (editingQueueId) {
          const still = (msg.items || []).some(function (q) {
            return q.id === editingQueueId;
          });
          if (!still) {
            editingQueueId = null;
            editingQueueDraft = "";
          }
        }
        break;
      case "generationForceStopped":
        streaming = false;
        resetPrepPanel();
        swapStopToCopy();
        editingQueueId = null;
        editingQueueDraft = "";
        queueExpanded = false;
        if (statusEl) statusEl.textContent = "Stopped";
        lastStatusLine = "Stopped";
        renderSendQueue(false, []);
        break;
      case "assistantStopped":
        streaming = false;
        if (statusEl) statusEl.textContent = "Stopped";
        finalizeAssistantMessage();
        break;
      case "gitSyncAsk":
        showGitSyncAsk(msg);
        break;
      case "agentPermissionRequest":
        enablePermissionActions(findPermissionMessage(msg), msg);
        if (statusEl && msg.summary) statusEl.textContent = "Permission needed: " + msg.summary;
        break;
      case "applyResult":
      case "agentResult":
        if (msg.blockId && messagesEl) {
          var applyBtn = messagesEl.querySelector('[data-block-id="' + msg.blockId + '"]');
          if (applyBtn) {
            if (msg.type === "agentResult" && msg.status === "failed") {
              applyBtn.textContent = "Failed";
            } else if (msg.type === "agentResult" && msg.text && msg.text.indexOf("Denied:") === 0) {
              applyBtn.textContent = "Denied";
            } else {
              applyBtn.classList.add("applied");
              applyBtn.disabled = true;
              applyBtn.textContent =
                msg.type === "agentResult"
                  ? "Done"
                  : msg.status === "already"
                    ? "Already applied"
                    : "Applied";
            }
          }
        }
        if (msg.type === "agentResult" && msg.text) {
          showSnackbar(msg.text);
        }
        break;
      case "error":
        streaming = false;
        if (statusEl) statusEl.textContent = msg.text;
        appendMessage("assistant", "Error: " + msg.text, false);
        scrollMessagesToBottom(false);
        break;
      case "mentionMenu":
        mentionItems = msg.items || [];
        if (promptEl) {
          const val = promptEl.value;
          const pos = promptEl.selectionStart || val.length;
          const before = val.slice(0, pos);
          const at = before.lastIndexOf("@");
          const frag = at >= 0 ? before.slice(at + 1) : "";
          showMentionMenu(frag);
        }
        break;
      case "focusInput":
        if (promptEl) promptEl.focus();
        break;
      case "updateModels":
        fillSelect(modelEl, msg.models, msg.activeModel);
        break;
      case "reloadStyles":
        (function () {
          var link = document.getElementById("cheradip-css");
          if (!link && msg.url) {
            link = document.createElement("link");
            link.id = "cheradip-css";
            link.rel = "stylesheet";
            document.head.appendChild(link);
          }
          if (link && msg.url) link.href = msg.url;
        })();
        break;
    }
  });

  bind();
  bindSendQueueControls();
  vscode.postMessage({ type: "ready" });
})();
