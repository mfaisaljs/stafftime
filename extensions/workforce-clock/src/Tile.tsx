import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
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

  const refreshFromStorage = useCallback(async () => {
    try {
      if (!shopify.storage?.get) return;
      const stored = parseStoredClockState(
        await shopify.storage.get(CLOCK_STATE_STORAGE_KEY),
      );
      setStatus(stored?.status ?? null);
    } catch {
      // Keep last known subheading if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    void refreshFromStorage();
  }, [refreshFromStorage]);

  return (
    <s-tile
      heading="Clock In / Out"
      subheading={subheadingForStatus(status)}
      onClick={() => {
        void refreshFromStorage();
        shopify.action.presentModal();
      }}
    />
  );
}
