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
      React.HTMLAttributes<HTMLElement> & {
        heading?: string;
        inlineSize?: "small" | "base" | "large";
      },
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
        tone?: string;
        loading?: boolean;
        slot?: string;
        commandFor?: string;
        command?: string;
      },
      HTMLButtonElement
    >;
    "s-modal": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        id?: string;
        heading?: string;
        size?: string;
      },
      HTMLElement
    >;
    "s-banner": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        heading?: string;
        tone?: string;
        dismissible?: boolean;
      },
      HTMLElement
    >;
    "s-icon": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        type?: string;
        interestFor?: string;
      },
      HTMLElement
    >;
    "s-tooltip": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { id?: string },
      HTMLElement
    >;
    "s-date-picker": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        type?: "single" | "range";
        value?: string;
        view?: string;
        defaultView?: string;
        name?: string;
        onInput?: (event: { currentTarget: unknown }) => void;
        onChange?: (event: { currentTarget: unknown }) => void;
      },
      HTMLElement
    >;
    "s-heading": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}
