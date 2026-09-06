const express = require("express");
const cors = require("cors");

const busStopRoutes = require("./routes/busStopRoutes");
const nearbyRoutes = require("./routes/nearbyRoutes");
const routeRoutes = require("./routes/routeRoutes");
const autoStandRoutes = require("./routes/autoStandRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const authRoutes = require("./routes/authRoutes");
const searchHistoryRoutes = require("./routes/searchHistoryRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Smart Commute API is running"
    });
});

app.use("/api/bus-stops", busStopRoutes);
app.use("/api/nearby", nearbyRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/auto-stands", autoStandRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/search-history", searchHistoryRoutes);

module.exports = app;