import { ramiLevyFetch, type Credentials } from "./client.js";
import { SearchResponseSchema, toSimpleProduct, type SimpleProduct } from "../types.js";

const CATALOG_URL = "https://www.rami-levy.co.il/api/catalog";

export async function searchProducts(
  query: string,
  creds: Credentials,
  store?: string,
): Promise<{ products: SimpleProduct[]; total: number }> {
  const response = await ramiLevyFetch(CATALOG_URL, creds, {
    method: "POST",
    body: {
      q: query,
      aggs: 1,
      store: store || creds.store,
    },
  });

  const parsed = SearchResponseSchema.parse(response);
  return {
    products: parsed.data.map(toSimpleProduct),
    total: parsed.total,
  };
}
