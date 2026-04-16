require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const sectorGroups = require("./sectorGroups");

// ✅ IMPORTANT: ensure fetch works
const fetch = global.fetch || require("node-fetch");

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

// 🧠 CACHE SETUP
const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

// ✅ Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: Date.now(),
    });
});

// 🌍 TRADE PARTNERS (WITH WORKING FALLBACK)
app.get("/trade-partners", async (req, res) => {
    const requestedIso = req.query.country;
    const type = req.query.type || "exports";

    const reporterM49 = isoToM49[requestedIso];
    if (!reporterM49) return res.json([]);

    const flowCode = type === "imports" ? "M" : "X";

    const cacheFile = path.join(
        CACHE_DIR,
        `${requestedIso}_${type}_partners_2023.json`
    );

    // ✅ Cache
    if (fs.existsSync(cacheFile)) {
        console.log(`Cache HIT partners: ${requestedIso}`);
        return res.json(JSON.parse(fs.readFileSync(cacheFile, "utf-8")));
    }

    try {
        console.log(`Fetching partners: ${requestedIso}`);

        const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterM49}&period=2023&cmdCode=TOTAL&flowCode=${flowCode}`;

        const response = await fetch(url, {
            headers: {
                "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY,
            },
        });

        console.log("Partners status:", response.status);

        const json = await response.json();

        // 🔥 FALLBACK
        if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
            const fallback = await getMirrorData(reporterM49, type);

            if (!fallback) return res.json([]);

            return res.json(fallback);
        }

        // ✅ Normal aggregation
        const partnerMap = {};

        json.data.forEach((item) => {
            if (item.partnerCode === 0) return;

            const iso = m49ToIso[item.partnerCode];
            if (!iso) return;

            if (!partnerMap[iso]) {
                partnerMap[iso] = 0;
            }

            partnerMap[iso] += item.primaryValue;
        });

        const total = Object.values(partnerMap).reduce(
            (sum, val) => sum + val,
            0
        );

        const partners = Object.entries(partnerMap)
            .map(([iso, value]) => ({
                country: iso,
                value: total ? (value / total) * 100 : 0,
            }))
            .sort((a, b) => b.value - a.value);

        // ✅ Save cache
        fs.writeFileSync(cacheFile, JSON.stringify(partners));

        res.json(partners);
    } catch (error) {
        console.error("Partners error:", error);
        res.status(500).json({ error: "Failed to fetch trade partners" });
    }
});

// 📊 TRADE SECTORS (DETAILED)
app.get('/trade-sectors', async (req, res) => {
    const requestedIso = req.query.country;
    const type = req.query.type || "exports";

    const reporterM49 = isoToM49[requestedIso];
    if (!reporterM49) return res.json([]);

    const flowCode = type === "imports" ? "M" : "X";

    const cacheFile = path.join(
        CACHE_DIR,
        `${requestedIso}_${type}_sectors_2021.json`
    );

    // ✅ Cache
    if (fs.existsSync(cacheFile)) {
        console.log(`Cache HIT sectors: ${requestedIso}`);
        return res.json(JSON.parse(fs.readFileSync(cacheFile, "utf-8")));
    }

    try {
        console.log(`Fetching sectors: ${requestedIso}`);

        const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterM49}&period=2021&flowCode=${flowCode}`;

        const response = await fetch(url, {
            headers: {
                "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY
            }
        });

        const json = await response.json();

        if (!json.data || !Array.isArray(json.data)) {
            return res.json([]);
        }

        // Step 1: Aggregate by HS code (2-digit)
        const sectorMap = {};

        json.data.forEach(item => {
            const code = item.cmdCode?.slice(0, 2);
            if (!code) return;

            if (!sectorMap[code]) {
                sectorMap[code] = 0;
            }

            sectorMap[code] += item.primaryValue;
        });

        // Step 2: Group into sectors
        const grouped = {
            agriculture: 0,
            raw_materials: 0,
            chemicals: 0,
            manufacturing: 0,
            other: 0
        };

        Object.entries(sectorMap).forEach(([code, value]) => {
            let found = false;

            for (const group in sectorGroups) {
                if (sectorGroups[group].includes(code)) {
                    grouped[group] += value;
                    found = true;
                    break;
                }
            }

            if (!found) {
                grouped.other += value;
            }
        });

        // Step 3: Convert to %
        const total = Object.values(grouped)
            .reduce((sum, val) => sum + val, 0);

        const result = Object.entries(grouped)
            .map(([sector, value]) => ({
                sector,
                value: total ? (value / total) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        fs.writeFileSync(cacheFile, JSON.stringify(result));

        res.json(result);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch trade sectors" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

// 🌍 FALLBACK
const getMirrorData = async (reporterM49, type = "exports") => {
    const flowCode = type === "imports" ? "X" : "M";

    const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?partnerCode=${reporterM49}&period=2021&cmdCode=TOTAL&flowCode=${flowCode}`;

    const response = await fetch(url, {
        headers: {
            "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY,
        },
    });

    const json = await response.json();

    if (!json.data || !Array.isArray(json.data)) {
        return null;
    }

    const partnerMap = {};

    json.data.forEach((item) => {
        const reporterCode = item.reporterCode;
        if (!reporterCode || reporterCode === 0) return;

        const iso = m49ToIso[reporterCode];
        if (!iso) return;

        if (!partnerMap[iso]) {
            partnerMap[iso] = 0;
        }

        partnerMap[iso] += item.primaryValue;
    });

    const total = Object.values(partnerMap).reduce(
        (sum, val) => sum + val,
        0
    );

    return Object.entries(partnerMap)
        .map(([iso, value]) => ({
            country: iso,
            value: total ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);
};