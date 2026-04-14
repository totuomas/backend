require("dotenv").config();

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

// 🧠 PERSISTENT CACHE SETUP
const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

// ✅ Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: Date.now()
    });
});

// 🌍 Trade partners endpoint (NOW supports imports + exports)
app.get('/trade-partners', async (req, res) => {
    const requestedIso = req.query.country;
    const type = req.query.type || "exports"; // 👈 NEW
    const reporterM49 = isoToM49[requestedIso];

    if (!reporterM49) {
        console.warn(`No mapping for ${requestedIso}`);
        return res.json([]);
    }

    // 🔁 Choose flow type
    const flowCode = type === "imports" ? "M" : "X";

    // 🧠 Separate cache for imports vs exports
    const cacheFile = path.join(
        CACHE_DIR,
        `${requestedIso}_${type}_2021.json`
    );

    // ⚡ 1. Check Persistent Disk Cache First
    if (fs.existsSync(cacheFile)) {
        console.log(`Cache HIT for ${requestedIso} (${type})`);
        return res.json(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')));
    }

    try {
        console.log(`Cache MISS for ${requestedIso} (${type}). Fetching from UN Comtrade...`);
        
        // 🚀 2. Optimized Comtrade URL
        const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterM49}&period=2021&cmdCode=TOTAL&flowCode=${flowCode}`;

        const response = await fetch(url, {
            headers: {
                "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY
            }
        });

        console.log("STATUS:", response.status);

        const json = await response.json();

        if (!json.data || !Array.isArray(json.data)) {
            console.log("No data returned:", json);
            return res.json([]);
        }

        // ✅ Step 1: Aggregate
        const partnerMap = {};

        json.data.forEach(item => {
            if (item.partnerCode === 0) return; // skip "World"

            const iso = m49ToIso[item.partnerCode];
            if (!iso) return;

            if (!partnerMap[iso]) {
                partnerMap[iso] = 0;
            }

            partnerMap[iso] += item.primaryValue;
        });

        // ✅ Step 2: Total
        const total = Object.values(partnerMap)
            .reduce((sum, val) => sum + val, 0);

        if (total === 0) {
            console.log("Total = 0");
            return res.json([]);
        }

        // ✅ Step 3: Percentage
        const partners = Object.entries(partnerMap)
            .map(([iso, value]) => ({
                country: iso,
                value: (value / total) * 100
            }))
            .sort((a, b) => b.value - a.value);

        // ⚡ 4. Save to Disk Cache
        fs.writeFileSync(cacheFile, JSON.stringify(partners));

        res.json(partners);

    } catch (error) {
        console.error("Error fetching Comtrade data:", error);
        res.status(500).json({ error: "Failed to fetch trade data" });
    }
});

app.listen(3000, () => {
    console.log("Server running successfully.");
});