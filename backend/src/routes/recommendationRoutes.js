const express = require("express");
const pool = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

/*
GET /api/recommendations

Required query parameters:

lat
lng

destination_lat
destination_lng

arrival_time

Example:

/api/recommendations
?lat=8.7000
&lng=77.7330
&destination_lat=8.7289
&destination_lng=77.7083
&arrival_time=2026-08-07T20:30:00%2B05:30
*/


router.get("/",authenticateToken, async (req, res) => {

    try {

        const {
            lat,
            lng,
            destination_lat,
            destination_lng,
            arrival_time
        } = req.query;


        // =========================================================
        // 1. VALIDATE INPUT
        // =========================================================

        if (
            lat === undefined ||
            lng === undefined ||
            destination_lat === undefined ||
            destination_lng === undefined ||
            !arrival_time
        ) {

            return res.status(400).json({
                error:
                    "lat, lng, destination_lat, destination_lng and arrival_time are required"
            });

        }


        // =========================================================
        // 2. CONVERT COORDINATES TO NUMBERS
        // =========================================================

        const latitude = Number(lat);
        const longitude = Number(lng);

        const destinationLatitude =
            Number(destination_lat);

        const destinationLongitude =
            Number(destination_lng);


        // =========================================================
        // 3. VALIDATE ALL COORDINATES
        // =========================================================

        if (
            Number.isNaN(latitude) ||
            Number.isNaN(longitude) ||
            Number.isNaN(destinationLatitude) ||
            Number.isNaN(destinationLongitude) ||

            latitude < -90 ||
            latitude > 90 ||

            longitude < -180 ||
            longitude > 180 ||

            destinationLatitude < -90 ||
            destinationLatitude > 90 ||

            destinationLongitude < -180 ||
            destinationLongitude > 180
        ) {

            return res.status(400).json({
                error:
                    "Invalid latitude or longitude"
            });

        }


        // =========================================================
        // 4. PARSE ARRIVAL TIME
        // =========================================================

        const requestedArrivalTime = new Date(arrival_time);

        if (isNaN(requestedArrivalTime.getTime())) {
            return res.status(400).json({
                error: "Invalid arrival_time. Use ISO format, for example 2026-08-07T10:00:00+05:30"
            });
        }

        const now = new Date();

        if (requestedArrivalTime <= now) {
            return res.status(400).json({
                error: "arrival_time must be a future date and time",
                current_time: now.toISOString(),
                requested_arrival_time: requestedArrivalTime.toISOString()
            });
        }


        // =========================================================
        // 5. FIND NEAREST BUS STOP TO USER
        // =========================================================

        const nearestStopResult =
            await pool.query(
                `
                SELECT
                    id,
                    stop_name,

                    ST_Y(location::geometry)
                        AS latitude,

                    ST_X(location::geometry)
                        AS longitude,

                    ST_Distance(
                        location,
                        ST_SetSRID(
                            ST_MakePoint($1, $2),
                            4326
                        )::geography
                    ) AS distance_meters

                FROM bus_stops

                ORDER BY
                    location <-> ST_SetSRID(
                        ST_MakePoint($1, $2),
                        4326
                    )::geography

                LIMIT 1;
                `,
                [
                    longitude,
                    latitude
                ]
            );


        // =========================================================
        // 6. NO BUS STOP NEAR USER
        // =========================================================

        if (
            nearestStopResult.rows.length === 0
        ) {

            return await recommendAuto(

                req.user.user_id,
                latitude,
                longitude,

                destinationLatitude,
                destinationLongitude,

                null,

                requestedArrivalTime,

                res
            );

        }


        const nearestStop =
            nearestStopResult.rows[0];


        // =========================================================
        // 7. FIND NEAREST BUS STOP TO ACTUAL DESTINATION
        //
        // IMPORTANT:
        //
        // destination_lat / destination_lng
        // represent the actual place selected by the user.
        //
        // The destination itself does NOT have to be a bus stop.
        // =========================================================

        const destinationStopResult =
            await pool.query(
                `
                SELECT
                    id,
                    stop_name,

                    ST_Y(location::geometry)
                        AS latitude,

                    ST_X(location::geometry)
                        AS longitude,

                    ST_Distance(
                        location,
                        ST_SetSRID(
                            ST_MakePoint($1, $2),
                            4326
                        )::geography
                    ) AS distance_meters

                FROM bus_stops

                ORDER BY
                    location <-> ST_SetSRID(
                        ST_MakePoint($1, $2),
                        4326
                    )::geography

                LIMIT 1;
                `,
                [
                    destinationLongitude,
                    destinationLatitude
                ]
            );


        // =========================================================
        // 8. NO BUS STOP NEAR DESTINATION
        // =========================================================

        if (
            destinationStopResult.rows.length === 0
        ) {

            return await recommendAuto(
                req.user.user_id,

                latitude,
                longitude,

                destinationLatitude,
                destinationLongitude,

                null,

                requestedArrivalTime,

                res
            );

        }


        const destinationStop =
            destinationStopResult.rows[0];


        // =========================================================
        // 9. DISTANCE FROM DESTINATION BUS STOP
        //    TO ACTUAL DESTINATION
        // =========================================================

        const walkingFromBusStopMeters =
            Number(
                destinationStop.distance_meters
            );


        // Walking speed approximation:
        // 5 km/h

        const walkingFromBusStopMinutes =
            Math.ceil(
                (
                    walkingFromBusStopMeters / 1000
                ) / 5 * 60
            );


        // =========================================================
        // 10. FIND ALL ROUTES THAT CONTAIN BOTH:
        //
        // boarding stop
        // destination stop
        //
        // We do NOT require destination_order >
        // boarding_order.
        //
        // This allows:
        //
        // Railway Station → New Bus Stand
        //
        // AND
        //
        // New Bus Stand → Railway Station
        // =========================================================

        const routesResult =
            await pool.query(
                `
                SELECT

                    br.id AS route_id,

                    br.route_number,

                    br.route_name,

                    boarding.stop_order
                        AS boarding_stop_order,

                    destination.stop_order
                        AS destination_stop_order

                FROM bus_routes br

                JOIN route_stop_mapping boarding
                    ON boarding.route_id = br.id

                JOIN route_stop_mapping destination
                    ON destination.route_id = br.id

                WHERE boarding.stop_id = $1

                  AND destination.stop_id = $2

                  AND boarding.stop_order <>
                      destination.stop_order

                ORDER BY br.route_number;
                `,
                [
                    nearestStop.id,
                    destinationStop.id
                ]
            );


        // =========================================================
        // 11. NO BUS ROUTE
        // =========================================================

        if (
            routesResult.rows.length === 0
        ) {

            return await recommendAuto(
                req.user.user_id,

                latitude,
                longitude,

                destinationLatitude,
                destinationLongitude,

                destinationStop,

                requestedArrivalTime,

                res
            );

        }


        const recommendations = [];


        // =========================================================
        // 12. PROCESS EACH ROUTE
        // =========================================================

        for (
            const route
            of routesResult.rows
        ) {


            const boardingOrder =
                Number(
                    route.boarding_stop_order
                );


            const destinationOrder =
                Number(
                    route.destination_stop_order
                );


            // =====================================================
            // DETERMINE DIRECTION
            // =====================================================

            const direction =
                destinationOrder >
                boardingOrder

                    ? "FORWARD"

                    : "REVERSE";


            // =====================================================
            // 13. CALCULATE BUS TRAVEL TIME
            // =====================================================

            let travelTimeQuery;

            let travelTimeParams;


            if (
                direction === "FORWARD"
            ) {

                travelTimeQuery = `
                    SELECT

                        COALESCE(
                            SUM(
                                estimated_travel_time_minutes
                            ),
                            0
                        ) AS total_travel_time_minutes

                    FROM route_stop_mapping

                    WHERE route_id = $1

                      AND stop_order > $2

                      AND stop_order <= $3;
                `;


                travelTimeParams = [

                    route.route_id,

                    boardingOrder,

                    destinationOrder

                ];

            }


            else {

                /*
                Reverse example:

                Original:

                1 Railway Station
                2 Junction
                3 Hospital
                ...
                11 New Bus Stand

                Reverse:

                11 New Bus Stand
                ...
                1 Railway Station

                Therefore we sum:

                stop_order > destinationOrder

                AND

                stop_order <= boardingOrder
                */


                travelTimeQuery = `
                    SELECT

                        COALESCE(
                            SUM(
                                estimated_travel_time_minutes
                            ),
                            0
                        ) AS total_travel_time_minutes

                    FROM route_stop_mapping

                    WHERE route_id = $1

                      AND stop_order > $2

                      AND stop_order <= $3;
                `;


                travelTimeParams = [

                    route.route_id,

                    destinationOrder,

                    boardingOrder

                ];

            }


            const travelTimeResult =
                await pool.query(
                    travelTimeQuery,
                    travelTimeParams
                );


            const busTravelTime =
                Number(
                    travelTimeResult.rows[0]
                        .total_travel_time_minutes
                );


            // =====================================================
            // 14. CALCULATE BUS DISTANCE
            // =====================================================

            const lowerOrder =
                Math.min(
                    boardingOrder,
                    destinationOrder
                );


            const higherOrder =
                Math.max(
                    boardingOrder,
                    destinationOrder
                );


            const distanceResult =
                await pool.query(
                    `
                    WITH route_segments AS (

                        SELECT

                            rsm.stop_order,

                            bs.location,

                            LAG(bs.location)
                                OVER (
                                    ORDER BY
                                        rsm.stop_order
                                )
                                AS previous_location

                        FROM route_stop_mapping rsm

                        JOIN bus_stops bs
                            ON bs.id = rsm.stop_id

                        WHERE rsm.route_id = $1

                          AND rsm.stop_order > $2

                          AND rsm.stop_order <= $3
                    )

                    SELECT

                        COALESCE(
                            SUM(
                                ST_Distance(
                                    previous_location,
                                    location
                                )
                            ),
                            0
                        )
                        AS total_distance_meters

                    FROM route_segments

                    WHERE previous_location
                        IS NOT NULL;
                    `,
                    [
                        route.route_id,
                        lowerOrder,
                        higherOrder
                    ]
                );


            const totalDistanceMeters =
                Number(
                    distanceResult.rows[0]
                        .total_distance_meters
                );


            const totalDistanceKm =
                Number(
                    (
                        totalDistanceMeters / 1000
                    ).toFixed(2)
                );


            // =====================================================
            // 15. WALKING TIME TO BOARDING STOP
            //
            // Approximation:
            // 5 km/h
            // =====================================================

            const distanceToBusStopMeters =
                Number(
                    nearestStop.distance_meters
                );


            const walkingTimeMinutes =
                Math.ceil(
                    (
                        distanceToBusStopMeters / 1000
                    ) / 5 * 60
                );


            // =====================================================
            // 16. TOTAL JOURNEY TIME
            //
            // walking to bus
            // +
            // bus
            // +
            // walking from bus
            // to actual destination
            // =====================================================

            const totalJourneyTimeMinutes =

                walkingTimeMinutes +

                busTravelTime +

                walkingFromBusStopMinutes;


            // =====================================================
            // 17. EXPECTED ARRIVAL TIME
            // =====================================================

            const departureTime =
                new Date();


            const expectedArrivalTime =
                new Date(
                    departureTime.getTime() +

                    totalJourneyTimeMinutes *
                    60 *
                    1000
                );


            // =====================================================
            // 18. CHECK DEADLINE
            // =====================================================

            const meetsDeadline =
                expectedArrivalTime.getTime() <=
                requestedArrivalTime.getTime();


            const minutesBeforeDeadline =
                Math.floor(
                    (
                        requestedArrivalTime.getTime() -
                        expectedArrivalTime.getTime()
                    ) /
                    (60 * 1000)
                );


            // =====================================================
            // 19. ADD BUS RECOMMENDATION
            // =====================================================

            recommendations.push({

                type:
                    "DIRECT_BUS",


                route_id:
                    route.route_id,


                route_number:
                    route.route_number,


                route_name:
                    route.route_name,


                direction:
                    direction,


                // -------------------------------------------------
                // USER → BOARDING STOP
                // -------------------------------------------------

                boarding_stop: {

                    id:
                        nearestStop.id,

                    name:
                        nearestStop.stop_name,

                    latitude:
                        Number(
                            nearestStop.latitude
                        ),

                    longitude:
                        Number(
                            nearestStop.longitude
                        ),

                    distance_from_user_meters:
                        Number(
                            distanceToBusStopMeters
                                .toFixed(2)
                        ),

                    estimated_walking_time_minutes:
                        walkingTimeMinutes

                },


                // -------------------------------------------------
                // ACTUAL DESTINATION
                // -------------------------------------------------

                destination: {

                    latitude:
                        destinationLatitude,

                    longitude:
                        destinationLongitude

                },


                // -------------------------------------------------
                // BUS ALIGHTING STOP
                // -------------------------------------------------

                alighting_stop: {

                    id:
                        destinationStop.id,

                    name:
                        destinationStop.stop_name,

                    latitude:
                        Number(
                            destinationStop.latitude
                        ),

                    longitude:
                        Number(
                            destinationStop.longitude
                        ),

                    distance_to_destination_meters:
                        Number(
                            walkingFromBusStopMeters
                                .toFixed(2)
                        ),

                    estimated_walking_time_minutes:
                        walkingFromBusStopMinutes

                },


                boarding_stop_order:
                    boardingOrder,


                destination_stop_order:
                    destinationOrder,


                total_distance_km:
                    totalDistanceKm,


                bus_travel_time_minutes:
                    busTravelTime,


                walking_time_to_boarding_stop_minutes:
                    walkingTimeMinutes,


                walking_time_from_alighting_stop_minutes:
                    walkingFromBusStopMinutes,


                estimated_total_journey_time_minutes:
                    totalJourneyTimeMinutes,


                requested_arrival_time:
                    requestedArrivalTime.toISOString(),


                expected_arrival_time:
                    expectedArrivalTime.toISOString(),


                meets_deadline:
                    meetsDeadline,


                minutes_before_deadline:
                    minutesBeforeDeadline

            });

        }


        // =========================================================
        // 20. KEEP ONLY ROUTES THAT MEET DEADLINE
        // =========================================================

        const validBusRecommendations =
            recommendations.filter(
                route =>
                    route.meets_deadline === true
            );


        // =========================================================
        // 21. SORT BY FASTEST JOURNEY
        // =========================================================

        if (
            validBusRecommendations.length > 0
        ) {

            validBusRecommendations.sort(
                (a, b) => {

                    if (
                        a.estimated_total_journey_time_minutes !==
                        b.estimated_total_journey_time_minutes
                    ) {

                        return (

                            a.estimated_total_journey_time_minutes -

                            b.estimated_total_journey_time_minutes

                        );

                    }


                    return (

                        a.boarding_stop
                            .estimated_walking_time_minutes -

                        b.boarding_stop
                            .estimated_walking_time_minutes

                    );

                }
            );


            // =====================================================
            // 22. RETURN BUS RECOMMENDATION
            // =====================================================

            await saveSearchHistory({

                    userId:
                        req.user.user_id,

                    latitude,
                    longitude,

                    destinationLatitude,
                    destinationLongitude,

                    arrivalTime:
                        requestedArrivalTime
                });

                return res.json({

                    recommendation_type:
                        "BUS",


                message:
                    "A bus route can reach the destination before the requested arrival time.",


                current_time:
                    new Date().toISOString(),


                requested_arrival_time:
                    requestedArrivalTime.toISOString(),


                // -----------------------------------------------
                // USER'S NEAREST BUS STOP
                // -----------------------------------------------

                nearest_bus_stop: {

                    id:
                        nearestStop.id,

                    name:
                        nearestStop.stop_name,

                    distance_from_user_meters:
                        Number(
                            Number(
                                nearestStop.distance_meters
                            ).toFixed(2)
                        )

                },


                // -----------------------------------------------
                // ACTUAL DESTINATION
                // -----------------------------------------------

                destination: {

                    latitude:
                        destinationLatitude,

                    longitude:
                        destinationLongitude

                },


                // -----------------------------------------------
                // BUS STOP NEAREST TO DESTINATION
                // -----------------------------------------------

                destination_bus_stop: {

                    id:
                        destinationStop.id,

                    name:
                        destinationStop.stop_name,

                    latitude:
                        Number(
                            destinationStop.latitude
                        ),

                    longitude:
                        Number(
                            destinationStop.longitude
                        ),

                    distance_to_destination_meters:
                        Number(
                            walkingFromBusStopMeters
                                .toFixed(2)
                        ),

                    estimated_walking_time_minutes:
                        walkingFromBusStopMinutes

                },


                recommendations:
                    validBusRecommendations

            });

        }


        // =========================================================
        // 23. BUS EXISTS BUT DOES NOT MEET DEADLINE
        // =========================================================

        return await recommendAuto(
            req.user.user_id,

            latitude,
            longitude,

            destinationLatitude,
            destinationLongitude,

            destinationStop,

            requestedArrivalTime,

            res,

            recommendations

        );


    }

    catch (error) {

        console.error(
            "Error generating recommendation:",
            error
        );


        return res.status(500).json({

            error:
                "Failed to generate recommendation",

            details:
                error.message

        });

    }

});

