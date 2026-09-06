const express = require("express");
const pool = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// =====================================================
// GET USER SEARCH HISTORY
// =====================================================

router.get("/", authenticateToken, async (req, res) => {

    try {

        const userId = req.user.user_id;

        const result = await pool.query(
            `
            SELECT
                id,
                ST_Y(source_location::geometry) AS source_latitude,
                ST_X(source_location::geometry) AS source_longitude,
                ST_Y(destination_location::geometry) AS destination_latitude,
                ST_X(destination_location::geometry) AS destination_longitude,
                arrival_time,
                searched_at
            FROM search_history
            WHERE user_id = $1
            ORDER BY searched_at DESC
            `,
            [userId]
        );

        res.json({
            search_history: result.rows
        });

    } catch (error) {

        console.error(
            "Error fetching search history:",
            error
        );

        res.status(500).json({
            error: "Failed to fetch search history"
        });
    }
});

// =====================================================
// CLEAR USER SEARCH HISTORY
// =====================================================

router.delete("/", authenticateToken, async (req, res) => {

    try {

        const userId = req.user.user_id;

        const result = await pool.query(
            `
            DELETE FROM search_history
            WHERE user_id = $1
            `,
            [userId]
        );

        res.json({
            message: "Search history cleared successfully",
            deleted_count: result.rowCount
        });

    } catch (error) {

        console.error(
            "Error clearing search history:",
            error
        );

        res.status(500).json({
            error: "Failed to clear search history"
        });
    }
});


module.exports = router;