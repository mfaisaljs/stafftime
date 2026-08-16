import type { HTMLAttributes, ReactNode } from "react";
import { appPageHeading } from "../utils/app-title";

export function AppPage({
  heading,
  inlineSize,
  children,
  ...props
}: {
  heading?: string;
  inlineSize?: "small" | "base" | "large";
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <s-page
      {...props}
      heading={heading ? appPageHeading(heading) : undefined}
      inlineSize={inlineSize}
    >
      {children}
    </s-page>
  );
}
