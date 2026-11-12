
import express from "express";

import {
    searchGooglePlaces
} from "../services/googlePlacesService.js";

import {
    extractBusinessWebsite
} from "../services/websiteExtractor.js";

const router = express.Router();

router.post("/search", async (req, res, next) => {
    try {
        const { industry, location, limit } = req.body;

        if (
            typeof industry !== "string" ||
            typeof location !== "string" ||
            !industry.trim() ||
            !location.trim()
        ) {
            return res.status(400).json({
                error: "Industry and location are required"
            });
        }

        if (industry.length > 100 || location.length > 100) {
            return res.status(400).json({
                error: "Search fields are too long"
            });
        }

        const places = await searchGooglePlaces({
            industry: industry.trim(),
            location: location.trim(),
            limit
        });

        return res.json({
            success: true,
            source: "Google Places",
            count: places.length,
            places
        });
    } catch (error) {
        next(error);
    }
});

router.post("/extract", async (req, res, next) => {
    try {
        const { website } = req.body;

        if (
            typeof website !== "string" ||
            website.length > 2048
        ) {
            return res.status(400).json({
                error: "A valid website URL is required"
            });
        }

        const result = await extractBusinessWebsite(website);

        return res.json({
            success: true,
            result
        });
    } catch (error) {
        next(error);
    }
});

export default router;
