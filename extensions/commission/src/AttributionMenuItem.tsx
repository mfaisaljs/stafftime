import { render } from "preact";

export default async function extension() {
  render(<CommissionAttributionMenuItem />, document.body);
}

function CommissionAttributionMenuItem() {
  return (
    <s-button
      onClick={() => {
        shopify.action.presentModal();
      }}
    >
      Attribute Commission
    </s-button>
  );
}
