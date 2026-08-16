import { useEffect, useRef, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinPad(props: {
  title?: string;
  subtitle?: string;
  error?: string | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");

  const submitted = useRef(false);

  useEffect(() => {
    if (pin.length === 4 && !props.busy && !submitted.current) {
      submitted.current = true;
      props.onSubmit(pin);
    }
    if (pin.length < 4) submitted.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, props.busy]);

  useEffect(() => {
    if (props.error) setPin("");
  }, [props.error]);

  function press(value: string) {
    if (props.busy) return;
    if (value === "del") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (!value || !/^\d$/.test(value)) return;
    setPin((current) => (current.length >= 4 ? current : `${current}${value}`));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Escape") {
        event.preventDefault();
        props.onCancel();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        press("del");
        return;
      }

      const digit =
        /^\d$/.test(event.key)
          ? event.key
          : /^Numpad\d$/.test(event.code)
            ? event.code.slice(-1)
            : "";
      if (!digit) return;
      event.preventDefault();
      press(digit);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.busy, props.onCancel]);

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true" aria-label="Enter PIN">
      <div className="pin-card">
        <h2>{props.title || "Enter PIN"}</h2>
        <p className="portal-muted">
          {props.subtitle || "Enter your 4-digit staff PIN to continue."}
        </p>
        <div className="pin-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`pin-dot${pin.length > index ? " filled" : ""}`}
            />
          ))}
        </div>
        {props.error ? <p className="portal-flash error">{props.error}</p> : null}
        <div className="pin-pad">
          {KEYS.map((key, index) => (
            <button
              key={`${key}-${index}`}
              type="button"
              className={key === "del" || !key ? "ghost" : undefined}
              disabled={props.busy || !key}
              onClick={() => press(key === "del" ? "del" : key)}
            >
              {key === "del" ? "⌫" : key}
            </button>
          ))}
        </div>
        <div className="portal-actions" style={{ marginTop: 14, marginBottom: 0 }}>
          <button type="button" className="portal-btn secondary" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
