import { render } from "preact";
import { useCallback, useRef } from "preact/hooks";
import {
  messageFromError,
  persistTimeOffSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredTimeOffSession,
} from "./session";

export default async function extension() {
  render(<TimeOffTile />, document.body);
}

function TimeOffTile() {
  const pinPadOpenRef = useRef(false);

  const openModal = useCallback(() => {
    shopify.action.presentModal();
  }, []);

  const showPinPadThenModal = useCallback(() => {
    if (pinPadOpenRef.current) return;

    if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
      openModal();
      return;
    }

    pinPadOpenRef.current = true;

    try {
      shopify.pinPad.showPinPad(
        async (pinDigits) => {
          const pin = pinDigits.join("");
          try {
            const data = await verifyPin(pin);
            await persistTimeOffSession(data);
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
              openModal();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
      openModal();
    }
  }, [openModal]);

  const handleTileClick = useCallback(async () => {
    try {
      const existing = parseStoredTimeOffSession(
        await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
      );
      if (existing) {
        openModal();
        return;
      }
    } catch {
      // Fall through to PIN pad.
    }
    showPinPadThenModal();
  }, [openModal, showPinPadThenModal]);

  return (
    <s-tile
      heading="Time Off"
      subheading="Request & approvals"
      onClick={() => {
        void handleTileClick();
      }}
    />
  );
}
