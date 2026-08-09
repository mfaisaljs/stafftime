import { render } from "preact";

export default async function extension() {
  render(<WorkforceTile />, document.body);
}

function WorkforceTile() {
  return (
    <s-tile
      heading="StaffTime"
      subheading="Clock in / out"
      onClick={() => shopify.action.presentModal()}
    />
  );
}
