"use client";

import { useEffect } from "react";

const STYLE_ID = "benefy-devtools-menu-transition";

const BASE_CSS = `
  #nextjs-dev-tools-menu {
    opacity: 0 !important;
    transform: translateY(10px) scale(0.96) !important;
    transition:
      opacity 300ms cubic-bezier(0.16, 1, 0.3, 1),
      transform 300ms cubic-bezier(0.16, 1, 0.3, 1) !important;
  }

  #nextjs-dev-tools-menu[data-benefy-open="true"] {
    opacity: 1 !important;
    transform: translateY(0) scale(1) !important;
  }
`;

function transformOriginForMenu(menu: HTMLElement): string {
  const style = menu.style;
  if (style.bottom && style.bottom !== "auto") {
    return style.left && style.left !== "auto" ? "bottom left" : "bottom right";
  }
  return style.left && style.left !== "auto" ? "top left" : "top right";
}

function animateMenuOpen(menu: HTMLElement) {
  menu.style.transformOrigin = transformOriginForMenu(menu);
  menu.removeAttribute("data-benefy-open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      menu.setAttribute("data-benefy-open", "true");
    });
  });
}

function injectIntoShadowRoot(shadow: ShadowRoot) {
  if (shadow.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = BASE_CSS;
  shadow.appendChild(style);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement && node.id === "nextjs-dev-tools-menu") {
          animateMenuOpen(node);
          continue;
        }
        if (node instanceof HTMLElement) {
          const menu = node.querySelector<HTMLElement>("#nextjs-dev-tools-menu");
          if (menu) animateMenuOpen(menu);
        }
      }
    }
  });

  observer.observe(shadow, { childList: true, subtree: true });

  const existing = shadow.getElementById("nextjs-dev-tools-menu");
  if (existing) animateMenuOpen(existing);
}

function attachToPortal(portal: Element) {
  if (portal.shadowRoot) {
    injectIntoShadowRoot(portal.shadowRoot);
  }
}

function scanForDevToolsPortals() {
  document.querySelectorAll("nextjs-portal").forEach(attachToPortal);
}

export default function DevToolsMenuTransition() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    scanForDevToolsPortals();

    const observer = new MutationObserver(() => {
      scanForDevToolsPortals();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
