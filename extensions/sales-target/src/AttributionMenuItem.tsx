import { render } from "preact";

export default async function extension() {
  render(<SalesTargetAttributionMenuItem />, document.body);
}

function SalesTargetAttributionMenuItem() {
  return (
    <s-button
      onClick={() => {
        shopify.action.presentModal();
      }}
    >
      Attribute to Sales Target
    </s-button>
  );
}
