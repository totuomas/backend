const fetch = global.fetch || require("node-fetch");

const { getCache, setCache } = require("../utils/cache");
const { isoToM49, m49ToIso } = require("../utils/isoMapper");
const sectorGroups = require("../utils/sectorGroups");

// 🔥 Build fast lookup map once
const sectorLookup = {};
Object.entries(sectorGroups).forEach(([group, codes]) => {
    codes.forEach(code => {
        sectorLookup[code] = group;
    });
});

// 🌍 TRADE PARTNERS
exports.fetchTradePartners = async ({ country, type = "exports" }) => {
    const reporterM49 = isoToM49[country];
    if (!reporterM49) return [];

    const cacheKey = `${country}_${type}_partners_2023`;
    const cached = getCache(cacheKey);
    if (cached) {
        console.log("Cache HIT partners:", country);
        return cached;
    }

    const flowCode = type === "imports" ? "M" : "X";

    const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterM49}&period=2023&cmdCode=TOTAL&flowCode=${flowCode}`;

    try {
        console.log("Fetching partners:", country);

        const response = await fetch(url, {
            headers: {
                "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY
            }
        });

        const json = await response.json();

        // 🔁 Fallback if no data
        if (!json.data || !json.data.length) {
            return await getMirrorData(reporterM49, type);
        }

        const partnerMap = {};

        json.data.forEach(item => {
            if (item.partnerCode === 0) return;

            const iso = m49ToIso[item.partnerCode];
            if (!iso) return;

            partnerMap[iso] = (partnerMap[iso] || 0) + item.primaryValue;
        });

        const total = Object.values(partnerMap).reduce((a, b) => a + b, 0);

        const result = Object.entries(partnerMap)
            .map(([iso, value]) => ({
                country: iso,
                value: total ? (value / total) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        setCache(cacheKey, result);

        return result;

    } catch (err) {
        console.error("Partners error:", err);
        return [];
    }
};

// 📊 TRADE SECTORS
exports.fetchTradeSectors = async ({ country, type = "exports" }) => {
    const reporterM49 = isoToM49[country];
    if (!reporterM49) return [];

    const cacheKey = `${country}_${type}_sectors_2021`;
    const cached = getCache(cacheKey);
    if (cached) {
        console.log("Cache HIT sectors:", country);
        return cached;
    }

    const flowCode = type === "imports" ? "M" : "X";

    const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterM49}&period=2021&flowCode=${flowCode}`;

    try {
        console.log("Fetching sectors:", country);

        const response = await fetch(url, {
            headers: {
                "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY
            }
        });

        const json = await response.json();

        if (!json.data || !Array.isArray(json.data)) {
            return [];
        }

        const sectorMap = {};

        json.data.forEach(item => {
            const code = item.cmdCode?.slice(0, 2);
            if (!code) return;

            sectorMap[code] = (sectorMap[code] || 0) + item.primaryValue;
        });

        const grouped = {
            agriculture: 0,
            raw_materials: 0,
            chemicals: 0,
            manufacturing: 0,
            other: 0
        };

        Object.entries(sectorMap).forEach(([code, value]) => {
            const group = sectorLookup[code] || "other";
            grouped[group] += value;
        });

        const total = Object.values(grouped).reduce((a, b) => a + b, 0);

        const result = Object.entries(grouped)
            .map(([sector, value]) => ({
                sector,
                value: total ? (value / total) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        setCache(cacheKey, result);

        return result;

    } catch (err) {
        console.error("Sectors error:", err);
        return [];
    }
};

// 🔁 FALLBACK (mirror data) WITH RETRY ONLY HERE
const getMirrorData = async (reporterM49, type) => {
    const flowCode = type === "imports" ? "X" : "M";

    const url = `https://comtradeapi.un.org/data/v1/get/C/A/HS?partnerCode=${reporterM49}&period=2021&cmdCode=TOTAL&flowCode=${flowCode}`;

    const response = await fetch(url, {
        headers: {
            "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY
        }
    });
    
    if (response.status === 429) {
        return getMirrorData(reporterM49, type);
    }

    const json = await response.json();

    if (!json.data || !json.data.length) return null;

    const partnerMap = {};

    json.data.forEach(item => {
        const iso = m49ToIso[item.reporterCode];
        if (!iso) return;

        partnerMap[iso] = (partnerMap[iso] || 0) + item.primaryValue;
    });

    const total = Object.values(partnerMap).reduce((a, b) => a + b, 0);

    return Object.entries(partnerMap)
        .map(([iso, value]) => ({
            country: iso,
            value: total ? (value / total) * 100 : 0
        }))
        .sort((a, b) => b.value - a.value);
};