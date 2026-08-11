const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "back"],
] as const;

type PinKeypadProps = {
  pin: string;
  maxLength?: number;
  disabled?: boolean;
  error?: string | null;
  onChange: (pin: string) => void;
};

export function PinKeypad({
  pin,
  maxLength = 4,
  disabled = false,
  error = null,
  onChange,
}: PinKeypadProps) {
  function press(key: string) {
    if (disabled) return;
    if (key === "back") {
      onChange(pin.slice(0, -1));
      return;
    }
    if (!key || pin.length >= maxLength) return;
    onChange(`${pin}${key}`);
  }

  return (
    <s-stack direction="block" gap="base" alignItems="center">
      <s-stack direction="inline" gap="small" justifyContent="center">
        {Array.from({ length: maxLength }, (_, index) => (
          <s-text key={index}>{index < pin.length ? "●" : "○"}</s-text>
        ))}
      </s-stack>
      {error ? <s-banner heading={error} tone="critical" /> : null}
      <s-stack direction="block" gap="small">
        {KEYS.map((row) => (
          <s-stack key={row.join("-")} direction="inline" gap="small" justifyContent="center">
            {row.map((key) => {
              if (!key) {
                return <s-box key="spacer" inlineSize="64px" blockSize="48px" />;
              }
              return (
                <s-button
                  key={key}
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => press(key)}
                >
                  {key === "back" ? "⌫" : key}
                </s-button>
              );
            })}
          </s-stack>
        ))}
      </s-stack>
    </s-stack>
  );
}
