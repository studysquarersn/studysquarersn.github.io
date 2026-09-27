// Softly hide the decorative page dots around visible UI text. Chat bubbles
// are intentionally excluded so the conversation keeps its existing styling.
(() => {
  "use strict";

  const root = document.querySelector(".main-content");
  if (!root) return;

  const layer = document.createElement("div");
  layer.className = "dot-mask-layer";
  layer.setAttribute("aria-hidden", "true");
  root.append(layer);

  let frame = 0;
  function scheduleUpdate() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateMasks();
    });
  }

  function updateMasks() {
    const masks = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node !== root && node.matches(".dot-mask-layer, .bubble, .message-bubble, script, style, svg, textarea, input, button, [aria-hidden='true']")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        masks.push({
          left: rect.left - 9,
          top: rect.top - 6,
          width: rect.width + 18,
          height: rect.height + 12,
        });
      }
      range.detach?.();
    }

    layer.replaceChildren(...masks.map(({ left, top, width, height }) => {
      const mask = document.createElement("span");
      mask.className = "dot-mask";
      mask.style.left = `${left}px`;
      mask.style.top = `${top}px`;
      mask.style.width = `${width}px`;
      mask.style.height = `${height}px`;
      return mask;
    }));
  }

  const observer = new MutationObserver((records) => {
    const hasRelevantChange = records.some(({ target }) => {
      const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
      return !element?.closest(".bubble, .message-bubble, .dot-mask-layer");
    });
    if (hasRelevantChange) scheduleUpdate();
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("scroll", scheduleUpdate, { passive: true, capture: true });
  document.fonts?.ready.then(scheduleUpdate);
  scheduleUpdate();
})();
