import { useLayoutEffect } from "react";

type ChatraIntegration = {
  name: string;
  notes: string;
  Store: string;
  Domain: string;
};

declare global {
  interface Window {
    ChatraID: string;
    Chatra: ((...args: unknown[]) => void) & { q?: unknown[] };
    ChatraIntegration?: ChatraIntegration;
  }
}

const CHATRA_SCRIPT = "https://call.chatra.io/chatra.js";

function shopIntegration(
  shopDomain?: string,
  shopName?: string,
): ChatraIntegration | null {
  const domain = shopDomain?.trim();
  if (!domain) {
    return null;
  }
  const store = shopName?.trim() || domain.replace(/\.myshopify\.com$/i, "");
  return {
    name: `${store} (${domain})`,
    notes: domain,
    Store: store,
    Domain: domain,
  };
}

function applyChatraIdentity(integration: ChatraIntegration) {
  window.ChatraIntegration = integration;
  if (typeof window.Chatra === "function") {
    window.Chatra("updateIntegrationData", {
      name: integration.name,
      notes: integration.notes,
      Store: integration.Store,
      Domain: integration.Domain,
    });
  }
}

export default function ChatraWidget({
  shopDomain,
  shopName,
}: {
  shopDomain?: string;
  shopName?: string;
}) {
  useLayoutEffect(() => {
    const integration = shopIntegration(shopDomain, shopName);
    if (!integration) {
      return;
    }

    window.ChatraID = "otFcs4SwiWA2FJ6gq";
    window.Chatra =
      window.Chatra ||
      function () {
        (window.Chatra.q = window.Chatra.q || []).push(arguments);
      };
    applyChatraIdentity(integration);

    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${CHATRA_SCRIPT}"]`,
    );
    if (!script) {
      script = document.createElement("script");
      script.async = true;
      script.src = CHATRA_SCRIPT;
      document.head.appendChild(script);
    }

    const syncName = () => applyChatraIdentity(integration);
    script.addEventListener("load", syncName);
    const retries = [300, 1000, 2500].map((ms) => window.setTimeout(syncName, ms));

    return () => {
      script?.removeEventListener("load", syncName);
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, [shopDomain, shopName]);

  return null;
}
