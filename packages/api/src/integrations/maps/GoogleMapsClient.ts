import { inject, injectable } from "tsyringe";
import { CONFIG_SERVICE_TOKEN } from "../../services/tokens.ts";
import type { ConfigService } from "../../services/ConfigService/ConfigService.ts";
import type {
  AddressSuggestion,
  MapImage,
  MapsClient,
  ResolvedAddress,
  SatelliteImageOptions,
} from "./MapsClient.ts";

const STATIC_MAPS_URL = "https://maps.googleapis.com/maps/api/staticmap";
const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";

// Shape of the slices of the Places (New) responses we actually read.
interface AutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
}

interface PlaceDetailsResponse {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

/**
 * Google adapter for the MapsClient port. The only file that knows about
 * Google's Static Maps API or holds the Maps key — everything Google-specific
 * (endpoint, query params, error shape) is contained here so the rest of the
 * app stays provider-agnostic.
 */
@injectable()
export class GoogleMapsClient implements MapsClient {
  constructor(
    @inject(CONFIG_SERVICE_TOKEN)
    private readonly config: ConfigService,
  ) {}

  async satelliteImage(
    address: string,
    options: SatelliteImageOptions = {},
  ): Promise<MapImage | null> {
    const apiKey = this.config.getMaps().apiKey;
    if (!apiKey) {
      throw new Error("Google Maps API key is not configured");
    }

    const { width = 640, height = 400, zoom = 19 } = options;
    const params = new URLSearchParams({
      center: address,
      zoom: String(zoom),
      size: `${width}x${height}`,
      maptype: "satellite",
      scale: "2", // crisper on retina displays
      key: apiKey,
    });

    const res = await fetch(`${STATIC_MAPS_URL}?${params.toString()}`);
    const contentType = res.headers.get("content-type") ?? "";

    if (res.ok && contentType.startsWith("image/")) {
      return { data: new Uint8Array(await res.arrayBuffer()), contentType };
    }

    // A 400/404 here means Google accepted the request but couldn't geocode the
    // address into imagery — that's "no image", not a failure on our side.
    if (res.status === 400 || res.status === 404) {
      return null;
    }

    // 403 (bad/over-quota key) and everything else is a real error worth seeing.
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google Static Maps request failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  async autocompleteAddress(
    input: string,
    sessionToken?: string,
  ): Promise<AddressSuggestion[]> {
    const apiKey = this.requireKey();

    const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Google Places autocomplete failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as AutocompleteResponse;
    return (json.suggestions ?? []).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction?.placeId) {
        return [];
      }
      return [
        {
          placeId: prediction.placeId,
          description: prediction.text?.text ?? "",
          primary: prediction.structuredFormat?.mainText?.text,
          secondary: prediction.structuredFormat?.secondaryText?.text,
        },
      ];
    });
  }

  async resolveAddress(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddress | null> {
    const apiKey = this.requireKey();

    const url = new URL(`${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`);
    if (sessionToken) {
      url.searchParams.set("sessionToken", sessionToken);
    }

    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Field mask keeps the response (and the billing SKU) to what we need.
        "X-Goog-FieldMask": "formattedAddress,location",
      },
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Google Place details failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as PlaceDetailsResponse;
    if (
      !json.formattedAddress ||
      json.location?.latitude == null ||
      json.location?.longitude == null
    ) {
      return null;
    }
    return {
      formattedAddress: json.formattedAddress,
      latitude: json.location.latitude,
      longitude: json.location.longitude,
    };
  }

  private requireKey(): string {
    const apiKey = this.config.getMaps().apiKey;
    if (!apiKey) {
      throw new Error("Google Maps API key is not configured");
    }
    return apiKey;
  }
}
