import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  CLOCK_STATE_STORAGE_KEY,
  parseStoredClockState,
  subheadingForStatus,
  type ClockStatus,
} from "./clockStatus";
import {
  messageFromError,
  persistVerifySession,
  showToast,
  verifyPin,
} from "./posApi";

export default async function extension() {
  render(<WorkforceTile />, document.body);
}

function WorkforceTile() {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const pinPadOpenRef = useRef(false);

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

  const openClockModal = useCallback(() => {
    void refreshFromStorage();
    shopify.action.presentModal();
  }, [refreshFromStorage]);

  const showPinPadThenModal = useCallback(() => {
    if (pinPadOpenRef.current) return;

    if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
      // Fallback: open modal so staff can still authenticate there.
      openClockModal();
      return;
    }

    pinPadOpenRef.current = true;

    try {
      shopify.pinPad.showPinPad(
        async (pinDigits) => {
          const pin = pinDigits.join("");
          try {
            const data = await verifyPin(pin);
            await persistVerifySession(data);
            setStatus(data.status.status);
            showToast(`Welcome, ${data.employee.firstName}`);
            return { result: "accept" as const };
          } catch (err) {
            return {
              result: "reject" as const,
              errorMessage: messageFromError(err, "Invalid PIN"),
            };
          }
        },
        {
          title: "Enter PIN",
          label: "Enter your PIN",
          masked: true,
          minPinLength: 4,
          maxPinLength: 4,
          autoSubmit: true,
          onDismissed: (result) => {
            pinPadOpenRef.current = false;
            if (result.completed) {
              openClockModal();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
      openClockModal();
    }
  }, [openClockModal]);

  const handleTileClick = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // Still prompt for PIN.
    }
    showPinPadThenModal();
  }, [showPinPadThenModal]);

  return (
    <s-tile
      heading="Clock In / Out"
      subheading={subheadingForStatus(status)}
      onClick={() => {
        void handleTileClick();
      }}
    />
  );
}
