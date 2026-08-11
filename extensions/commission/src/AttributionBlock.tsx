import { render } from "preact";
import { useCallback, useRef } from "preact/hooks";
import { promptPinThenPresentModal } from "./posApi";

export default async function extension() {
  render(<CommissionAttributionBlock />, document.body);
}

function CommissionAttributionBlock() {
  const pinPadOpenRef = useRef(false);
  const orderName =
    typeof shopify.order?.name === "string" ? shopify.order.name : "this order";

  const handleAttribute = useCallback(() => {
    void promptPinThenPresentModal(pinPadOpenRef);
  }, []);

  return (
    <s-box padding="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">Commission</s-text>
        <s-text>
          Attribute {orderName} using your commission program product rules.
        </s-text>
        <s-button variant="primary" onClick={handleAttribute}>
          Attribute commission
        </s-button>
      </s-stack>
    </s-box>
  );
}
