const express = require("express");
const pool = require("../config/db");

const router = express.Router();

router.get("/bus-stops", async (req, res) => {
    try {
        const { lat, lng } = req.query;

        // Validate coordinates
        if (!lat || !lng) {
            return res.status(400).json({
                error: "lat and lng are required"
            });
        }

        const latitude = Number(lat);
        const longitude = Number(lng);

        if (
            Number.isNaN(latitude) ||
            Number.isNaN(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                error: "Invalid latitude or longitude"
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                stop_name,
                address,
                city,
                state,
                ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude,
                ROUND(
                    ST_Distance(
                        location,
                        ST_SetSRID(
                            ST_MakePoint($1, $2),
                            4326
                        )::geography
                    )::numeric,
                    2
                ) AS distance_meters
            FROM bus_stops
            ORDER BY location <-> ST_SetSRID(
                ST_MakePoint($1, $2),
                4326
            )::geography
            LIMIT 5;
            `,
            [longitude, latitude]
        );

        res.json({
            user_location: {
                latitude,
                longitude
            },
            count: result.rows.length,
            bus_stops: result.rows
        });

    } catch (error) {
        console.error(
            "Error finding nearby bus stops:",
            error.message
        );

        res.status(500).json({
            error: "Failed to find nearby bus stops"
        });
    }
});

module.exports = router;