// =================================================================
// AUTO FALLBACK
// =================================================================

async function recommendAuto(
    userId,

    latitude,
    longitude,

    destinationLatitude,
    destinationLongitude,

    destinationStop,

    requestedArrivalTime,

    res,

    busRecommendations = []

) {

    try {


        // =========================================================
        // 24. FIND NEAREST AUTO STAND
        // =========================================================

        const autoStandResult =
            await pool.query(
                `
                SELECT

                    id,

                    stand_name,

                    ST_Y(location::geometry)
                        AS latitude,

                    ST_X(location::geometry)
                        AS longitude,

                    ST_Distance(
                        location,
                        ST_SetSRID(
                            ST_MakePoint($1, $2),
                            4326
                        )::geography
                    ) AS distance_meters

                FROM auto_stands

                ORDER BY

                    location <-> ST_SetSRID(
                        ST_MakePoint($1, $2),
                        4326
                    )::geography

                LIMIT 1;
                `,
                [
                    longitude,
                    latitude
                ]
            );


        // =========================================================
        // 25. NO AUTO STAND
        // =========================================================

        if (
            autoStandResult.rows.length === 0
        ) {

            await saveSearchHistory({

                userId,

                latitude,
                longitude,

                destinationLatitude,
                destinationLongitude,

                arrivalTime:
                    requestedArrivalTime
            });

            return res.json({

                recommendation_type:
                    "NO_ROUTE",


                message:
                    "No suitable bus route or auto stand was found.",


                requested_arrival_time:
                    requestedArrivalTime.toISOString(),


                destination: {

                    latitude:
                        destinationLatitude,

                    longitude:
                        destinationLongitude

                },


                recommendations:
                    busRecommendations

            });

        }


        const autoStand =
            autoStandResult.rows[0];


        const autoDistanceFromUser =
            Number(
                Number(
                    autoStand.distance_meters
                ).toFixed(2)
            );


        // =========================================================
        // 26. CALCULATE AUTO DISTANCE TO ACTUAL DESTINATION
        //
        // IMPORTANT:
        //
        // We do NOT use destinationStop here.
        //
        // The user may have selected any place.
        // =========================================================

        const autoDestinationResult =
            await pool.query(
                `
                SELECT

                    ST_Distance(

                        ST_SetSRID(
                            ST_MakePoint($1, $2),
                            4326
                        )::geography,

                        ST_SetSRID(
                            ST_MakePoint($3, $4),
                            4326
                        )::geography

                    ) AS distance_meters;
                `,
                [

                    longitude,
                    latitude,

                    destinationLongitude,
                    destinationLatitude

                ]
            );


        const autoDistanceToDestination =
            Number(
                autoDestinationResult.rows[0]
                    ?.distance_meters || 0
            );


        // =========================================================
        // 27. RETURN AUTO RECOMMENDATION
        // =========================================================

        await saveSearchHistory({

                userId,

                latitude,
                longitude,

                destinationLatitude,
                destinationLongitude,

                arrivalTime:
                    requestedArrivalTime
            });

            return res.json({

                recommendation_type:
                    "AUTO",


            message:
                busRecommendations.length > 0

                    ? "No bus route can reach the destination before the requested arrival time. Auto is recommended."

                    : "No suitable bus route was found. Auto is recommended.",


            current_time:
                new Date().toISOString(),


            requested_arrival_time:
                requestedArrivalTime.toISOString(),


            // -----------------------------------------------
            // ACTUAL DESTINATION
            // -----------------------------------------------

            destination: {

                latitude:
                    destinationLatitude,

                longitude:
                    destinationLongitude

            },


            // -----------------------------------------------
            // NEAREST AUTO STAND
            // -----------------------------------------------

            nearest_auto_stand: {

                id:
                    autoStand.id,

                name:
                    autoStand.stand_name,

                latitude:
                    Number(
                        autoStand.latitude
                    ),

                longitude:
                    Number(
                        autoStand.longitude
                    ),

                distance_from_user_meters:
                    autoDistanceFromUser

            },


            estimated_auto_distance_to_destination_km:
                Number(
                    (
                        autoDistanceToDestination / 1000
                    ).toFixed(2)
                ),


            bus_options_considered:
                busRecommendations

        });


    }

    catch (error) {

        console.error(
            "Error finding auto recommendation:",
            error
        );


        return res.status(500).json({

            error:
                "Failed to generate auto recommendation",

            details:
                error.message

        });

    }

}

// =================================================================
// SAVE SEARCH HISTORY
// =================================================================

async function saveSearchHistory({
    userId,
    latitude,
    longitude,
    destinationLatitude,
    destinationLongitude,
    arrivalTime
}) {

    await pool.query(
        `
        INSERT INTO search_history (
            user_id,
            source_location,
            destination_location,
            arrival_time
        )
        VALUES (
            $1,
            ST_SetSRID(
                ST_MakePoint($2, $3),
                4326
            )::geography,
            ST_SetSRID(
                ST_MakePoint($4, $5),
                4326
            )::geography,
            $6
        )
        `,
        [
            userId,
            longitude,
            latitude,
            destinationLongitude,
            destinationLatitude,
            arrivalTime
        ]
    );
}

module.exports = router;