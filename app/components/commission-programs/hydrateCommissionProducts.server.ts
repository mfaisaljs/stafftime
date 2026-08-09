import type { SelectedProduct } from "./CommissionProgramForm";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductNode = {
  id?: string;
  title?: string;
  featuredImage?: { url?: string } | null;
  variants?: {
    nodes?: Array<{ id?: string; price?: string | null }>;
  } | null;
};

const PRODUCTS_BY_IDS = `#graphql
  query CommissionProgramProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url
        }
        variants(first: 100) {
          nodes {
            id
            price
          }
        }
      }
    }
  }
`;

function fallbackProducts(
  productCommissions: Array<{ productId: string; commission: string }>,
): SelectedProduct[] {
  return productCommissions.map(({ productId, commission }) => ({
    id: productId,
    title: "Product",
    imageUrl: "",
    price: "$0.00",
    variantCount: 1,
    commission,
  }));
}

export async function hydrateCommissionProducts(
  admin: AdminGraphqlClient,
  productCommissions: Array<{ productId: string; commission: string }>,
): Promise<SelectedProduct[]> {
  if (productCommissions.length === 0) return [];

  const ids = productCommissions.map((item) => item.productId);
  const commissionById = new Map(
    productCommissions.map((item) => [item.productId, item.commission]),
  );

  try {
    const response = await admin.graphql(PRODUCTS_BY_IDS, { variables: { ids } });
    const payload = (await response.json()) as {
      data?: { nodes?: Array<ProductNode | null> };
      errors?: Array<{ message?: string }>;
    };

    if (payload.errors?.length) {
      console.warn(
        "[hydrateCommissionProducts]",
        payload.errors.map((error) => error.message).join("; "),
      );
      return fallbackProducts(productCommissions);
    }

    const nodes = payload.data?.nodes ?? [];
    const productsById = new Map<string, ProductNode>();
    for (const node of nodes) {
      if (node?.id) productsById.set(node.id, node);
    }

    return productCommissions.map(({ productId, commission }) => {
      const product = productsById.get(productId);
      const variants = product?.variants?.nodes ?? [];
      const firstPrice = variants[0]?.price;
      const price =
        firstPrice === undefined || firstPrice === null || firstPrice === ""
          ? "$0.00"
          : `$${Number(firstPrice).toFixed(2)}`;

      return {
        id: productId,
        title: product?.title ?? "Unavailable product",
        imageUrl: product?.featuredImage?.url ?? "",
        price,
        variantCount: variants.length || 1,
        commission: commissionById.get(productId) ?? commission,
      };
    });
  } catch (error) {
    console.warn("[hydrateCommissionProducts]", error);
    return fallbackProducts(productCommissions);
  }
}

export function parseProductCommissionsJson(
  raw: string,
): Array<{ productId: string; commission: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { productId?: unknown; commission?: unknown };
        if (typeof record.productId !== "string") return null;
        return {
          productId: record.productId,
          commission:
            typeof record.commission === "string" ? record.commission : "",
        };
      })
      .filter((item): item is { productId: string; commission: string } =>
        Boolean(item),
      );
  } catch {
    return [];
  }
}

export function parseEmployeeIdsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}
