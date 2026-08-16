import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

function ensureAuthSearchParams(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    return;
  }

  const reload = url.searchParams.get("shopify-reload");
  if (!reload) {
    return;
  }

  let reloadUrl: URL;
  try {
    reloadUrl = new URL(reload, url.origin);
  } catch {
    return;
  }

  const shop = reloadUrl.searchParams.get("shop");
  if (!shop) {
    return;
  }

  url.searchParams.set("shop", shop);

  const host = reloadUrl.searchParams.get("host");
  if (host && !url.searchParams.get("host")) {
    url.searchParams.set("host", host);
  }

  const embedded = reloadUrl.searchParams.get("embedded");
  if (embedded && !url.searchParams.get("embedded")) {
    url.searchParams.set("embedded", embedded);
  }

  throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  ensureAuthSearchParams(request);
  await authenticate.admin(request);

  return null;
};

export default function AuthRoute() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var params = new URLSearchParams(window.location.search);
              var reload = params.get("shopify-reload");
              if (reload) {
                window.location.replace(reload);
              }
            })();
          `,
        }}
      />
      <p>Returning to StaffTime…</p>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
