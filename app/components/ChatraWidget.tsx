import { useEffect } from "react";
import type { ChatraIdentity } from "../utils/chatra-identity.server";

const CHATRA_ID = "otFcs4SwiWA2FJ6gq";
const CHATRA_SCRIPT_SRC = "https://call.chatra.io/chatra.js";

declare global {
  interface Window {
    ChatraID: string;
    Chatra: ((...args: unknown[]) => void) & { q?: unknown[] };
    ChatraSetup?: Record<string, unknown>;
    ChatraIntegration?: Record<string, unknown>;
  }
}

function integrationData(identity: ChatraIdentity) {
  return {
    "Store Name": identity.storeName,
    "Shop Domain": identity.shopDomain,
  };
}

function applyChatraIdentity(identity: ChatraIdentity) {
  window.ChatraSetup = {
    ...(window.ChatraSetup ?? {}),
    clientId: identity.clientId,
  };
  const data = integrationData(identity);
  window.ChatraIntegration = { ...(window.ChatraIntegration ?? {}), ...data };
  if (typeof window.Chatra === "function") {
    window.Chatra("updateIntegrationData", data);
  }
}

export default function ChatraWidget({
  identity,
}: {
  identity?: ChatraIdentity | null;
}) {
  useEffect(() => {
    window.ChatraID = CHATRA_ID;

    if (identity) {
      applyChatraIdentity(identity);
    }

    window.Chatra =
      window.Chatra ||
      function (...args: unknown[]) {
        (window.Chatra.q = window.Chatra.q || []).push(args);
      };

    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${CHATRA_SCRIPT_SRC}"]`,
    );
    const createdScript = !script;
    if (!script) {
      script = document.createElement("script");
      script.async = true;
      script.src = CHATRA_SCRIPT_SRC;
      document.head.appendChild(script);
    }

    if (!identity) {
      return () => {
        if (createdScript && script?.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    }

    const syncIdentity = () => applyChatraIdentity(identity);
    script.addEventListener("load", syncIdentity);
    const retries = [300, 1000, 2500].map((ms) => window.setTimeout(syncIdentity, ms));

    return () => {
      script?.removeEventListener("load", syncIdentity);
      retries.forEach((id) => window.clearTimeout(id));
      if (createdScript && script?.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [identity?.clientId, identity?.shopDomain, identity?.storeName]);

  return null;
}
