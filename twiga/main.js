// Twiga — frontend. No build step, no framework: plain DOM + fetch.
//
// State model: one JSON blob in localStorage holding every saved
// conversation ("thread"), which one is active, the person's name, their
// theme choice, and their research-source toggle settings. A thread is only
// written to storage once it has at least one message — clicking "New chat"
// just clears the active id and shows the empty state again, it doesn't
// create a stored record until something is actually sent.

(() => {
  "use strict";

  const STORAGE_KEY = "twiga.state.v1";
  const MAX_MESSAGE_LENGTH = 12_000;
  const MAX_CONTEXT_MESSAGES = 24; // trimmed client-side; server hard-caps at 40
  const MAX_IMAGE_BYTES = 9_000_000; // ~12MB once base64-encoded, under the server's limit

  const $ = (id) => document.getElementById(id);
  const els = {
    appShell: document.querySelector(".app-shell"),
    sidebar: $("sidebar"),
    sidebarScrim: $("sidebarScrim"),
    sidebarToggle: $("sidebarToggle"),
    sidebarClose: $("sidebarClose"),
    newChatButton: $("newChatButton"),
    threadList: $("threadList"),
    profileButton: $("profileButton"),
    profileName: $("profileName"),
    avatarInitial: $("avatarInitial"),
    topbarTitle: $("topbarTitle"),
    themeToggle: $("themeToggle"),
    themeColorMeta: $("themeColorMeta"),
    conversation: $("conversation"),
    emptyState: $("emptyState"),
    greeting: $("greeting"),
    suggestions: $("suggestions"),
    messages: $("messages"),
    chatForm: $("chatForm"),
    messageInput: $("messageInput"),
    sendButton: $("sendButton"),
    stopButton: $("stopButton"),
    attachButton: $("attachButton"),
    imageInput: $("imageInput"),
    attachmentPreview: $("attachmentPreview"),
    webToggle: $("webToggle"),
    wikiToggle: $("wikiToggle"),
    xToggle: $("xToggle"),
    googleSearchButton: $("googleSearchButton"),
    settingsDialog: $("settingsDialog"),
    closeSettingsButton: $("closeSettingsButton"),
    settingsForm: $("settingsForm"),
    nameInput: $("nameInput"),
    clearAllButton: $("clearAllButton"),
    toast: $("toast"),
  };

  // ---------- State ----------
  function defaultState() {
    return { name: "", theme: "system", toggles: { web: true, wiki: true, x: false }, threads: [], activeId: null };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        toggles: { ...defaultState().toggles, ...(parsed.toggles || {}) },
        threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      };
    } catch {
      return defaultState();
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  const state = loadState();
  const rawTextByMessage = new WeakMap(); // assistant message wrapper -> raw text, for the Copy button
  let activeController = null; // AbortController for the in-flight stream, if any
  let userStopped = false;
  let pendingAttachment = null; // data URL of a staged image, or null

  function makeId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(message, duration = 2600) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), duration);
  }

  // ---------- Theme ----------
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function isDarkActive() {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit === "dark") return true;
    if (explicit === "light") return false;
    return systemPrefersDark();
  }
  let themeTransitionTimer = null;
  let themeTransitionEndHandler = null;
  function withThemeTransition(fn) {
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    clearTimeout(themeTransitionTimer);
    if (themeTransitionEndHandler) document.body.removeEventListener("transitionend", themeTransitionEndHandler);
    fn();
    const finish = () => {
      root.classList.remove("theme-transitioning");
      clearTimeout(themeTransitionTimer);
      document.body.removeEventListener("transitionend", themeTransitionEndHandler);
      themeTransitionEndHandler = null;
    };
    // Tie the cleanup to the real end of body's own color fade (the most
    // reliable signal we have) instead of a guessed delay, so the class
    // never gets removed a beat early and snaps the last bit of the fade.
    themeTransitionEndHandler = (event) => { if (event.target === document.body && event.propertyName === "color") finish(); };
    document.body.addEventListener("transitionend", themeTransitionEndHandler);
    // Safety net in case transitionend never fires (e.g. the tab was
    // backgrounded mid-fade), well past the 0.45s fade defined in style.css.
    themeTransitionTimer = setTimeout(finish, 700);
  }
  function applyTheme() {
    if (state.theme === "light" || state.theme === "dark") document.documentElement.setAttribute("data-theme", state.theme);
    else document.documentElement.removeAttribute("data-theme");
    const dark = isDarkActive();
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.title = label;
    els.themeColorMeta.setAttribute("content", dark ? "#252a32" : "#d2d7df");
  }
  els.themeToggle.addEventListener("click", () => {
    state.theme = isDarkActive() ? "light" : "dark";
    saveState();
    withThemeTransition(applyTheme);
  });

  // ---------- Research-source toggles ----------
  function applyToggleButton(button, isOn) {
    button.classList.toggle("is-on", isOn);
    button.setAttribute("aria-pressed", String(isOn));
  }
  function wireToggle(button, key) {
    applyToggleButton(button, state.toggles[key]);
    button.addEventListener("click", () => {
      state.toggles[key] = !state.toggles[key];
      saveState();
      applyToggleButton(button, state.toggles[key]);
    });
  }

  // ---------- Markdown-lite renderer ----------
  // Deliberately small: headings, paragraphs, bold/italic/inline code, links,
  // lists, blockquotes, and fenced code blocks with a copy button. Input is
  // HTML-escaped before any tag is introduced, so nothing the model or a
  // person types can inject markup.
  function renderInline(escaped) {
    let text = escaped;
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    return text;
  }
  function renderMarkdown(raw) {
    const lines = escapeHtml(raw || "").split(/\n/);
    let html = "";
    let list = null; // { type: "ul" | "ol", items: [] }
    const flushList = () => {
      if (!list) return;
      html += `<${list.type}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`;
      list = null;
    };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```\s*([A-Za-z0-9_+-]*)\s*$/);
      if (fence) {
        flushList();
        const lang = fence[1] || "";
        const codeLines = [];
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { codeLines.push(lines[i]); i += 1; }
        i += 1;
        const code = codeLines.join("\n");
        const encoded = encodeURIComponent(code.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
        html += `<pre class="code-block">${lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ""}<button type="button" class="code-copy" aria-label="Copy code" data-copy="${encoded}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg></button><code>${code}</code></pre>`;
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) { flushList(); const level = heading[1].length; html += `<h${level}>${renderInline(heading[2])}</h${level}>`; i += 1; continue; }
      const quote = line.match(/^&gt;\s?(.*)$/);
      if (quote) { flushList(); html += `<blockquote>${renderInline(quote[1])}</blockquote>`; i += 1; continue; }
      const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
      const unordered = line.match(/^\s*[-*]\s+(.*)$/);
      if (ordered) { if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; } list.items.push(ordered[1]); i += 1; continue; }
      if (unordered) { if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; } list.items.push(unordered[1]); i += 1; continue; }
      flushList();
      if (line.trim() === "") { i += 1; continue; }
      const paragraph = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() !== "" && !/^```/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) && !/^&gt;/.test(lines[i])) {
        paragraph.push(lines[i]);
        i += 1;
      }
      html += `<p>${renderInline(paragraph.join("<br>"))}</p>`;
    }
    flushList();
    return html;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); showToast("Copied"); }
    catch { showToast("Could not copy"); }
  }

  // ---------- Thread list (sidebar) ----------
  function renderThreads() {
    const sorted = [...state.threads].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!sorted.length) {
      els.threadList.innerHTML = `<p class="thread-empty-note">Your conversations will show up here.</p>`;
      return;
    }
    els.threadList.innerHTML = sorted.map((thread) => `
      <div class="thread-item${thread.id === state.activeId ? " is-active" : ""}" data-id="${thread.id}">
        <span class="thread-title">${escapeHtml(thread.title)}</span>
        <button type="button" class="thread-delete" data-id="${thread.id}" aria-label="Delete this conversation" title="Delete">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></svg>
        </button>
      </div>`).join("");
  }
  function deleteThread(id) {
    const index = state.threads.findIndex((t) => t.id === id);
    if (index === -1) return;
    state.threads.splice(index, 1);
    if (state.activeId === id) { state.activeId = null; showEmptyView(); }
    saveState();
    renderThreads();
    showToast("Conversation deleted");
  }
  function closeSidebarOnMobile() { els.appShell.classList.remove("sidebar-open"); }
  function selectThread(id) {
    if (activeController) { showToast("Please wait for Twiga to finish."); return; }
    if (id === state.activeId) { closeSidebarOnMobile(); return; }
    state.activeId = id;
    saveState();
    renderThreads();
    showThreadView();
    renderActiveThread();
    closeSidebarOnMobile();
  }
  els.threadList.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".thread-delete");
    if (deleteBtn) { event.stopPropagation(); deleteThread(deleteBtn.dataset.id); return; }
    const item = event.target.closest(".thread-item");
    if (item) selectThread(item.dataset.id);
  });

  // ---------- Empty state / thread view switching ----------
  function showEmptyView() {
    els.emptyState.hidden = false;
    els.messages.innerHTML = "";
    els.topbarTitle.textContent = "New chat";
    refreshGreeting();
  }
  function showThreadView() { els.emptyState.hidden = true; }
  function newChat() {
    if (activeController) { showToast("Please wait for Twiga to finish."); return; }
    state.activeId = null;
    saveState();
    renderThreads();
    showEmptyView();
    closeSidebarOnMobile();
    els.messageInput.focus();
  }
  els.newChatButton.addEventListener("click", newChat);

  function isPinnedToBottom() {
    const el = els.conversation;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
  }
  function scrollToBottom() { els.conversation.scrollTop = els.conversation.scrollHeight; }

  // ---------- Message rendering ----------
  function renderUserMessage(message) {
    const wrapper = document.createElement("div");
    wrapper.className = "message role-user";
    if (message.image) {
      const attachment = document.createElement("div");
      attachment.className = "message-attachment";
      attachment.innerHTML = `<img src="${message.image}" alt="Attached image" />`;
      wrapper.appendChild(attachment);
    }
    if (message.content) {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = escapeHtml(message.content).replace(/\n/g, "<br>");
      wrapper.appendChild(bubble);
    }
    els.messages.appendChild(wrapper);
    return wrapper;
  }

  function createAssistantWrapper() {
    const wrapper = document.createElement("div");
    wrapper.className = "message role-assistant";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    wrapper.appendChild(bubble);
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-button";
    copyBtn.hidden = true;
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg> Copy`;
    meta.appendChild(copyBtn);
    wrapper.appendChild(meta);
    return { wrapper, bubble, copyBtn };
  }
  function addThinkingPanel(wrapper, steps = [], complete = false) {
    if (!steps?.length || wrapper.querySelector(".thinking-panel")) return;
    const panel = document.createElement("details");
    panel.className = "thinking-panel";
    const summary = document.createElement("summary");
    const currentLabel = document.createElement("span");
    currentLabel.textContent = steps[steps.length - 1]?.label || "Reasoning";
    const currentState = document.createElement("span");
    currentState.className = "thinking-state";
    currentState.textContent = complete ? "Complete" : "In progress";
    summary.append(currentLabel, currentState);
    const list = document.createElement("ol");
    list.className = "thinking-steps";
    for (const step of steps) {
      const item = document.createElement("li");
      item.className = step.done ? "is-done" : "is-active";
      const label = document.createElement("span");
      label.className = "thinking-step-label";
      label.textContent = step.label || "Working";
      const detail = document.createElement("span");
      detail.className = "thinking-step-detail";
      detail.textContent = step.detail || "";
      item.append(label, detail);
      list.appendChild(item);
    }
    panel.append(summary, list);
    wrapper.insertBefore(panel, wrapper.firstChild);
  }
  function updateThinkingPanel(wrapper, steps) {
    const existing = wrapper.querySelector(".thinking-panel");
    const wasOpen = Boolean(existing?.open);
    if (existing) existing.remove();
    addThinkingPanel(wrapper, steps, false);
    if (wasOpen) wrapper.querySelector(".thinking-panel").open = true;
  }
  function appendAnswerSources(wrapper, urls) {
    const sources = [...new Set((urls || []).filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)))].slice(0, 12);
    if (!sources.length || wrapper.querySelector(".answer-sources")) return;
    const section = document.createElement("div");
    section.className = "answer-sources";
    const label = document.createElement("span");
    label.className = "answer-sources-label";
    label.textContent = "Sources";
    section.appendChild(label);
    for (const source of sources) {
      const link = document.createElement("a");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      try { link.textContent = new URL(source).hostname.replace(/^www\./, ""); }
      catch { continue; }
      section.appendChild(link);
    }
    wrapper.insertBefore(section, wrapper.querySelector(".message-meta"));
  }
  function appendWikiChip(wrapper, wiki) {
    if (!wiki) return;
    const chip = document.createElement("a");
    chip.className = "wiki-chip";
    chip.href = wiki.url;
    chip.target = "_blank";
    chip.rel = "noopener noreferrer";
    chip.innerHTML = `<span class="wiki-mark">W</span> ${escapeHtml(wiki.title)}`;
    wrapper.insertBefore(chip, wrapper.firstChild);
  }
  function renderStoredAssistantMessage(message) {
    const { wrapper, bubble, copyBtn } = createAssistantWrapper();
    bubble.innerHTML = renderMarkdown(message.content || "");
    if (message.wiki) appendWikiChip(wrapper, message.wiki);
    addThinkingPanel(wrapper, message.thinking, true);
    appendAnswerSources(wrapper, message.sources);
    copyBtn.hidden = false;
    rawTextByMessage.set(wrapper, message.content || "");
    els.messages.appendChild(wrapper);
  }
  function renderErrorMessage(thread, message) {
    const wrapper = document.createElement("div");
    wrapper.className = "message role-error";
    wrapper.innerHTML = `<div class="bubble"><span class="error-label">Couldn't send</span>${escapeHtml(message.content || "")}<div><button type="button" class="retry-button" data-thread-id="${thread.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M5.6 15A8 8 0 0 0 20 12M18.4 9A8 8 0 0 0 4 12"/></svg>Try again</button></div></div>`;
    els.messages.appendChild(wrapper);
    return wrapper;
  }
  function renderMessage(thread, message) {
    if (message.role === "user") renderUserMessage(message);
    else if (message.role === "assistant") renderStoredAssistantMessage(message);
    else if (message.role === "error") renderErrorMessage(thread, message);
  }
  function renderActiveThread() {
    const thread = state.threads.find((t) => t.id === state.activeId);
    if (!thread) { showEmptyView(); return; }
    els.messages.innerHTML = "";
    for (const message of thread.messages) renderMessage(thread, message);
    els.topbarTitle.textContent = thread.title;
    requestAnimationFrame(scrollToBottom);
  }

  els.messages.addEventListener("click", (event) => {
    const copyBtn = event.target.closest(".copy-button");
    if (copyBtn) {
      const wrapper = copyBtn.closest(".message");
      const text = rawTextByMessage.get(wrapper);
      if (text) copyToClipboard(text);
      return;
    }
    const codeCopyBtn = event.target.closest(".code-copy");
    if (codeCopyBtn) { copyToClipboard(decodeURIComponent(codeCopyBtn.dataset.copy || "")); return; }
    const retryBtn = event.target.closest(".retry-button");
    if (retryBtn) { retrySend(retryBtn.dataset.threadId); return; }
  });

  // ---------- Sending ----------
  function deriveTitle(text) {
    const clean = (text || "").trim().replace(/\s+/g, " ");
    if (!clean) return "Image";
    return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
  }
  function toApiMessage(message) {
    if (message.image) {
      const parts = [];
      if (message.content) parts.push({ type: "input_text", text: message.content });
      parts.push({ type: "input_image", image_url: message.image });
      return { role: message.role, content: parts };
    }
    return { role: message.role, content: message.content };
  }
  function buildApiConversation(thread) {
    return thread.messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-MAX_CONTEXT_MESSAGES).map(toApiMessage);
  }
  function updateSendButtonState() {
    els.sendButton.disabled = !(els.messageInput.value.trim() || pendingAttachment) || Boolean(activeController);
  }

  async function performSend(thread) {
    els.sendButton.hidden = true;
    els.stopButton.hidden = false;
    activeController = new AbortController();
    userStopped = false;

    const { wrapper } = createAssistantWrapper();
    els.messages.appendChild(wrapper);
    wrapper.querySelector(".bubble").classList.add("is-streaming");
    const pinned = isPinnedToBottom();
    if (pinned) scrollToBottom();

    let accumulated = "";
    let wiki = null;
    let sources = [];
    const thinking = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: buildApiConversation(thread),
          webSearch: state.toggles.web,
          wikipedia: state.toggles.wiki,
          xSearch: state.toggles.x,
        }),
        signal: activeController.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Twiga could not reach its AI service (${response.status}).`);
      }
      if (!response.body) throw new Error("Twiga could not reach its AI service. Please try again.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separator;
        while ((separator = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          if (!rawEvent || rawEvent.startsWith(":")) continue;
          const eventLine = rawEvent.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const eventName = eventLine.slice(6).trim();
          let payload = {};
          try { payload = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
          if (eventName === "wiki") {
            wiki = payload;
            appendWikiChip(wrapper, wiki);
          } else if (eventName === "stage") {
            const current = thinking[thinking.length - 1];
            if (current && current.step === payload.step) {
              current.label = payload.label || current.label;
              current.detail = payload.detail || current.detail;
              current.done = false;
            } else {
              if (current) current.done = true;
              thinking.push({ step: payload.step, label: payload.label, detail: payload.detail, done: false });
            }
            updateThinkingPanel(wrapper, thinking);
            if (pinned) scrollToBottom();
          } else if (eventName === "citations") {
            sources = Array.isArray(payload.urls) ? payload.urls : [];
          } else if (eventName === "delta") {
            accumulated += payload.text || "";
            wrapper.querySelector(".bubble").innerHTML = renderMarkdown(accumulated);
            if (pinned) scrollToBottom();
          } else if (eventName === "error") {
            throw new Error(payload.message || "The local model is temporarily unavailable. Please try again.");
          }
          // "done" needs no action here; finalize happens after the loop ends.
        }
      }
      if (thinking.length) thinking[thinking.length - 1].done = true;
      finalizeAssistantMessage(thread, wrapper, accumulated, wiki, { thinking, sources });
    } catch (error) {
      if (error?.name === "AbortError") {
        if (userStopped) finalizeAssistantMessage(thread, wrapper, accumulated, wiki, { stopped: true });
      } else {
        wrapper.remove();
        appendErrorMessage(thread, error?.message || "Twiga could not reach its AI service. Please try again.");
      }
    } finally {
      activeController = null;
      els.stopButton.hidden = true;
      els.sendButton.hidden = false;
      updateSendButtonState();
    }
  }

  function finalizeAssistantMessage(thread, wrapper, text, wiki, opts) {
    const bubble = wrapper.querySelector(".bubble");
    bubble.classList.remove("is-streaming");
    const finalText = text && text.trim() ? text : opts.stopped ? text : "_Twiga didn't return any text for that request._";
    bubble.innerHTML = renderMarkdown(finalText);
    const copyBtn = wrapper.querySelector(".copy-button");
    if (copyBtn) copyBtn.hidden = false;
    rawTextByMessage.set(wrapper, finalText);
    const message = { role: "assistant", content: finalText };
    if (wiki) message.wiki = wiki;
    if (opts.thinking?.length) {
      message.thinking = opts.thinking.map(({ step, label, detail }) => ({ step, label, detail, done: true }));
      addThinkingPanel(wrapper, message.thinking, true);
    }
    if (opts.sources?.length) {
      message.sources = opts.sources;
      appendAnswerSources(wrapper, opts.sources);
    }
    thread.messages.push(message);
    thread.updatedAt = Date.now();
    saveState();
    renderThreads();
  }

  function appendErrorMessage(thread, text) {
    const message = { role: "error", content: text };
    thread.messages.push(message);
    thread.updatedAt = Date.now();
    saveState();
    renderThreads();
    renderErrorMessage(thread, message);
    requestAnimationFrame(scrollToBottom);
  }

  async function retrySend(threadId) {
    if (activeController || !threadId) return;
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return;
    while (thread.messages.length && thread.messages[thread.messages.length - 1].role === "error") thread.messages.pop();
    saveState();
    if (state.activeId === threadId) {
      const errorNodes = els.messages.querySelectorAll(".message.role-error");
      if (errorNodes.length) errorNodes[errorNodes.length - 1].remove();
    }
    await performSend(thread);
  }

  async function handleSend() {
    if (activeController) { showToast("Please wait for Twiga to finish."); return; }
    const text = els.messageInput.value.trim();
    const image = pendingAttachment;
    if (!text && !image) return;
    if (text.length > MAX_MESSAGE_LENGTH) { showToast(`Message is too long (${MAX_MESSAGE_LENGTH.toLocaleString()} character limit).`); return; }

    let thread = state.threads.find((t) => t.id === state.activeId);
    let shouldNameThread = false;
    if (!thread) {
      thread = { id: makeId(), title: deriveTitle(text), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      state.threads.push(thread);
      state.activeId = thread.id;
      showThreadView();
    }
    shouldNameThread = thread.messages.length === 0 && Boolean(text);
    const userMessage = { role: "user", content: text };
    if (image) userMessage.image = image;
    thread.messages.push(userMessage);
    thread.updatedAt = Date.now();
    saveState();
    renderUserMessage(userMessage);
    renderThreads();
    els.topbarTitle.textContent = thread.title;
    if (shouldNameThread) generateConversationTitle(thread, text);

    els.messageInput.value = "";
    els.messageInput.style.height = "auto";
    pendingAttachment = null;
    renderAttachmentPreview();
    updateSendButtonState();
    requestAnimationFrame(scrollToBottom);

    await performSend(thread);
  }
  els.chatForm.addEventListener("submit", (event) => { event.preventDefault(); handleSend(); });
  els.stopButton.addEventListener("click", () => { userStopped = true; if (activeController) activeController.abort(); });

  // ---------- Composer ----------
  els.messageInput.addEventListener("input", () => {
    els.messageInput.style.height = "auto";
    els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 200)}px`;
    updateSendButtonState();
  });
  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      els.chatForm.requestSubmit();
    }
  });
  els.suggestions.addEventListener("click", (event) => {
    const btn = event.target.closest(".suggestion");
    if (!btn) return;
    els.messageInput.value = btn.dataset.prompt || "";
    handleSend();
  });

  function renderAttachmentPreview() {
    if (!pendingAttachment) { els.attachmentPreview.hidden = true; els.attachmentPreview.innerHTML = ""; return; }
    els.attachmentPreview.hidden = false;
    els.attachmentPreview.innerHTML = `<img src="${pendingAttachment}" alt="Attached image" /><button type="button" class="remove-attachment" aria-label="Remove image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg></button>`;
    els.attachmentPreview.querySelector(".remove-attachment").addEventListener("click", () => {
      pendingAttachment = null;
      renderAttachmentPreview();
      updateSendButtonState();
    });
  }
  els.attachButton.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", async () => {
    const file = els.imageInput.files?.[0];
    els.imageInput.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) { showToast("Please choose a PNG or JPEG image."); return; }
    if (file.size > MAX_IMAGE_BYTES) { showToast("That image is too large (9 MB limit)."); return; }
    try {
      pendingAttachment = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      renderAttachmentPreview();
      updateSendButtonState();
    } catch { showToast("Could not read that image."); }
  });

  function getLastUserText() {
    const thread = state.threads.find((t) => t.id === state.activeId);
    if (!thread) return "";
    for (let i = thread.messages.length - 1; i >= 0; i -= 1) if (thread.messages[i].role === "user") return thread.messages[i].content || "";
    return "";
  }
  els.googleSearchButton.addEventListener("click", () => {
    const text = els.messageInput.value.trim() || getLastUserText();
    if (!text) { showToast("Type something first."); return; }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  });

  // ---------- Sidebar (mobile overlay) ----------
  els.sidebarToggle.addEventListener("click", () => els.appShell.classList.add("sidebar-open"));
  els.sidebarClose.addEventListener("click", closeSidebarOnMobile);
  els.sidebarScrim.addEventListener("click", closeSidebarOnMobile);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.appShell.classList.contains("sidebar-open")) closeSidebarOnMobile();
  });

  // ---------- Settings dialog (with a fallback for browsers without <dialog>) ----------
  const supportsDialog = typeof HTMLDialogElement === "function" && typeof els.settingsDialog.showModal === "function";
  let fallbackBackdrop = null;
  function openSettings() {
    els.nameInput.value = state.name || "";
    if (supportsDialog) { els.settingsDialog.showModal(); return; }
    if (!fallbackBackdrop) {
      fallbackBackdrop = document.createElement("div");
      fallbackBackdrop.className = "dialog-backdrop-fallback";
      fallbackBackdrop.addEventListener("click", closeSettings);
      document.body.appendChild(fallbackBackdrop);
    }
    els.settingsDialog.classList.add("no-dialog-support");
    els.settingsDialog.setAttribute("data-open", "true");
    fallbackBackdrop.classList.add("is-visible");
  }
  function closeSettings() {
    if (supportsDialog) { if (els.settingsDialog.open) els.settingsDialog.close(); return; }
    els.settingsDialog.removeAttribute("data-open");
    fallbackBackdrop?.classList.remove("is-visible");
  }
  els.profileButton.addEventListener("click", openSettings);
  els.closeSettingsButton.closest("form").addEventListener("submit", (event) => { event.preventDefault(); closeSettings(); });
  els.settingsDialog.addEventListener("click", (event) => { if (event.target === els.settingsDialog) closeSettings(); });
  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.name = els.nameInput.value.trim().slice(0, 24);
    saveState();
    updateProfileDisplay();
    closeSettings();
    showToast("Saved");
    refreshGreeting();
  });
  els.clearAllButton.addEventListener("click", () => {
    if (!window.confirm("Delete all conversations? This can't be undone.")) return;
    state.threads = [];
    state.activeId = null;
    saveState();
    renderThreads();
    closeSettings();
    showEmptyView();
    showToast("All conversations cleared");
  });
  function updateProfileDisplay() {
    els.profileName.textContent = state.name || "Settings";
    els.avatarInitial.textContent = (state.name.trim()[0] || "T").toUpperCase();
  }

  // ---------- Personalized greeting for the empty state ----------
  async function refreshGreeting() {
    try {
      const now = new Date();
      const day = new Intl.DateTimeFormat("en", { weekday: "long" }).format(now);
      const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const variation = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const response = await fetch("/api/greeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: state.name || "", day, time, variation }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.greeting) els.greeting.textContent = data.greeting;
      if (data.placeholder) els.messageInput.placeholder = data.placeholder;
    } catch { /* the static default stays; not worth surfacing to the person */ }
  }

  async function generateConversationTitle(thread, firstMessage) {
    const fallback = thread.title;
    try {
      const response = await fetch("/api/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: firstMessage }),
      });
      if (!response.ok) return;
      const data = await response.json();
      const title = String(data.title || "").trim().replace(/[\r\n]+/g, " ").slice(0, 42);
      if (!title || !state.threads.includes(thread) || thread.title !== fallback) return;
      thread.title = title;
      thread.updatedAt = Date.now();
      saveState();
      renderThreads();
      if (state.activeId === thread.id) els.topbarTitle.textContent = title;
    } catch { /* Keep the local title when the naming request is unavailable. */ }
  }

  // ---------- Init ----------
  function init() {
    applyTheme();
    wireToggle(els.webToggle, "web");
    wireToggle(els.wikiToggle, "wiki");
    wireToggle(els.xToggle, "x");
    updateProfileDisplay();
    renderThreads();
    updateSendButtonState();

    const activeThread = state.threads.find((t) => t.id === state.activeId);
    if (activeThread) { showThreadView(); renderActiveThread(); }
    else { state.activeId = null; showEmptyView(); }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
