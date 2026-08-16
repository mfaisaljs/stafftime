import { useEffect, useState } from "react";

export function ClockPhoto(props: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!props.src) {
      setUrl(null);
      setFailed(false);
      return;
    }

    let objectUrl = "";
    let cancelled = false;
    setFailed(false);
    setUrl(null);

    void fetch(props.src, { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("missing");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [props.src]);

  if (!props.src || failed) {
    return <div className="photo-empty">No photo</div>;
  }
  if (!url) {
    return <div className="photo-empty">Loading…</div>;
  }
  return <img className={props.className} src={url} alt={props.alt} />;
}
