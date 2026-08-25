const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { calculateShippingFee } = require("./shipping_rates");

const database = new DatabaseSync(path.join(__dirname, "oserp.sqlite"));

database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        product TEXT NOT NULL,
        cover TEXT NOT NULL,
        designs TEXT NOT NULL,
        price REAL NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        shipping TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Processing',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
        order_id TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        product TEXT NOT NULL,
        cover TEXT NOT NULL,
        designs TEXT NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_categories (
        product TEXT PRIMARY KEY,
        category INTEGER NOT NULL DEFAULT 1
    );
`);

database.prepare(`
    INSERT OR IGNORE INTO product_categories (product, category)
    VALUES ('product_name_1', 1)
`).run();
database.prepare("DELETE FROM product_categories WHERE product = 'A5 140 GSM Customizeable Notebook'").run();

database.prepare(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES ('freeMetroManilaShipping', 'true')
`).run();

if (!database.prepare("PRAGMA table_info(cart_items)").all().some((column) => column.name === "quantity")) {
    database.exec("ALTER TABLE cart_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
}
if (!database.prepare("PRAGMA table_info(order_items)").all().some((column) => column.name === "quantity")) {
    database.exec("ALTER TABLE order_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
}
if (!database.prepare("PRAGMA table_info(cart_items)").all().some((column) => column.name === "product_id")) {
    database.exec("ALTER TABLE cart_items ADD COLUMN product_id TEXT");
    database.exec("UPDATE cart_items SET product_id = product WHERE product_id IS NULL");
}
if (!database.prepare("PRAGMA table_info(order_items)").all().some((column) => column.name === "product_id")) {
    database.exec("ALTER TABLE order_items ADD COLUMN product_id TEXT");
    database.exec("UPDATE order_items SET product_id = product WHERE product_id IS NULL");
}

function mapCartItem(row) {
    return {
        id: row.id,
        product: row.product,
        productId: row.product_id || row.product,
        cover: row.cover,
        designs: JSON.parse(row.designs),
        price: row.price,
        quantity: Math.max(1, Number(row.quantity) || 1),
        packagingCategory: getProductCategory(row.product_id || row.product)
    };
}

function getCart(sessionId) {
    return database.prepare(`
        SELECT id, product, product_id, cover, designs, price, quantity
        FROM cart_items
        WHERE session_id = ?
        ORDER BY id
    `).all(sessionId).map(mapCartItem);
}

function addCartItem(sessionId, item) {
    const result = database.prepare(`
        INSERT INTO cart_items (session_id, product, product_id, cover, designs, price, quantity, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        sessionId,
        item.product,
        item.productId || item.product,
        item.cover,
        JSON.stringify(item.designs),
        item.price,
        Math.max(1, Number(item.quantity) || 1),
        new Date().toISOString()
    );

    return getCartItem(result.lastInsertRowid);
}

function getCartItem(itemId) {
    const row = database.prepare(`
        SELECT id, product, product_id, cover, designs, price, quantity
        FROM cart_items
        WHERE id = ?
    `).get(itemId);
    return row ? mapCartItem(row) : null;
}

function updateCartItemQuantity(sessionId, itemId, quantity) {
    const result = database.prepare(`
        UPDATE cart_items
        SET quantity = ?
        WHERE session_id = ? AND id = ?
    `).run(quantity, sessionId, itemId);
    return result.changes > 0 ? getCartItem(itemId) : null;
}

function removeCartItem(sessionId, itemId) {
    const result = database.prepare(`
        DELETE FROM cart_items
        WHERE session_id = ? AND id = ?
    `).run(sessionId, itemId);
    return result.changes > 0;
}

function getSetting(key) {
    const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    database.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
}

function getProductCategory(product) {
    const row = database.prepare("SELECT category FROM product_categories WHERE product = ?").get(product);
    return row ? row.category : 1;
}

function hasProductCategory(product) {
    return database.prepare("SELECT 1 FROM product_categories WHERE product = ?").get(product) !== undefined;
}

function listProductCategories() {
    return database.prepare("SELECT product, category FROM product_categories ORDER BY product").all();
}

function setProductCategory(product, category) {
    database.prepare(`
        INSERT INTO product_categories (product, category) VALUES (?, ?)
        ON CONFLICT(product) DO UPDATE SET category = excluded.category
    `).run(product, category);
}

function deleteProductCategory(product) {
    return database.prepare("DELETE FROM product_categories WHERE product = ?").run(product).changes > 0;
}

function createOrder(sessionId, itemIds, shipping, settings = {}) {
    const placeholders = itemIds.map(() => "?").join(", ");
    const selectedItems = database.prepare(`
        SELECT id, product, product_id, cover, designs, price, quantity
        FROM cart_items
        WHERE session_id = ? AND id IN (${placeholders})
        ORDER BY id
    `).all(sessionId, ...itemIds).map(mapCartItem);

    if (selectedItems.length !== itemIds.length || selectedItems.length === 0) {
        return null;
    }

    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replaceAll("-", "");
    const sequence = database.prepare(`
        SELECT COUNT(*) AS count
        FROM orders
        WHERE order_id LIKE ?
    `).get(`OS-${datePart}-%`).count + 1;
    const orderId = `OS-${datePart}-${String(sequence).padStart(3, "0")}`;
    const subtotal = Number(selectedItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0).toFixed(2));
    const freeMetroManilaShipping = settings.freeMetroManilaShipping !== false;
    const productCategories = Object.fromEntries(listProductCategories().map((item) => [item.product, item.category]));
    const shippingFee = calculateShippingFee(shipping, selectedItems, { freeMetroManila: freeMetroManilaShipping, productCategories });
    const total = Number((subtotal + shippingFee).toFixed(2));
    const orderShipping = { ...shipping, shippingFee, freeMetroManilaShipping };
    const order = {
        orderId,
        items: selectedItems,
        shipping: orderShipping,
        subtotal,
        shippingFee,
        total,
        status: "Processing",
        createdAt: date.toISOString()
    };

    database.exec("BEGIN");
    try {
        database.prepare(`
            INSERT INTO orders (order_id, shipping, total, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(orderId, JSON.stringify(orderShipping), total, order.status, order.createdAt);

        const insertItem = database.prepare(`
            INSERT INTO order_items (order_id, item_id, product, product_id, cover, designs, price, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        selectedItems.forEach((item) => {
            insertItem.run(
                orderId,
                item.id,
                item.product,
                item.productId,
                item.cover,
                JSON.stringify(item.designs),
                item.price,
                item.quantity
            );
        });

        const deleteItems = database.prepare(`
            DELETE FROM cart_items
            WHERE session_id = ? AND id IN (${placeholders})
        `);
        deleteItems.run(sessionId, ...itemIds);
        database.exec("COMMIT");
    } catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }

    return order;
}

function getOrder(orderId) {
    const row = database.prepare(`
        SELECT order_id, shipping, total, status, created_at
        FROM orders
        WHERE order_id = ?
    `).get(orderId);
    if (!row) {
        return null;
    }

    const items = database.prepare(`
        SELECT item_id AS id, product, cover, designs, price, quantity
        FROM order_items
        WHERE order_id = ?
        ORDER BY rowid
    `).all(orderId).map(mapCartItem);

    const subtotal = Number(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0).toFixed(2));
    const shipping = JSON.parse(row.shipping);
    return {
        orderId: row.order_id,
        items,
        shipping,
        subtotal,
        shippingFee: Number(shipping.shippingFee || 0),
        total: row.total,
        status: row.status,
        createdAt: row.created_at
    };
}

function listOrders() {
    return database.prepare(`
        SELECT order_id, shipping, total, status, created_at
        FROM orders
        ORDER BY created_at DESC
    `).all().map((row) => ({
        orderId: row.order_id,
        shipping: JSON.parse(row.shipping),
        total: row.total,
        status: row.status,
        createdAt: row.created_at,
        itemCount: database.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?").get(row.order_id).count
    }));
}

function updateOrderStatus(orderId, status) {
    const result = database.prepare(`
        UPDATE orders
        SET status = ?
        WHERE order_id = ?
    `).run(status, orderId);
    return result.changes > 0;
}

function deleteOrder(orderId) {
    database.exec("BEGIN");
    try {
        database.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
        const result = database.prepare("DELETE FROM orders WHERE order_id = ?").run(orderId);
        database.exec("COMMIT");
        return result.changes > 0;
    } catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}

module.exports = {
    addCartItem,
    updateCartItemQuantity,
    getSetting,
    setSetting,
    getProductCategory,
    hasProductCategory,
    listProductCategories,
    setProductCategory,
    deleteProductCategory,
    createOrder,
    deleteOrder,
    getCart,
    getOrder,
    listOrders,
    removeCartItem,
    updateOrderStatus
};
