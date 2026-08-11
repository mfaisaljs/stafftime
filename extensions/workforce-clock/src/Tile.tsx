import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  CLOCK_STATE_STORAGE_KEY,
  parseStoredClockState,
  subheadingForStatus,
  type ClockStatus,
} from "./clockStatus";

export default async function extension() {
  render(<WorkforceTile />, document.body);
}

function WorkforceTile() {
  const [status, setStatus] = useState<ClockStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshFromStorage() {
      try {
        const stored = parseStoredClockState(
          await shopify.storage.get(CLOCK_STATE_STORAGE_KEY),
        );
        if (!cancelled) {
          setStatus(stored?.status ?? null);
        }
      } catch {
        // Keep the last known subheading if storage is unavailable.
      }
    }

    void refreshFromStorage();
    const timer = setInterval(() => {
      void refreshFromStorage();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <s-tile
      heading="Clock In / Out"
      subheading={subheadingForStatus(status)}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
