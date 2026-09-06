/*
===========================================================
 Smart Commute Database Schema
 Version : 1.0
 Database: smart_commute
===========================================================

Author : Karkuzhali
Description:
Database schema for the AI-Powered Smart Commuting Assistant.

===========================================================
*/


------------------------------------------------------------
-- Extensions
------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;


------------------------------------------------------------
-- USERS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    full_name TEXT NOT NULL,

    email TEXT NOT NULL UNIQUE,

    phone TEXT UNIQUE,

    password_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



------------------------------------------------------------
-- USER PREFERENCES
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_preferences (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE,

    preferred_transport TEXT NOT NULL
        CHECK (preferred_transport IN ('bus','walk','auto','any')),

    max_budget NUMERIC(10,2)
        CHECK (max_budget >= 0),

    max_walk_distance INTEGER
        CHECK (max_walk_distance >= 0),

    avoid_walking BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_user_preferences_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);



------------------------------------------------------------
-- SAVED LOCATIONS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS saved_locations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    nickname TEXT NOT NULL,

    label_type TEXT NOT NULL DEFAULT 'CUSTOM'
        CHECK (
            label_type IN (
                'HOME',
                'WORK',
                'COLLEGE',
                'FAVORITE',
                'CUSTOM'
            )
        ),

    location GEOGRAPHY(POINT,4326) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_saved_locations_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);




------------------------------------------------------------
-- INDEXES
------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);

CREATE INDEX IF NOT EXISTS idx_saved_locations_user
ON saved_locations(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_locations_location
ON saved_locations
USING GIST(location);


------------------------------------------------------------
-- BUS STOPS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bus_stops (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    stop_name TEXT NOT NULL UNIQUE,

    address TEXT,

    city TEXT NOT NULL DEFAULT 'Tirunelveli',

    state TEXT NOT NULL DEFAULT 'Tamil Nadu',

    location GEOGRAPHY(POINT,4326) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



------------------------------------------------------------
-- BUS ROUTES
------------------------------------------------------------

------------------------------------------------------------
-- BUS ROUTES
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bus_routes (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    route_number TEXT NOT NULL UNIQUE,

    route_name TEXT NOT NULL,

    start_stop_id UUID NOT NULL,

    end_stop_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bus_route_start
        FOREIGN KEY (start_stop_id)
        REFERENCES bus_stops(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_bus_route_end
        FOREIGN KEY (end_stop_id)
        REFERENCES bus_stops(id)
        ON DELETE RESTRICT

);



------------------------------------------------------------
-- ROUTE STOP MAPPING
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS route_stop_mapping (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    route_id UUID NOT NULL,

    stop_id UUID NOT NULL,

    stop_order INTEGER NOT NULL
        CHECK (stop_order > 0),

    distance_from_previous_km NUMERIC(5,2)
        NOT NULL DEFAULT 0
        CHECK (distance_from_previous_km >= 0),

    estimated_travel_time_minutes INTEGER
        NOT NULL DEFAULT 0
        CHECK (estimated_travel_time_minutes >= 0),

    CONSTRAINT fk_route_mapping_route
        FOREIGN KEY (route_id)
        REFERENCES bus_routes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_route_mapping_stop
        FOREIGN KEY (stop_id)
        REFERENCES bus_stops(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_route_stop_order
        UNIQUE(route_id, stop_order),

    CONSTRAINT uq_route_stop
        UNIQUE(route_id, stop_id)

);



------------------------------------------------------------
-- TRANSPORT INDEXES
------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_bus_stops_location
ON bus_stops
USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_route_mapping_route
ON route_stop_mapping(route_id);

CREATE INDEX IF NOT EXISTS idx_route_mapping_stop
ON route_stop_mapping(stop_id);

CREATE INDEX IF NOT EXISTS idx_route_mapping_order
ON route_stop_mapping(route_id, stop_order);

CREATE INDEX IF NOT EXISTS idx_bus_routes_number
ON bus_routes(route_number);


------------------------------------------------------------
-- TRAVEL HISTORY
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS travel_history (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    source_location GEOGRAPHY(POINT, 4326) NOT NULL,

    destination_location GEOGRAPHY(POINT, 4326) NOT NULL,

    route_id UUID,

    distance_km NUMERIC(6,2)
        CHECK (distance_km >= 0),

    estimated_fare NUMERIC(8,2)
        CHECK (estimated_fare >= 0),

    travel_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_travel_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_travel_route
        FOREIGN KEY (route_id)
        REFERENCES bus_routes(id)
        ON DELETE SET NULL

);



------------------------------------------------------------
-- AI RECOMMENDATIONS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_recommendations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    travel_history_id UUID NOT NULL,

    recommended_route_id UUID,

    recommendation_reason TEXT NOT NULL,

    estimated_time_minutes INTEGER
        CHECK (estimated_time_minutes >= 0),

    estimated_cost NUMERIC(8,2)
        CHECK (estimated_cost >= 0),

    confidence_score NUMERIC(4,2)
        CHECK (
            confidence_score >= 0
            AND confidence_score <= 100
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ai_travel
        FOREIGN KEY (travel_history_id)
        REFERENCES travel_history(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ai_route
        FOREIGN KEY (recommended_route_id)
        REFERENCES bus_routes(id)
        ON DELETE SET NULL

);

------------------------------------------------------------
-- TRAVEL INDEXES
------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_travel_user
ON travel_history(user_id);

CREATE INDEX IF NOT EXISTS idx_travel_route
ON travel_history(route_id);

CREATE INDEX IF NOT EXISTS idx_travel_source
ON travel_history
USING GIST(source_location);

CREATE INDEX IF NOT EXISTS idx_travel_destination
ON travel_history
USING GIST(destination_location);

CREATE INDEX IF NOT EXISTS idx_ai_travel
ON ai_recommendations(travel_history_id);

CREATE INDEX IF NOT EXISTS idx_ai_route
ON ai_recommendations(recommended_route_id);


CREATE TABLE IF NOT EXISTS auto_stands (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    stand_name TEXT NOT NULL UNIQUE,

    location GEOGRAPHY(POINT, 4326) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_auto_stands_location
ON auto_stands
USING GIST(location);



