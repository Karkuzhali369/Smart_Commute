const express = require("express");
const pool = require("../config/db");

const router = express.Router();


// Get all routes
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                route_number,
                route_name,
                start_stop_id,
                end_stop_id,
                created_at
            FROM bus_routes
            ORDER BY route_number;
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching routes:", error.message);

        res.status(500).json({
            error: "Failed to fetch routes"
        });
    }
});


// Get one route with its stops
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const routeResult = await pool.query(
            `
            SELECT
                id,
                route_number,
                route_name,
                start_stop_id,
                end_stop_id,
                created_at
            FROM bus_routes
            WHERE id = $1;
            `,
            [id]
        );

        if (routeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Route not found"
            });
        }

        const stopsResult = await pool.query(
            `
            SELECT
                bs.id,
                bs.stop_name,
                ST_Y(bs.location::geometry) AS latitude,
                ST_X(bs.location::geometry) AS longitude,
                rsm.stop_order,
                rsm.distance_from_previous_km,
                rsm.estimated_travel_time_minutes
            FROM route_stop_mapping rsm
            JOIN bus_stops bs
                ON bs.id = rsm.stop_id
            WHERE rsm.route_id = $1
            ORDER BY rsm.stop_order;
            `,
            [id]
        );

        res.json({
            route: routeResult.rows[0],
            stops: stopsResult.rows
        });

    } catch (error) {
        console.error("Error fetching route:", error.message);

        res.status(500).json({
            error: "Failed to fetch route"
        });
    }
});

module.exports = router;