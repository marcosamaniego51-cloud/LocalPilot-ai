/**
 * Google Places API client for Prospect discovery (Requirement 1.1).
 *
 * Uses the current "Places API (New)" endpoints (Text Search + Place
 * Details), since the legacy Places API is deprecated by Google. Field
 * masks are used throughout to request only the fields we need (name,
 * category, address, phone, website) and keep cost/response size down.
 *
 * Requires GOOGLE_PLACES_API_KEY to be set. Not exercised against a live
 * API key in this environment — verify against a real key before relying
 * on it in production.
 */

const PLACES_API_BASE = "https://places.googleapis.com/v1";

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  }
  return key;
}

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  types: string[];
  formattedAddress?: string;
  lat?: number;
  lng?: number;
};

export type PlaceDetails = PlaceSearchResult & {
  phoneNumber?: string;
  website?: string;
};

type SearchTextResponse = {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    types?: string[];
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
  nextPageToken?: string;
};

type PlaceDetailsResponse = {
  id: string;
  displayName?: { text?: string };
  types?: string[];
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  internationalPhoneNumber?: string;
  websiteUri?: string;
};

/**
 * Text-searches for businesses matching a category in a given location
 * (e.g. category="plumber", location="Austin, TX"). Google's Text Search
 * (New) does not take a strict radius for a plain-text location like this;
 * radiusKm is accepted for interface stability with the discovery job
 * config and can be wired into locationBias once we're passing lat/lng
 * centers instead of a free-text location.
 */
export async function searchPlaces(params: {
  category: string;
  location: string;
  pageToken?: string;
}): Promise<{ results: PlaceSearchResult[]; nextPageToken?: string }> {
  const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.types,places.formattedAddress,places.location,nextPageToken",
    },
    body: JSON.stringify({
      textQuery: `${params.category} in ${params.location}`,
      pageToken: params.pageToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google Places searchText failed (${res.status}): ${body}`,
    );
  }

  const data = (await res.json()) as SearchTextResponse;

  const results: PlaceSearchResult[] = (data.places ?? []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text ?? "Unknown business",
    types: place.types ?? [],
    formattedAddress: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
  }));

  return { results, nextPageToken: data.nextPageToken };
}

/**
 * Fetches phone/website details for a single place. Separate from
 * searchText per design.md ("Text Search + Place Details") so we only pay
 * for the more detailed fields on the candidates we actually care about.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const res = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "id,displayName,types,formattedAddress,location,internationalPhoneNumber,websiteUri",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Places details failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as PlaceDetailsResponse;

  return {
    placeId: data.id,
    name: data.displayName?.text ?? "Unknown business",
    types: data.types ?? [],
    formattedAddress: data.formattedAddress,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
    phoneNumber: data.internationalPhoneNumber,
    website: data.websiteUri,
  };
}

/**
 * Iterates all pages of a text search, calling `onPage` with each batch of
 * raw search results (before Place Details lookup). Bounded by maxPages to
 * keep a single discovery run's duration and API cost predictable — Google
 * requires a short delay before a pageToken becomes valid, which this
 * respects.
 */
export async function paginateSearch(
  params: { category: string; location: string },
  onPage: (results: PlaceSearchResult[]) => Promise<void>,
  maxPages = 3,
): Promise<void> {
  let pageToken: string | undefined;
  let page = 0;

  do {
    const { results, nextPageToken } = await searchPlaces({
      ...params,
      pageToken,
    });
    await onPage(results);
    pageToken = nextPageToken;
    page += 1;

    if (pageToken && page < maxPages) {
      // Google Places requires a short delay before a next-page token is valid.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } while (pageToken && page < maxPages);
}
