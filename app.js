const express = require("express");
const cors = require("cors");

const tradeRoutes = require("./routes/trade.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: Date.now()
    });
});

app.use("/", tradeRoutes);

module.exports = app;