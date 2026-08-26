const SHOP_INFO_QUERY = `#graphql
  query StaffTimeShopInfo {
    shop {
      name
      myshopifyDomain
    }
  }
`;

export async function getShopInfo(admin: {
  graphql: (query: string) => Promise<Response>;
}) {
  try {
    const response = await admin.graphql(SHOP_INFO_QUERY);
    const payload = (await response.json()) as {
      data?: { shop?: { name?: string; myshopifyDomain?: string } };
    };
    const shop = payload.data?.shop;
    if (!shop?.myshopifyDomain) {
      return null;
    }
    return {
      name: shop.name?.trim() || shop.myshopifyDomain,
      domain: shop.myshopifyDomain,
    };
  } catch (error) {
    console.error("Failed to fetch shop info:", error);
    return null;
  }
}
