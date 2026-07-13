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

// AddressSuggestion and ResolvedAddress cross the API boundary (the address
// typeahead returns them to the web client), so they live in the domain model.
// Re-exported so the port and its Google adapter keep importing them locally.
export type { AddressSuggestion, ResolvedAddress } from "@landscape/domain";
import type { AddressSuggestion, ResolvedAddress } from "@landscape/domain";

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
