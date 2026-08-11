import { render } from "preact";

export default async function extension() {
  render(<CommissionAttributionBlock />, document.body);
}

function CommissionAttributionBlock() {
  const orderName =
    typeof shopify.order?.name === "string" ? shopify.order.name : "this order";

  return (
    <s-box padding="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">Commission</s-text>
        <s-text>
          Attribute {orderName} using your commission program product rules.
        </s-text>
        <s-button
          variant="primary"
          onClick={() => {
            shopify.action.presentModal();
          }}
        >
          Attribute commission
        </s-button>
      </s-stack>
    </s-box>
  );
}
