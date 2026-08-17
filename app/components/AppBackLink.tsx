import { ArrowLeft } from "lucide-react";
import { AppLink } from "./AppLink";

export function AppBackLink({
  to,
  label = "Back",
}: {
  to: string;
  label?: string;
}) {
  return (
    <AppLink className="app-back-link" to={to} aria-label={label}>
      <ArrowLeft aria-hidden="true" size={18} />
      <span>{label}</span>
      <style>{`
        .app-back-link {
          align-items: center;
          color: #303030;
          display: inline-flex;
          font-size: 13px;
          gap: 6px;
          margin-bottom: 12px;
          text-decoration: none;
        }

        .app-back-link:hover {
          color: #000;
        }
      `}</style>
    </AppLink>
  );
}
