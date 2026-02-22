import { z } from "zod";

// --- Search types ---

export const SearchProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.object({
    price: z.number(),
  }),
  images: z.object({
    small: z.string().optional(),
  }).optional(),
  brand: z.number().optional(),
  department: z.object({
    name: z.string(),
    id: z.number(),
  }).optional(),
  group: z.object({
    name: z.string(),
    id: z.number(),
  }).optional(),
  gs: z.object({
    BrandName: z.string().optional(),
    short_name: z.string().optional(),
    Net_Content: z.object({
      text: z.string(),
    }).optional(),
  }).optional(),
});

export const SearchResponseSchema = z.object({
  data: z.array(z.any()),
  total: z.number(),
  status: z.number(),
});

// --- Cart types ---

export const CartItemInputSchema = z.object({
  id: z.number().describe("Product ID"),
  quantity: z.number().min(1).describe("Quantity"),
});

export const CartResponseItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  quantity: z.number(),
  FormatedTotalPrice: z.number(),
  FormatedSavePrice: z.number(),
  has_coupon: z.boolean(),
  is_delivery: z.boolean(),
  isClub: z.boolean(),
});

export const CartResponseSchema = z.object({
  items: z.array(CartResponseItemSchema),
  price: z.number(),
  priceClub: z.number(),
  discount: z.number(),
  quantity: z.number(),
  status: z.number(),
});

// --- Derived types ---

export type SearchProduct = z.infer<typeof SearchProductSchema>;
export type CartItemInput = z.infer<typeof CartItemInputSchema>;
export type CartResponse = z.infer<typeof CartResponseSchema>;
export type CartResponseItem = z.infer<typeof CartResponseItemSchema>;

// --- Simplified product for LLM display ---

export interface SimpleProduct {
  id: number;
  name: string;
  price: number;
  brand: string;
  size: string;
  image_url: string;
}

export function toSimpleProduct(raw: any): SimpleProduct {
  return {
    id: raw.id,
    name: raw.name,
    price: raw.price?.price ?? 0,
    brand: raw.gs?.BrandName ?? "",
    size: raw.gs?.Net_Content?.text ?? "",
    image_url: raw.images?.small
      ? `https://www.rami-levy.co.il${raw.images.small}`
      : "",
  };
}
