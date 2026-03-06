/**
 * Mapping between internal product names and Stripe price/product IDs.
 * Used to build Stripe Checkout line items from selected contract products.
 */

export interface StripePriceMapping {
  price_id: string;
  product_id: string;
  recurring: boolean;
  label: string;
}

export const STRIPE_PRODUCT_MAP: Record<string, StripePriceMapping> = {
  "HFX EBM": {
    price_id: "price_1T7z1h6v0qHdbOip4A7qocQC",
    product_id: "prod_U6BONYT5L2tmxy",
    recurring: true,
    label: "HFX EBM – 179 €/Monat",
  },
  "HFX GOÄ - die KI für ihre Privatabrechnung": {
    price_id: "price_1T7z2Z6v0qHdbOipvyPDB9mB",
    product_id: "prod_U6BPWYJ9ohE9L3",
    recurring: true,
    label: "HFX GOÄ – 49 €/Monat",
  },
  "HFX GOÄ/GOZ Live-Check": {
    price_id: "price_1T7z3X6v0qHdbOiplCCLqD2n",
    product_id: "prod_U6BQaQg3TGblld",
    recurring: false,
    label: "HFX GOÄ/GOZ Live-Check – 649 € (einmalig)",
  },
};

/**
 * Given an array of selected product names, returns the Stripe line items
 * for products that have a Stripe mapping.
 */
export function buildStripeLineItems(selectedProducts: string[]) {
  return selectedProducts
    .filter((name) => STRIPE_PRODUCT_MAP[name])
    .map((name) => {
      const mapping = STRIPE_PRODUCT_MAP[name];
      return {
        price_id: mapping.price_id,
        quantity: 1,
        recurring: mapping.recurring,
      };
    });
}

/**
 * Check if any of the selected products have a Stripe price mapping.
 */
export function hasStripeProducts(selectedProducts: string[]): boolean {
  return selectedProducts.some((name) => STRIPE_PRODUCT_MAP[name]);
}
