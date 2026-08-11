import { render } from "preact";
import { useCallback, useRef } from "preact/hooks";
import { promptPinThenPresentModal } from "./posApi";

export default async function extension() {
  render(<CommissionAttributionMenuItem />, document.body);
}

function CommissionAttributionMenuItem() {
  const pinPadOpenRef = useRef(false);

  const handleAttribute = useCallback(() => {
    void promptPinThenPresentModal(pinPadOpenRef);
  }, []);

  return <s-button onClick={handleAttribute}>Attribute Commission</s-button>;
}
