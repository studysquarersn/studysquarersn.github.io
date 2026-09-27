import { Add, ArrowDoorIn, Information, ArrowsRotate, Send, Trash3, AlertTriangle, Calculator3, Glass, Activity, Unread, Messages4, EnvelopeUnread, Accessibility, MoreH, Bookmark, FileError, Bell, ChartLine, ShieldCheck, Copy3 } from "https://esm.sh/reicon";

const icons = { Add, ArrowDoorIn, Information, ArrowsRotate, Send, Trash3, AlertTriangle, Calculator3, Glass, Activity, Unread, Messages4, EnvelopeUnread, Accessibility, MoreH, Bookmark, FileError, Bell, ChartLine, ShieldCheck, Copy3 };
function mountIcons(root = document) {
  root.querySelectorAll?.("[data-icon]").forEach((slot) => {
    if (slot.dataset.iconMounted === "true") return;
    const factory = icons[slot.dataset.icon];
    if (typeof factory !== "function") return;
    try {
      const svg = factory({ size: Number(slot.dataset.size || 20), "aria-hidden": true, focusable: false });
      slot.replaceChildren(svg);
      slot.dataset.iconMounted = "true";
    } catch (error) { console.warn(`Study Square icon could not render: ${slot.dataset.icon}`, error); }
  });
}
mountIcons();
new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) mountIcons(node);
}))).observe(document.body, { childList: true, subtree: true });
