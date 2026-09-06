const express = require("express");
const pool = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                stop_name,
                address,
                city,
                state,
                ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude
            FROM bus_stops
            ORDER BY stop_name;
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching bus stops:", error.message);

        res.status(500).json({
            error: "Failed to fetch bus stops"
        });
    }
});

module.exports = router;