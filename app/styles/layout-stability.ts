import { APP_PAGE_STYLES } from "../components/app-page-styles";

/**
 * Critical layout CSS in <head> so above-the-fold chrome has dimensions
 * before streaming body CSS and before Polaris web components upgrade.
 *
 * Built for Shopify requires CLS <= 0.1. Common iframe shifts:
 * - s-app-nav rendering 12 links in-page until App Bridge hoists it
 * - s-page starting as an undefined inline element
 * - AppPage header styles arriving after the heading paints
 * - Setup guide collapsing/hiding after localStorage hydrates
 */
export const LAYOUT_STABILITY_CSS = `
  ${APP_PAGE_STYLES}

  s-app-nav:not(:defined) {
    display: none !important;
  }

  s-page:not(:defined) {
    display: block;
  }

  html[data-setup-guide="hidden"] .setup-guide {
    display: none !important;
  }

  html[data-setup-guide="collapsed"] .setup-guide-body {
    display: none !important;
  }
`;
