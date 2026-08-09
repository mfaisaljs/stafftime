declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "s-link": React.DetailedHTMLProps<
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string },
      HTMLAnchorElement
    >;
    "s-page": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { heading?: string },
      HTMLElement
    >;
    "s-section": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        heading?: string;
        slot?: string;
      },
      HTMLElement
    >;
    "s-stack": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        direction?: "inline" | "block";
        gap?: string;
      },
      HTMLElement
    >;
    "s-box": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        padding?: string;
        background?: string;
        borderWidth?: string;
        borderRadius?: string;
      },
      HTMLElement
    >;
    "s-text": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "s-paragraph": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "s-badge": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { tone?: string },
      HTMLElement
    >;
    "s-button": React.DetailedHTMLProps<
      React.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?: string;
        loading?: boolean;
        slot?: string;
      },
      HTMLButtonElement
    >;
    "s-heading": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}
