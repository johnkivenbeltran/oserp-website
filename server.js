const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const database = require("./database");
const { calculateShippingFee, getItemCount } = require("./shipping_rates");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const adminSessions = new Set();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ORDER_STATUSES = ["Processing", "Shipped", "Delivered", "Cancelled"];
const SMTP_USER = process.env.SMTP_USER || "johnkivenbeltran@gmail.com";
const SMTP_PASS = process.env.SMTP_PASS || "";
const mailTransport = SMTP_PASS ? nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    }
}) : null;
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
};

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify(payload));
}

function getSessionId(request, response) {
    const cookies = Object.fromEntries(
        (request.headers.cookie || "")
            .split(";")
            .filter(Boolean)
            .map((cookie) => {
                const separator = cookie.indexOf("=");
                return [
                    cookie.slice(0, separator).trim(),
                    cookie.slice(separator + 1).trim()
                ];
            })
    );

    if (cookies.oserp_session && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cookies.oserp_session)) {
        return cookies.oserp_session;
    }

    const sessionId = crypto.randomUUID();
    response.setHeader("Set-Cookie", `oserp_session=${sessionId}; Path=/; SameSite=Lax; HttpOnly`);
    return sessionId;
}

function getCart(request, response) {
    const sessionId = getSessionId(request, response);
    return { sessionId, items: database.getCart(sessionId) };
}

function getAdminToken(request) {
    const authorization = request.headers.authorization || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function isAdmin(request) {
    return adminSessions.has(getAdminToken(request));
}

function isLocalRequest(request) {
    const host = (request.headers.host || "").split(":")[0].toLowerCase();
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(host);
    const localAddress = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        request.socket.remoteAddress
    );

    return localHost && localAddress;
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";

        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 100000) {
                reject(new Error("Request body is too large."));
                request.destroy();
            }
        });

        request.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error("Request body must be valid JSON."));
            }
        });

        request.on("error", reject);
    });
}

function isValidEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeEmailHTML(value) {
    return String(value == null ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function sendOrderEmail(order) {
    if (!mailTransport) {
        return { sent: false, reason: "Email service is not configured." };
    }

    const itemRows = order.items.map((item) => {
        const designs = Object.entries(item.designs)
            .map(([design, quantity]) => `${escapeEmailHTML(design)} x ${quantity}`)
            .join(", ");
        return `<li><strong>${escapeEmailHTML(item.product)}</strong><br>${escapeEmailHTML(item.cover)} | ${designs} | ${item.quantity} unit(s) | ₱${(Number(item.price) * item.quantity).toFixed(2)}</li>`;
    }).join("");

    await mailTransport.sendMail({
        from: `OSERP <${SMTP_USER}>`,
        to: order.shipping.email,
        subject: `Your OSERP order #${order.orderId}`,
        text: [
            `Order ID: #${order.orderId}`,
            `Name: ${order.shipping.name}`,
            `Contact: ${order.shipping.contact}`,
            `Shipping fee: ₱${Number(order.shipping.shippingFee || 0).toFixed(2)}`,
            `Total: ₱${Number(order.total).toFixed(2)}`,
            "",
            ...order.items.map((item) => `${item.product} - ${item.cover} - ${item.quantity} unit(s) - ₱${(Number(item.price) * item.quantity).toFixed(2)}`)
        ].join("\n"),
        html: `<h2>OSERP Order Confirmation</h2><p><strong>Order ID:</strong> #${escapeEmailHTML(order.orderId)}</p><p><strong>Name:</strong> ${escapeEmailHTML(order.shipping.name)}<br><strong>Contact:</strong> ${escapeEmailHTML(order.shipping.contact)}</p><h3>Items</h3><ul>${itemRows}</ul><p><strong>Shipping fee:</strong> ₱${Number(order.shipping.shippingFee || 0).toFixed(2)}<br><strong>Total: ₱${Number(order.total).toFixed(2)}</strong></p>`
    });

    return { sent: true };
}

function normalizeDesigns(designs) {
    if (!designs || typeof designs !== "object" || Array.isArray(designs)) {
        return null;
    }

    const normalized = {};
    for (const [name, quantity] of Object.entries(designs)) {
        const parsedQuantity = Number(quantity);
        if (!/^Design \d+$/.test(name) || !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 99) {
            return null;
        }
        normalized[name] = parsedQuantity;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
}

function createNotebookItem(payload) {
    const productId = typeof payload.productId === "string" ? payload.productId.trim() : "";
    const product = typeof payload.product === "string" ? payload.product.trim() : productId;
    const cover = typeof payload.cover === "string" && /^Cover [1-3]$/.test(payload.cover.trim());
    const designs = normalizeDesigns(payload.designs);

    if (!/^product_name_\d+$/.test(productId) || !product || !cover || !designs) {
        return null;
    }

    const designCount = Object.values(designs).reduce((total, quantity) => total + quantity, 0);
        return {
            id: Date.now() + Math.floor(Math.random() * 1000),
            product: product.trim(),
            cover: payload.cover.trim(),
            designs,
            price: designCount * 3.5,
            quantity: 1
        };
}

function serveStatic(request, response) {
    const requestedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
    const filePath = path.resolve(ROOT, relativePath);

    if (!filePath.startsWith(ROOT + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(error.code === "ENOENT" ? 404 : 500);
            response.end(error.code === "ENOENT" ? "Not found" : "Server error");
            return;
        }

        response.writeHead(200, {
            "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        });
        response.end(content);
    });
}

const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin || "*");
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

    if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const cartMatch = requestUrl.pathname.match(/^\/api\/cart(?:\/(\d+))?$/);
    const orderMatch = requestUrl.pathname.match(/^\/api\/orders\/([^/]+)$/);
    const usesCart = cartMatch || requestUrl.pathname === "/api/checkout/preview" || requestUrl.pathname === "/api/orders";
    const cartContext = usesCart ? getCart(request, response) : null;
    const cart = cartContext ? cartContext.items : null;

    try {
        if (request.method === "GET" && cartMatch && !cartMatch[1]) {
            sendJson(response, 200, { success: true, items: cart });
            return;
        }

        if (request.method === "POST" && cartMatch && !cartMatch[1]) {
            const item = createNotebookItem(await readBody(request));
            if (!item) {
                sendJson(response, 400, { success: false, message: "Use a valid product ID such as product_name_1 and provide a valid notebook selection." });
                return;
            }
            const savedItem = database.addCartItem(cartContext.sessionId, item);
            sendJson(response, 201, { success: true, item: savedItem });
            return;
        }

        if (request.method === "DELETE" && cartMatch && cartMatch[1]) {
            const itemId = Number(cartMatch[1]);
            if (!database.removeCartItem(cartContext.sessionId, itemId)) {
                sendJson(response, 404, { success: false, message: "Cart item not found." });
                return;
            }
            sendJson(response, 200, { success: true, items: database.getCart(cartContext.sessionId) });
            return;
        }

        if (request.method === "PATCH" && cartMatch && cartMatch[1]) {
            const quantity = Number((await readBody(request)).quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                sendJson(response, 400, { success: false, message: "Quantity must be between 1 and 99." });
                return;
            }
            const item = database.updateCartItemQuantity(cartContext.sessionId, Number(cartMatch[1]), quantity);
            if (!item) {
                sendJson(response, 404, { success: false, message: "Cart item not found." });
                return;
            }
            sendJson(response, 200, { success: true, item });
            return;
        }

        if (request.method === "POST" && requestUrl.pathname === "/api/checkout/preview") {
            const body = await readBody(request);
            const ids = Array.isArray(body.cartItemIds) ? body.cartItemIds.map(Number) : [];
            const selectedItems = cart.filter((item) => ids.includes(item.id));
            if (selectedItems.length !== ids.length || selectedItems.length === 0) {
                sendJson(response, 400, { success: false, message: "Select valid cart items." });
                return;
            }
            const subtotal = Number(selectedItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0).toFixed(2));
            sendJson(response, 200, { success: true, items: selectedItems, subtotal, total: subtotal, itemCount: getItemCount(selectedItems) });
            return;
        }

        if (request.method === "POST" && requestUrl.pathname === "/api/orders") {
            const body = await readBody(request);
            const ids = Array.isArray(body.cartItemIds) ? body.cartItemIds.map(Number) : [];
            const shipping = body.shipping;
            const selectedItems = cart.filter((item) => ids.includes(item.id));

            if (selectedItems.length !== ids.length || selectedItems.length === 0) {
                sendJson(response, 400, { success: false, message: "Select valid cart items." });
                return;
            }

            if (!shipping || typeof shipping !== "object" || !shipping.name || !shipping.email || !shipping.contact || !shipping.region || !shipping.city || !shipping.barangay || !shipping.street || !shipping.house_number || !shipping.postal) {
                sendJson(response, 400, { success: false, message: "Complete shipping details are required." });
                return;
            }

            if (!isValidEmail(shipping.email)) {
                sendJson(response, 400, { success: false, message: "Enter a valid email address." });
                return;
            }

            const order = database.createOrder(cartContext.sessionId, ids, shipping, {
                freeMetroManilaShipping: database.getSetting("freeMetroManilaShipping") !== "false"
            });
            let emailResult;
            try {
                emailResult = await sendOrderEmail(order);
            } catch (emailError) {
                console.error("ORDER EMAIL ERROR:", emailError);
                emailResult = { sent: false, reason: "Email could not be sent." };
            }

            sendJson(response, 201, { success: true, order, email: emailResult });
            return;
        }

        if (request.method === "GET" && requestUrl.pathname === "/api/shipping-settings") {
            sendJson(response, 200, {
                success: true,
                freeMetroManilaShipping: database.getSetting("freeMetroManilaShipping") !== "false"
            });
            return;
        }

        if (request.method === "GET" && orderMatch) {
            const order = database.getOrder(decodeURIComponent(orderMatch[1]).replace(/^#/, ""));
            if (!order) {
                sendJson(response, 404, { success: false, message: "Order not found." });
                return;
            }
            sendJson(response, 200, { success: true, order });
            return;
        }

        if (request.method === "POST" && requestUrl.pathname === "/api/admin/login") {
            if (!isLocalRequest(request)) {
                sendJson(response, 404, { success: false, message: "Not found." });
                return;
            }
            const body = await readBody(request);
            if (body.password !== ADMIN_PASSWORD) {
                sendJson(response, 401, { success: false, message: "Invalid admin password." });
                return;
            }
            const token = crypto.randomUUID();
            adminSessions.add(token);
            sendJson(response, 200, { success: true, token });
            return;
        }

        if (request.method === "GET" && requestUrl.pathname === "/api/admin/orders") {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            sendJson(response, 200, { success: true, orders: database.listOrders() });
            return;
        }

        if (request.method === "GET" && requestUrl.pathname === "/api/admin/products") {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            sendJson(response, 200, { success: true, products: database.listProductCategories() });
            return;
        }

        if (request.method === "POST" && requestUrl.pathname === "/api/admin/products") {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            const body = await readBody(request);
            const product = typeof body.product === "string" ? body.product.trim() : "";
            const category = Number(body.category);
            if (!product || !Number.isInteger(category) || ![1, 2, 3].includes(category)) {
                sendJson(response, 400, { success: false, message: "Enter a product name and category 1, 2, or 3." });
                return;
            }
            database.setProductCategory(product, category);
            sendJson(response, 201, { success: true, product, category });
            return;
        }

        const adminProductMatch = requestUrl.pathname.match(/^\/api\/admin\/products\/(.+)$/);
        if (request.method === "DELETE" && adminProductMatch) {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            const product = decodeURIComponent(adminProductMatch[1]);
            if (!database.deleteProductCategory(product)) {
                sendJson(response, 404, { success: false, message: "Product category not found." });
                return;
            }
            sendJson(response, 200, { success: true });
            return;
        }

        if (request.method === "PATCH" && requestUrl.pathname === "/api/admin/shipping-settings") {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            const body = await readBody(request);
            if (typeof body.freeMetroManilaShipping !== "boolean") {
                sendJson(response, 400, { success: false, message: "A valid shipping setting is required." });
                return;
            }
            database.setSetting("freeMetroManilaShipping", body.freeMetroManilaShipping);
            sendJson(response, 200, { success: true, freeMetroManilaShipping: body.freeMetroManilaShipping });
            return;
        }

        const adminOrderMatch = requestUrl.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
        if (request.method === "DELETE" && adminOrderMatch) {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            const orderId = decodeURIComponent(adminOrderMatch[1]).replace(/^#/, "");
            if (!database.deleteOrder(orderId)) {
                sendJson(response, 404, { success: false, message: "Order not found." });
                return;
            }
            sendJson(response, 200, { success: true });
            return;
        }

        const adminStatusMatch = requestUrl.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        if (request.method === "PATCH" && adminStatusMatch) {
            if (!isLocalRequest(request) || !isAdmin(request)) {
                sendJson(response, 401, { success: false, message: "Admin authentication required." });
                return;
            }
            const body = await readBody(request);
            if (!ORDER_STATUSES.includes(body.status)) {
                sendJson(response, 400, { success: false, message: "Invalid order status." });
                return;
            }
            const orderId = decodeURIComponent(adminStatusMatch[1]).replace(/^#/, "");
            if (!database.updateOrderStatus(orderId, body.status)) {
                sendJson(response, 404, { success: false, message: "Order not found." });
                return;
            }
            sendJson(response, 200, { success: true, order: database.getOrder(orderId) });
            return;
        }

        if (request.method === "GET") {
            if (requestUrl.pathname === "/admin.html" && !isLocalRequest(request)) {
                response.writeHead(404);
                response.end("Not found");
                return;
            }
            serveStatic(request, response);
            return;
        }

        sendJson(response, 404, { success: false, message: "Route not found." });
    } catch (error) {
        sendJson(response, 400, { success: false, message: error.message || "Request failed." });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`OSERP server running at http://localhost:${PORT}`);
});
