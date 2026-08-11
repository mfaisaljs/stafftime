import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/AttributionBlock.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/AttributionMenuItem.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.order-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.menu-item.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/AttributionModal.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/posApi.ts' {
  const shopify:
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/session.ts' {
  const shopify:
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/appUrl.ts' {
  const shopify:
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
