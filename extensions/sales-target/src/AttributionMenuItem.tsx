import { render } from "preact";
import { useCallback, useRef } from "preact/hooks";
import { promptPinThenPresentModal } from "./posApi";

export default async function extension() {
  render(<SalesTargetAttributionMenuItem />, document.body);
}

function SalesTargetAttributionMenuItem() {
  const pinPadOpenRef = useRef(false);

  const handleAttribute = useCallback(() => {
    void promptPinThenPresentModal(pinPadOpenRef);
  }, []);

  return (
    <s-button onClick={handleAttribute}>Attribute to Sales Target</s-button>
  );
}
