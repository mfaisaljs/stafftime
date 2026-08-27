import type { HTMLAttributes, ReactNode } from "react";
import { useLocation } from "react-router";
import { AppLink } from "./AppLink";
import { APP_DISPLAY_NAME } from "../utils/app-title";
import { resolveAppBackPath } from "../utils/app-back-path";

const APP_PAGE_STYLES = `
  .app-page-subheader {
    align-items: center;
    background: #303030;
    border: 1px solid #303030;
    border-radius: 12px;
    color: #ffffff;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    min-height: 4rem;
    padding: 0 1.25rem;
  }

  .app-page-subheader__back {
    color: #ffffff;
    display: inline-flex;
    flex-shrink: 0;
    font-size: 0.8125rem;
    font-weight: 550;
    margin-left: auto;
    text-decoration: none;
  }

  .app-page-subheader__back:hover {
    color: #ffffff;
    opacity: 0.85;
    text-decoration: underline;
  }

  .app-page-subheader__heading {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .app-page-subheader__title {
    color: #ffffff;
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    line-height: 1.3;
    margin: 0;
    min-width: 0;
    text-transform: uppercase;
  }

  .app-page-subheader__subtitle {
    color: #b5b5b5;
    font-size: 0.8125rem;
    font-weight: 450;
    line-height: 1.3;
    margin: 0;
  }
`;

export function AppPage({
  heading,
  subtitle,
  inlineSize,
  backTo,
  backLabel = "Back",
  showBack,
  children,
  ...props
}: {
  heading?: string;
  subtitle?: string;
  inlineSize?: "small" | "base" | "large";
  backTo?: string;
  backLabel?: string;
  showBack?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const location = useLocation();
  const resolvedBack =
    showBack === false ? null : (backTo ?? resolveAppBackPath(location.pathname));

  return (
    <s-page {...props} heading={APP_DISPLAY_NAME} inlineSize={inlineSize}>
      {heading ? (
        <div className="app-page-subheader">
          <div className="app-page-subheader__heading">
            <h2 className="app-page-subheader__title">{heading.toUpperCase()}</h2>
            {subtitle ? (
              <p className="app-page-subheader__subtitle">{subtitle}</p>
            ) : null}
          </div>
          {resolvedBack ? (
            <AppLink to={resolvedBack} className="app-page-subheader__back">
              ← {backLabel}
            </AppLink>
          ) : null}
        </div>
      ) : null}
      {children}
      <style>{APP_PAGE_STYLES}</style>
    </s-page>
  );
}
