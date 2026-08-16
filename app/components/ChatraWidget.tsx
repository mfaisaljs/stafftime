import { useEffect } from "react";

declare global {
  interface Window {
    ChatraID: string;
    Chatra: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

export default function ChatraWidget() {
  useEffect(() => {
    window.ChatraID = "otFcs4SwiWA2FJ6gq";

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://call.chatra.io/chatra.js";

    window.Chatra =
      window.Chatra ||
      function () {
        (window.Chatra.q = window.Chatra.q || []).push(arguments);
      };

    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return null;
}
