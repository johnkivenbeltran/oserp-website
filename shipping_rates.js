const REGION_RATES = {
    NCR: 60,
    CAR: 180,
    "Region I": 180,
    "Region II": 180,
    "Region III": 130,
    "Region IV-A": 120,
    "Region IV-B": 180,
    "Region V": 180,
    "Region VI": 250,
    "Region VII": 250,
    "Region VIII": 280,
    "Region IX": 300,
    "Region X": 300,
    "Region XI": 300,
    "Region XII": 300,
    "Region XIII": 300,
    BARMM: 320
};

const EXTRA_ITEM_BLOCK_SIZE = 8;
const EXTRA_ITEM_SURCHARGE_START = 10;
const EXTRA_ITEM_BLOCK_FEE = 50;
const CATEGORY_WEIGHTS = { 1: 1, 2: 0.5, 3: 0.25 };

function getItemCount(items, productCategories = {}) {
    return items.reduce((count, item) => {
        const category = Number(item.packagingCategory || productCategories[item.productId] || productCategories[item.product] || 1);
        const weight = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS[1];
        return count + Math.max(1, Number(item.quantity) || 1) * weight;
    }, 0);
}

function calculateShippingFee(shipping, items, options = {}) {
    const freeMetroManila = options.freeMetroManila !== false;
    const baseFee = freeMetroManila && shipping.region === "NCR" ? 0 : REGION_RATES[shipping.region] || 320;
    const itemCount = getItemCount(items, options.productCategories);
    const extraBlocks = Math.max(0, Math.ceil((itemCount - EXTRA_ITEM_SURCHARGE_START + 1) / EXTRA_ITEM_BLOCK_SIZE));

    return Number((baseFee + extraBlocks * EXTRA_ITEM_BLOCK_FEE).toFixed(2));
}

module.exports = {
    calculateShippingFee,
    getItemCount,
    REGION_RATES,
    CATEGORY_WEIGHTS
};