const {
    fetchTradePartners,
    fetchTradeSectors
} = require("../services/comtrade.service");

exports.getTradePartners = async (req, res) => {
    try {
        const data = await fetchTradePartners(req.query);
        res.json(data);
    } catch (err) {
        console.error("Partners error:", err);
        res.status(500).json({ error: "Failed to fetch trade partners" });
    }
};

exports.getTradeSectors = async (req, res) => {
    try {
        const data = await fetchTradeSectors(req.query);
        res.json(data);
    } catch (err) {
        console.error("Sectors error:", err);
        res.status(500).json({ error: "Failed to fetch trade sectors" });
    }
};