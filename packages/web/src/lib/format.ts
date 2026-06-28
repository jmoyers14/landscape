const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const formatCurrency = (value: number): string => usd.format(value);

// Resolved quantities come out of the formula engine as raw floats
// (e.g. 3.7375000000000003). Round for display so line items read cleanly;
// up to two decimals, trailing zeros trimmed.
const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export const formatQuantity = (value: number): string => qty.format(value);
