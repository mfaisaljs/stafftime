import { render } from "preact";

export default async function extension() {
  render(<SalesTargetAttributionBlock />, document.body);
} 

function SalesTargetAttributionBlock() {
  const orderName =
    typeof shopify.order?.name === "string" ? shopify.order.name : "this order";

  return (
    <s-box padding="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">Sales Target</s-text>
        <s-text>Attribute {orderName} to a staff monthly target.</s-text>
        <s-button
          variant="primary"
          onClick={() => {
            shopify.action.presentModal();
          }}
        >
          Attribute sale
        </s-button>
      </s-stack>
    </s-box>
  );
}
