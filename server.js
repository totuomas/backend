const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

// 📦 Load ISO → M49 mapping
const isoToM49 = JSON.parse(
    fs.readFileSync(path.join(__dirname, "isoToM49.json"), "utf-8")
);

// 🔁 Reverse mapping
const m49ToIso = Object.fromEntries(
    Object.entries(isoToM49).map(([iso, m49]) => [m49, iso])
);

// 🧠 SIMPLE CACHE
const cache = {};
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

// ✅ Health check (fast)
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: Date.now()
    });
});

// 🌍 Trade partners endpoint (with caching)
app.get('/trade-partners', async (req, res) => {
    const requestedIso = req.query.country;
    const reporterM49 = isoToM49[requestedIso];

    if (!reporterM49) {
        console.warn(`No mapping for ${requestedIso}`);
        return res.json([]);
    }

    // ⚡ 1. CHECK CACHE FIRST
    const cached = cache[requestedIso];

    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        return res.json(cached.data);
    }

    try {
        const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporterM49}&flowCode=X&cmdCode=TOTAL&period=2021`;

        const response = await fetch(url);
        const json = await response.json();

        if (!json.data || !Array.isArray(json.data)) {
            return res.json([]);
        }

        // ✅ Step 1: deduplicate
        const partnerMap = {};

        json.data
            .filter(item => item.partnerCode !== 0)
            .forEach(item => {
                const iso = m49ToIso[item.partnerCode];
                if (!iso) return;

                if (!partnerMap[iso] || item.primaryValue > partnerMap[iso]) {
                    partnerMap[iso] = item.primaryValue;
                }
            });

        // ✅ Step 2: total
        const totalExports = Object.values(partnerMap)
            .reduce((sum, val) => sum + val, 0);

        if (totalExports === 0) {
            return res.json([]);
        }

        // ✅ Step 3: %
        const partners = Object.entries(partnerMap)
            .map(([iso, value]) => ({
                country: iso,
                value: (value / totalExports) * 100
            }))
            .sort((a, b) => b.value - a.value);

        // ⚡ 2. STORE IN CACHE
        cache[requestedIso] = {
            data: partners,
            timestamp: Date.now()
        };

        res.json(partners);

    } catch (error) {
        console.error("Error fetching Comtrade data:", error);
        res.status(500).json({ error: "Failed to fetch trade data" });
    }
});

app.listen(3000, () => {
    console.log("Server running succesfully.");
});