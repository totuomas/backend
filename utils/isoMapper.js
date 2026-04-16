const isoToM49 = require("../data/isoToM49.json");

const m49ToIso = Object.fromEntries(
    Object.entries(isoToM49).map(([iso, m49]) => [m49, iso])
);

module.exports = {
    isoToM49,
    m49ToIso
};