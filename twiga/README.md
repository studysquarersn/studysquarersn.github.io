# Twiga

Twiga is a browser chat app backed by one Ollama model. The server sends each request to that model; there are no provider API keys in the browser and users do not need to supply their own. The default model is Gemma 4 31B.

## Run locally

1. Install Node.js and [Ollama](https://ollama.com/download).
2. Download the model once: `ollama pull gemma4:31b`.
3. Copy `.env.example` to `.env` if you want to change the defaults.
4. Start Ollama and run `npm start` from this folder.
5. Open <http://localhost:3000>.

The default Ollama endpoint is `http://127.0.0.1:11434`. Change `OLLAMA_BASE_URL` if the model server is elsewhere. `OLLAMA_MODEL` selects the installed model and `OLLAMA_NUM_CTX` sets the context window Twiga requests (default 8192 to reduce memory pressure). Gemma 4 31B is a large model; generation speed and whether it fits comfortably depend on the machine's available memory and hardware. A smaller Gemma 4 variant can be selected by changing `OLLAMA_MODEL` to a tag available in Ollama.

## How answers are generated

One model handles the greeting, conversation title, and assistant answer. For each chat reply, Twiga first retrieves enabled source material, then makes one streaming model call with the conversation and source excerpts. The answer instruction favors direct, warm, thoughtful replies; asks a focused follow-up when essential context is missing; adapts detail to the user's experience; and states uncertainty rather than inventing facts. It does not promise that AI answers are always correct.

The “Thinking” disclosure reports actual work such as searching selected sources and composing the response. It is a concise progress view, not a transcript of hidden chain-of-thought.

### Search sources

- **Web / Google:** the server requests Google Search result pages and passes a few extracted titles, snippets, and links to the model. This is best-effort HTML parsing, not an official Google Search API; Google may block requests or change its page markup. Twiga does not fetch and ingest the full text of every result page.
- **Wikipedia:** the server uses Wikipedia's public API to retrieve an article summary when relevant.
- **X:** Twiga searches Google-indexed `x.com` pages. It does not use the X API, so results can be incomplete or out of date.
- **Google button:** opens a separate Google search for the current prompt; it is not itself a source toggle.

Retrieved text is marked as source material, not instructions. The answer prompt asks the model to distinguish evidence from uncertainty and to avoid claiming it checked sources that were not retrieved.

## Hosting

Ollama must run on a machine the Twiga server can reach. For a public website, run the model on the backend host or a private model server and set `OLLAMA_BASE_URL` to its private address. Keep Ollama's port private; expose Twiga's web server instead. A local Ollama process on your personal computer will not automatically be available to a separately hosted website.

Configure `HOST=0.0.0.0` only when the hosting environment requires it, and set `ALLOWED_ORIGINS` to the exact HTTPS site origin. The basic per-IP request limit (`RATE_LIMIT_PER_MINUTE`, default 20/minute) is in memory, resets when the process restarts, and is not shared across multiple server instances. It is not authentication or a durable quota; add those controls before making an instance broadly available.

There are no model API keys to store when using local Ollama. Do not expose the Ollama service directly to browsers. For a reverse proxy/CDN, ensure it passes through `text/event-stream` without buffering so streamed answers appear as they are generated.

## Project notes

- Plain HTML, CSS, and JavaScript; no frontend build step.
- `/api/chat` streams progress, citations, and answer deltas using Server-Sent Events.
- Chat history lives in the browser's `localStorage`; there is no account system or server-side conversation history.
- `npm test` runs the `node:test` suite for request validation, origin checks, and SSE framing.
