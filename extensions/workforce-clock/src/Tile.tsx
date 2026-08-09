import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async function extension() {
  render(<WorkforceTile />, document.body);
}

function WorkforceTile() {
  const [badge, setBadge] = useState<string | undefined>(undefined);

  useEffect(() => {
    void loadBadge();
  }, []);

  async function loadBadge() {
    try {
      const token = await shopify.session.getSessionToken();
      const response = await fetch("/api/pos/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data.workingCount === "number" && data.workingCount > 0) {
        setBadge(String(data.workingCount));
      }
    } catch {
      // Offline or unauthenticated — tile still works
    }
  }

  return (
    <s-tile
      heading="StaffTime"
      subheading="Clock in / out"
      badge={badge}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
