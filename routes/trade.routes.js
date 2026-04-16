const express = require("express");
const router = express.Router();

const {
    getTradePartners,
    getTradeSectors
} = require("../controllers/trade.controller");

router.get("/trade-partners", getTradePartners);
router.get("/trade-sectors", getTradeSectors);

module.exports = router;