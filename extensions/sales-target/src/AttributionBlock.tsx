import { render } from "preact";
import { useCallback, useRef } from "preact/hooks";
import { promptPinThenPresentModal } from "./posApi";

export default async function extension() {
  render(<SalesTargetAttributionBlock />, document.body);
}

function SalesTargetAttributionBlock() {
  const pinPadOpenRef = useRef(false);
  const orderName =
    typeof shopify.order?.name === "string" ? shopify.order.name : "this order";

  const handleAttribute = useCallback(() => {
    void promptPinThenPresentModal(pinPadOpenRef);
  }, []);

  return (
    <s-box padding="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">Sales Target</s-text>
        <s-text>Attribute {orderName} to a staff monthly target.</s-text>
        <s-button variant="primary" onClick={handleAttribute}>
          Attribute sale
        </s-button>
      </s-stack>
    </s-box>
  );
}
