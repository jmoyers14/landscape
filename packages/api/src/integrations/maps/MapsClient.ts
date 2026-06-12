/**
 * A rendered map image plus its MIME type. SDK-free — the shape the rest of the
 * app speaks regardless of which maps provider sits behind the port.
 */
export interface MapImage {
  data: Uint8Array;
  contentType: string;
}

export interface SatelliteImageOptions {
  /** Output width in pixels. Default 640. */
  width?: number;
  /** Output height in pixels. Default 400. */
  height?: number;
  /** Zoom level; higher is closer. Default 19 (tight on a residential lot). */
  zoom?: number;
}

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

/**
 * Port for a maps provider. Named by capability (what the app needs), not by
 * vendor — the Google adapter implements it. `satelliteImage` returns an aerial
 * view of a property from its address, or null when the provider can't locate
 * the address. Throws on transport/credential failures so misconfiguration
 * surfaces instead of silently looking like "no imagery".
 */
export interface MapsClient {
  satelliteImage(
    address: string,
    options?: SatelliteImageOptions,
  ): Promise<MapImage | null>;

  /**
   * Typeahead address suggestions for a partial query. `sessionToken` groups a
   * burst of keystrokes plus the final resolve into one billing session.
   */
  autocompleteAddress(
    input: string,
    sessionToken?: string,
  ): Promise<AddressSuggestion[]>;

  /** Resolve a place id into a canonical address, or null if it can't be found. */
  resolveAddress(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddress | null>;
}
