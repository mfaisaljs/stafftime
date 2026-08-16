export const APP_DISPLAY_NAME = "Trubuild: Staff Management";

export function appPageHeading(routeName: string) {
  const name = routeName.trim();
  if (!name) {
    return APP_DISPLAY_NAME;
  }
  if (name === APP_DISPLAY_NAME || name.startsWith(`${APP_DISPLAY_NAME} - `)) {
    return name;
  }
  return `${APP_DISPLAY_NAME} - ${name}`;
}
