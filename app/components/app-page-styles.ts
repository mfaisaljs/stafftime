export const APP_PAGE_STYLES = `
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
