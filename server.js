const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

// ✅ Load JSON file instead of hardcoding
const isoToM49 = JSON.parse(
    fs.readFileSync(path.join(__dirname, "isoToM49.json"), "utf-8")
);

// Reverse lookup dictionary
const m49ToIso = Object.fromEntries(
    Object.entries(isoToM49).map(([iso, m49]) => [m49, iso])
);

app.get('/trade-partners', async (req, res) => {
    const requestedIso = req.query.country;
    const reporterM49 = isoToM49[requestedIso];

    if (!reporterM49) {
        console.warn(`No M49 mapping for ${requestedIso}`);
        return res.json([]); 
    }

    try {
        const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporterM49}&flowCode=X&cmdCode=TOTAL&period=2022`;

        const response = await fetch(url);
        const json = await response.json();

        if (!json.data || !Array.isArray(json.data)) {
            return res.json([]);
        }

        const topPartners = json.data
            .filter(item => item.partnerCode !== 0)
            .map(item => ({
                m49: item.partnerCode,
                iso: m49ToIso[item.partnerCode],
                value: item.primaryValue
            }))
            .filter(item => item.iso)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const formattedResponse = topPartners.map(p => ({
            country: p.iso,
            value: p.value
        }));

        res.json(formattedResponse);

    } catch (error) {
        console.error("Error fetching Comtrade data:", error);
        res.status(500).json({ error: "Failed to fetch trade data" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});