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

    async function loadStatus() {
      try {
        const stored = parseStoredClockState(
          await shopify.storage.get(CLOCK_STATE_STORAGE_KEY),
        );
        if (!cancelled) setStatus(stored?.status ?? null);
      } catch {
        // Ignore storage errors; keep default subheading.
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
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
