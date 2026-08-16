import { useEffect } from "react";

type ChatraIntegration = {
  name?: string;
  notes?: string;
  Domain?: string;
  Store?: string;
};

declare global {
  interface Window {
    ChatraID: string;
    Chatra: ((...args: unknown[]) => void) & { q?: unknown[] };
    ChatraIntegration?: ChatraIntegration;
  }
}

function shopIntegration(shopDomain?: string, shopName?: string): ChatraIntegration | null {
  const domain = shopDomain?.trim();
  if (!domain) {
    return null;
  }
  const store = shopName?.trim() || domain.replace(/\.myshopify\.com$/i, "");
  return {
    name: store,
    notes: domain,
    Store: store,
    Domain: domain,
  };
}

export default function ChatraWidget({
  shopDomain,
  shopName,
}: {
  shopDomain?: string;
  shopName?: string;
}) {
  useEffect(() => {
    const integration = shopIntegration(shopDomain, shopName);
    if (integration) {
      window.ChatraIntegration = integration;
    }

    window.ChatraID = "otFcs4SwiWA2FJ6gq";

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://call.chatra.io/chatra.js"]',
    );
    if (!existing) {
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://call.chatra.io/chatra.js";
      window.Chatra =
        window.Chatra ||
        function () {
          (window.Chatra.q = window.Chatra.q || []).push(arguments);
        };
      document.head.appendChild(script);
    }

    if (integration && typeof window.Chatra === "function") {
      window.Chatra("setIntegrationData", integration);
    }
  }, [shopDomain, shopName]);

  return null;
}
