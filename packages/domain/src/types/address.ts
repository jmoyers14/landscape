/**
 * Vendor-neutral address shapes the app speaks regardless of which maps
 * provider sits behind the port. Part of the domain model because they cross
 * the API boundary (the address typeahead returns them to the web client).
 */

/** A single typeahead suggestion for a partially-typed address. */
export interface AddressSuggestion {
  /** Provider place id — pass back to resolve the full address. */
  placeId: string;
  /** Full single-line label for the suggestion. */
  description: string;
  /** Bolded main line (e.g. street address), when the provider splits it out. */
  primary?: string;
  /** Secondary line (e.g. city/state), when the provider splits it out. */
  secondary?: string;
}

/** A validated, canonical address resolved from a place id. */
export interface ResolvedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}
