
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL =
    import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export default function LeadFinderPage() {
    const { token, organization } = useAuth();
    console.log("Organization object:", organization);
    console.log("Organization ID:", organization?.id);

    const authHeaders = {
        ...(token && {
            Authorization: `Bearer ${token}`,
        }),
        ...(organization?.id && {
            "x-organization-id": organization.id,
        }),
    };
    const [industry, setIndustry] = useState("");
    const [location, setLocation] = useState("");

    const [places, setPlaces] = useState([]);
    const [extracted, setExtracted] = useState({});

    const [loading, setLoading] = useState(false);
    const [extracting, setExtracting] = useState("");

    const [message, setMessage] = useState("");

    // Search businesses using Google Places
    async function searchBusinesses() {
        if (!industry.trim() || !location.trim()) {
            setMessage("Enter an industry and location.");
            return;
        }

        setLoading(true);
        setPlaces([]);
        setExtracted({});
        setMessage("");

        try {
            const response = await fetch(
                `${API_URL}/lead-finder/search`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders,
                    },
                    body: JSON.stringify({
                        industry,
                        location,
                        limit: 20,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || data.message || "Search failed"
                );
            }

            setPlaces(data.places || []);

            setMessage(
                `${data.count || 0} businesses found.`
            );
        } catch (error) {
            setMessage(error.message || "Search failed.");
        } finally {
            setLoading(false);
        }
    }

    // Extract public business information from website
    async function extractWebsite(place) {
        if (!place.website) {
            setMessage("This business has no website listed.");
            return;
        }

        setExtracting(place.placeId);
        setMessage("");

        try {
            const response = await fetch(
                `${API_URL}/lead-finder/extract`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders,
                    },
                    body: JSON.stringify({
                        website: place.website,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    data.message ||
                    "Website extraction failed"
                );
            }

            setExtracted((previous) => ({
                ...previous,
                [place.placeId]: data.result,
            }));

            setMessage("Website information extracted.");
        } catch (error) {
            setMessage(error.message || "Website extraction failed.");
        } finally {
            setExtracting("");
        }
    }

    // Import extracted business into existing CRM
    async function addToCRM(place) {
        const details = extracted[place.placeId];

        if (!details) {
            setMessage("Extract the website before importing.");
            return;
        }

        const companyName =
            details.title ||
            new URL(details.website).hostname.replace(/^www\./, "");

        const email = details.emails?.[0] || "";
        const phone = details.phones?.[0] || "";

        try {
            const response = await fetch(
                `${API_URL}/leads`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders,
                    },
                    body: JSON.stringify({
                        firstName: companyName,
                        lastName: "",
                        company: companyName,
                        email,
                        phone,
                        source: "Business website",
                        notes: details.description || "",
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    data.message ||
                    "Could not add this lead"
                );
            }

            setMessage(`${companyName} added to CRM.`);
        } catch (error) {
            setMessage(error.message || "Could not add this lead.");
        }
    }

    return (
        <div className="lead-finder-page">

            <div className="finder-heading">
                <div>
                    <p className="eyebrow">PROSPECTING</p>
                    <h1>Lead Finder</h1>

                    <p>
                        Discover businesses and extract their
                        publicly available business contact details.
                    </p>
                </div>
            </div>

            <div className="finder-search panel">

                <div className="finder-fields">

                    <label>
                        Industry / Business type

                        <input
                            value={industry}
                            onChange={(event) =>
                                setIndustry(event.target.value)
                            }
                            placeholder="e.g. Real estate companies"
                        />
                    </label>

                    <label>
                        Target location

                        <input
                            value={location}
                            onChange={(event) =>
                                setLocation(event.target.value)
                            }
                            placeholder="e.g. Noida, India"
                        />
                    </label>

                    <button
                        onClick={searchBusinesses}
                        disabled={loading}
                    >
                        {loading ? "Searching..." : "Find businesses"}
                    </button>

                </div>

                {message && (
                    <p className="finder-message">
                        {message}
                    </p>
                )}

            </div>

            <div className="finder-results">

                {places.map((place) => {
                    const details = extracted[place.placeId];

                    return (
                        <div
                            className="panel finder-result"
                            key={place.placeId}
                        >

                            <div className="result-header">
                                <div>
                                    <h3>{place.name}</h3>

                                    <p>{place.category}</p>

                                    <p>{place.address}</p>
                                </div>

                                {place.googleMapsUrl && (
                                    <a
                                        href={place.googleMapsUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View on Google Maps
                                    </a>
                                )}
                            </div>

                            <div className="result-links">

                                {place.website ? (
                                    <a
                                        href={place.website}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Visit website
                                    </a>
                                ) : (
                                    <span>No website listed</span>
                                )}

                                {place.phone && (
                                    <span>{place.phone}</span>
                                )}

                            </div>

                            <div className="result-actions">

                                <button
                                    onClick={() => extractWebsite(place)}
                                    disabled={
                                        extracting === place.placeId ||
                                        !place.website
                                    }
                                >
                                    {extracting === place.placeId
                                        ? "Extracting..."
                                        : "Extract website"}
                                </button>

                                {details && (
                                    <button
                                        onClick={() => addToCRM(place)}
                                    >
                                        Add to CRM
                                    </button>
                                )}

                            </div>

                            {details && (
                                <div className="extracted-details">

                                    <h4>Website extraction results</h4>

                                    <p>
                                        <strong>Website:</strong>{" "}
                                        {details.website}
                                    </p>

                                    <p>
                                        <strong>Description:</strong>{" "}
                                        {details.description || "Not found"}
                                    </p>

                                    <p>
                                        <strong>Emails:</strong>{" "}
                                        {details.emails?.join(", ") || "Not found"}
                                    </p>

                                    <p>
                                        <strong>Phones:</strong>{" "}
                                        {details.phones?.join(", ") || "Not found"}
                                    </p>

                                    <small>
                                        Source: {details.extractionSource}
                                    </small>

                                </div>
                            )}

                        </div>
                    );
                })}

            </div>

            <p className="google-attribution">
                Business discovery powered by Google Maps.
                Google Maps data is displayed under Google's
                applicable attribution and usage requirements.
            </p>

        </div>
    );
}
