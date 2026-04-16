const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "../cache");

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

exports.getCache = (key) => {
    const file = path.join(CACHE_DIR, key + ".json");
    if (!fs.existsSync(file)) return null;

    return JSON.parse(fs.readFileSync(file, "utf-8"));
};

exports.setCache = (key, data) => {
    const file = path.join(CACHE_DIR, key + ".json");
    fs.writeFileSync(file, JSON.stringify(data));
};