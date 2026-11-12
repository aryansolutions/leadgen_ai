
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

export async function searchGooglePlaces({
    industry,
    location,
    limit = 20
}) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        throw new Error("GOOGLE_MAPS_API_KEY is missing in server/.env");
    }

    const response = await fetch(PLACES_URL, {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,

            "X-Goog-FieldMask": [
                "places.id",
                "places.displayName",
                "places.formattedAddress",
                "places.websiteUri",
                "places.nationalPhoneNumber",
                "places.googleMapsUri",
                "places.primaryType"
            ].join(",")
        },

        body: JSON.stringify({
            textQuery: `${industry} in ${location}`,
            pageSize: Math.min(Math.max(Number(limit) || 20, 1), 20),
            regionCode: "IN",
            languageCode: "en"
        }),

        signal: AbortSignal.timeout(15000)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Google Places search failed"
        );
    }

    return (data.places || []).map((place) => ({
        placeId: place.id,

        // These fields are for transient Google Places display.
        // Do not persist Google Places content in your CRM.
        name: place.displayName?.text || "",
        address: place.formattedAddress || "",
        website: place.websiteUri || "",
        phone: place.nationalPhoneNumber || "",
        googleMapsUrl: place.googleMapsUri || "",
        category: place.primaryType || ""
    }));
}
