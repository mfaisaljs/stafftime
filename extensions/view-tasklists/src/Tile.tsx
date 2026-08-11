import { render } from "preact";
import { useCallback, useRef } from "preact/hooks";
import {
  messageFromError,
  persistTaskSession,
  showToast,
  verifyPin,
} from "./posApi";
import { ACTIVE_SESSION_STORAGE_KEY } from "./session";

export default async function extension() {
  render(<TaskListTile />, document.body);
}

function TaskListTile() {
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
            await persistTaskSession(data);
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
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // Still prompt for PIN.
    }
    showPinPadThenModal();
  }, [showPinPadThenModal]);

  return (
    <s-tile
      heading="Task List"
      subheading="All, daily, weekly & monthly"
      onClick={() => {
        void handleTileClick();
      }}
    />
  );
}
