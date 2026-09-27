// Pure, dependency-light helpers shared by the server and its tests.
// Nothing in here starts a server or touches process.env, so it can be
// imported and exercised directly by test/lib.test.mjs.

export function validateMessage(message) {
  if (!message || !["user", "assistant"].includes(message.role)) return null;
  if (typeof message.content === "string") {
    if (message.content.length > 12_000) return null;
    return { role: message.role, content: message.content };
  }
  if (!Array.isArray(message.content) || message.content.length > 4) return null;
  const content = [];
  for (const part of message.content) {
    if (part?.type === "input_text" && typeof part.text === "string" && part.text.length <= 12_000) {
      content.push({ type: "input_text", text: part.text });
    } else if (part?.type === "input_image" && typeof part.image_url === "string" && part.image_url.length <= 12_000_000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(part.image_url)) {
      content.push({ type: "input_image", image_url: part.image_url, detail: "high" });
    } else return null;
  }
  return { role: message.role, content };
}

export function fallbackGreeting(day, name) {
  const firstName = name.split(/\s+/)[0].slice(0, 12);
  const options = [`How's ${day}${firstName ? `, ${firstName}` : ""}?`, `A fresh ${day}, ${firstName || "friend"}.`, `${firstName ? `Hello, ${firstName}` : "Hello"} — happy ${day}.`, `Take today gently, ${firstName || "friend"}.`];
  const choice = options[Math.floor(Math.random() * options.length)];
  return choice.length <= 32 ? choice : `Happy ${day}.`;
}

export function outputText(data) {
  if (typeof data.message?.content === "string") return data.message.content;
  const messageContent = data.choices?.[0]?.message?.content;
  if (typeof messageContent === "string") return messageContent;
  if (Array.isArray(messageContent)) return messageContent.filter((item) => item.type === "text").map((item) => item.text || "").join("\n");
  return data.output?.filter((item) => item.type === "message").flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n") || "";
}

// origin/host come straight off request.headers; allowedOrigins is the
// parsed ALLOWED_ORIGINS list (empty means "same host as the request").
export function isOriginAllowed({ origin, host, allowedOrigins = [] }) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (allowedOrigins.length) return allowedOrigins.includes(parsed.origin);
    return parsed.host === host;
  } catch { return false; }
}

// Pulls the most recent user question out of a conversation array, so the
// server can run a Wikipedia lookup itself instead of trusting the client.
export function extractLastUserText(conversation) {
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const message = conversation[i];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      const textPart = message.content.find((part) => part?.type === "input_text");
      if (textPart?.text) return textPart.text;
    }
  }
  return "";
}

export async function wikipediaLookup(query, fetchImpl = fetch) {
  if (!query) return null;
  try {
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.search = new URLSearchParams({ action: "query", list: "search", srsearch: query.slice(0, 180), srlimit: "1", format: "json", origin: "*" });
    const searchResponse = await fetchImpl(searchUrl, { signal: AbortSignal.timeout(6_000) });
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    const title = searchData.query?.search?.[0]?.title;
    if (!title) return null;
    const pageUrl = new URL("https://en.wikipedia.org/w/api.php");
    pageUrl.search = new URLSearchParams({ action: "query", prop: "extracts", exintro: "1", explaintext: "1", exchars: "1100", titles: title, format: "json", origin: "*" });
    const pageResponse = await fetchImpl(pageUrl, { signal: AbortSignal.timeout(6_000) });
    if (!pageResponse.ok) return null;
    const pageData = await pageResponse.json();
    const page = Object.values(pageData.query?.pages || {})[0];
    if (!page?.extract) return null;
    return { title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, extract: page.extract.slice(0, 1100) };
  } catch { return null; }
}

// Formats one Server-Sent-Events frame. Used for every event the /api/chat
// stream writes to the browser (delta / wiki / done / error), and exercised
// directly in tests since the wire format matters (blank line = frame end,
// and a stray newline inside `event` would silently corrupt the stream).
export function sseFrame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Parses one upstream SSE payload line from Ollama's OpenAI-compatible
// Chat Completions stream into the normalized events used by the server.
export function parseUpstreamEvent(payload) {
  if (payload === "[DONE]") return { kind: "done", response: null };
  let parsed;
  try { parsed = JSON.parse(payload); } catch { return null; }
  if (parsed?.error) return { kind: "error", message: (typeof parsed.error === "string" ? parsed.error : parsed.error.message) || "Ollama returned an error." };
  if (typeof parsed.message?.content === "string" && parsed.message.content) return { kind: "delta", text: parsed.message.content };
  if (parsed.done === true) return { kind: "done", response: parsed };
  const choice = parsed.choices?.[0];
  const delta = choice?.delta?.content;
  if (typeof delta === "string" && delta) return { kind: "delta", text: delta };
  if (Array.isArray(delta)) {
    const text = delta.filter((item) => item.type === "text").map((item) => item.text || "").join("");
    if (text) return { kind: "delta", text };
  }
  if (choice?.finish_reason) return { kind: "done", response: parsed };
  const type = parsed?.type || "";
  if (type.endsWith("output_text.delta") && typeof parsed.delta === "string") {
    return { kind: "delta", text: parsed.delta };
  }
  if (type === "response.completed" || type === "response.done") {
    return { kind: "done", response: parsed.response || parsed };
  }
  if (type === "error" || type === "response.error" || type === "response.failed") {
    return { kind: "error", message: parsed.error?.message || parsed.response?.error?.message || parsed.message || "The model returned an error." };
  }
  return null;
}
