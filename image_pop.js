const zoomImages = document.querySelectorAll(".zoom_image");

const imagePopup = document.getElementById("imagePopup");
const popupImage = document.getElementById("popupImage");
const closePopup = document.querySelector(".close_popup");

const zoomIn = document.getElementById("zoomIn");
const zoomOut = document.getElementById("zoomOut");

let zoom = 1;
let posX = 0;
let posY = 0;

let dragging = false;
let startX = 0;
let startY = 0;


// ========================================
// PREVENT IMAGE DOWNLOAD / LONG PRESS
// ========================================

// Prevent right-click / long-press menu
zoomImages.forEach(function(image) {

    image.addEventListener("contextmenu", function(e) {
        e.preventDefault();
    });

    // Prevent dragging the image
    image.addEventListener("dragstart", function(e) {
        e.preventDefault();
    });

});


// Also protect the popup image
popupImage.addEventListener("contextmenu", function(e) {
    e.preventDefault();
});

popupImage.addEventListener("dragstart", function(e) {
    e.preventDefault();
});


// ========================================
// OPEN IMAGE
// ========================================

zoomImages.forEach(function(image) {

    image.addEventListener("click", function() {

        popupImage.src = image.src;

        zoom = 1;
        posX = 0;
        posY = 0;

        updateImage();

        imagePopup.style.display = "flex";

    });

});


// ========================================
// ZOOM IN
// ========================================

zoomIn.addEventListener("click", function() {

    zoom += 0.2;

    updateImage();

});


// ========================================
// ZOOM OUT
// ========================================

zoomOut.addEventListener("click", function() {

    zoom -= 0.2;

    if (zoom < 1) {

        zoom = 1;
        posX = 0;
        posY = 0;

    }

    updateImage();

});


// ========================================
// UPDATE IMAGE POSITION + SCALE
// ========================================

function updateImage() {

    popupImage.style.transform =
        `translate(${posX}px, ${posY}px) scale(${zoom})`;

}


// ========================================
// MOUSE DOWN
// ========================================

popupImage.addEventListener("mousedown", function(e) {

    if (zoom <= 1) return;

    dragging = true;

    startX = e.clientX - posX;
    startY = e.clientY - posY;

    popupImage.style.cursor = "grabbing";

});


// ========================================
// MOUSE MOVE
// ========================================

document.addEventListener("mousemove", function(e) {

    if (!dragging) return;

    posX = e.clientX - startX;
    posY = e.clientY - startY;

    updateImage();

});


// ========================================
// MOUSE UP
// ========================================

document.addEventListener("mouseup", function() {

    dragging = false;

    popupImage.style.cursor = "grab";

});

// ========================================
// TOUCH VARIABLES
// ========================================

let initialPinchDistance = 0;
let initialZoom = 1;


// ========================================
// TOUCH START
// ========================================

popupImage.addEventListener("touchstart", function(e) {

    // TWO FINGERS = PINCH ZOOM
    if (e.touches.length === 2) {

        dragging = false;

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        initialPinchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );

        initialZoom = zoom;

        return;
    }


    // ONE FINGER = PAN
    if (e.touches.length === 1 && zoom > 1) {

        const touch = e.touches[0];

        dragging = true;

        startX = touch.clientX - posX;
        startY = touch.clientY - posY;

    }

}, { passive: true });


// ========================================
// TOUCH MOVE
// ========================================

popupImage.addEventListener("touchmove", function(e) {

    // TWO FINGERS = PINCH ZOOM
    if (e.touches.length === 2) {

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );

        if (initialPinchDistance === 0) return;

        const scale =
            currentDistance / initialPinchDistance;

        zoom = initialZoom * scale;


        // LIMIT ZOOM
        if (zoom < 1) {
            zoom = 1;
        }

        if (zoom > 4) {
            zoom = 4;
        }


        // Reset position when completely zoomed out
        if (zoom === 1) {
            posX = 0;
            posY = 0;
        }

        updateImage();

        e.preventDefault();

        return;
    }


    // ONE FINGER = PAN
    if (e.touches.length === 1 && dragging) {

        const touch = e.touches[0];

        posX = touch.clientX - startX;
        posY = touch.clientY - startY;

        updateImage();

        e.preventDefault();

    }

}, { passive: false });


// ========================================
// TOUCH END
// ========================================

popupImage.addEventListener("touchend", function(e) {

    if (e.touches.length < 2) {
        initialPinchDistance = 0;
    }

    // If one finger remains after pinch,
    // allow it to continue as a pan.
    if (e.touches.length === 1 && zoom > 1) {

        const touch = e.touches[0];

        dragging = true;

        startX = touch.clientX - posX;
        startY = touch.clientY - posY;

    } else {

        dragging = false;

    }

});

// ========================================
// NOTEBOOK SELECTION
// ========================================

// Stores selected design quantities
const selectedDesigns = {};


// Stores currently selected cover
let selectedCover = null;
let selectedCoverImage = null;


// ========================================
// DESIGN SELECTION
// ========================================

const designProducts = document.querySelectorAll(
    ".formats_container:not(.covers_container) .slide_container"
);


designProducts.forEach(function(product) {

    const addCart = product.querySelector(".add_cart");
    const qtyContainer = product.querySelector(".qty_container");

    const minus = product.querySelector(".minus");
    const number = product.querySelector(".number");

    const plus = product.querySelector(".plus");

    const designName =
        product.querySelector(".design_text").textContent.trim();


    // ------------------------------------
    // ADD DESIGN
    // ------------------------------------

    addCart.addEventListener("click", function() {

        selectedDesigns[designName] = 1;

        number.textContent = "1";

        addCart.style.display = "none";
        qtyContainer.style.display = "flex";

        updateNotebookSummary();

    });


    // ------------------------------------
    // PLUS
    // ------------------------------------

    plus.addEventListener("click", function() {

        let qty = Number(number.textContent);

        qty++;

        number.textContent = qty;

        selectedDesigns[designName] = qty;

        updateNotebookSummary();

    });


    // ------------------------------------
    // MINUS
    // ------------------------------------

    minus.addEventListener("click", function() {

        let qty = Number(number.textContent);

        qty--;

        if (qty <= 0) {

            delete selectedDesigns[designName];

            number.textContent = "0";

            qtyContainer.style.display = "none";
            addCart.style.display = "flex";

        } else {

            number.textContent = qty;

            selectedDesigns[designName] = qty;

        }

        updateNotebookSummary();

    });

});


// ========================================
// COVER SELECTION
// ========================================

const coverProducts = document.querySelectorAll(
    ".covers_container .slide_container"
);


coverProducts.forEach(function(cover) {

    const addCover = cover.querySelector(".add_cart");

    const coverName =
        cover.querySelector(".design_text").textContent.trim();


    addCover.addEventListener("click", function() {

        // Remove previous cover selection
        coverProducts.forEach(function(otherCover) {

            otherCover.classList.remove("selected");

            const otherButton =
                otherCover.querySelector(".add_cart");

            otherButton.style.display = "flex";
            otherButton.textContent = "Add Cover";

        });


        // Select this cover
        cover.classList.add("selected");

        addCover.style.display = "flex";
        addCover.textContent = "Selected";

        selectedCover = coverName;
        selectedCoverImage = cover.querySelector(".zoom_image").getAttribute("src");

        updateNotebookSummary();

    });

});


function calculateNotebookPrice() {

    let totalPieces = 0;

    Object.values(selectedDesigns).forEach(function(quantity) {

        totalPieces += quantity;

    });

    return totalPieces * 3.5;

}

// ========================================
// UPDATE NOTEBOOK SUMMARY
// ========================================

function updateNotebookSummary() {

    const selectedCoverElement =
        document.getElementById("selectedCover");

    const selectedDesignsElement =
        document.getElementById("selectedDesigns");

    const selectedDesignsCountElement =
        document.getElementById("nbpSelectedDesigns");

    const notebookPriceElement =
        document.getElementById("nbpNotebookPrice");


    // ========================================
    // UPDATE COVER
    // ========================================

    if (selectedCover) {

        selectedCoverElement.innerHTML =
            `<span>Your Notebook ${selectedCover}</span>
            <img src="${selectedCoverImage}" alt="${selectedCover}">`;

    } else {

        selectedCoverElement.innerHTML =
            `No Cover Selected`;

    }


    // ========================================
    // CALCULATE TOTAL DESIGN PIECES
    // ========================================

    let totalPieces = 0;

    Object.values(selectedDesigns).forEach(function(quantity) {

        totalPieces += quantity;

    });


    // ========================================
    // UPDATE FINAL DESIGN COUNT
    // ========================================

    selectedDesignsCountElement.textContent =
        `${totalPieces} ${totalPieces === 1 ? "design" : "designs"} selected`;


    // ========================================
    // CALCULATE PRICE
    // ========================================

    const notebookPrice =
        totalPieces * 3.5;


    notebookPriceElement.textContent =
        `₱${notebookPrice.toFixed(2)}`;


    // ========================================
    // UPDATE DESIGN SUMMARY
    // ========================================

    selectedDesignsElement.innerHTML = "";

    const designNames =
        Object.keys(selectedDesigns);


    if (designNames.length === 0) {

        selectedDesignsElement.innerHTML = `
            <div class="summary_text">
                <p>No designs selected</p>
                <p>—</p>
            </div>
        `;

        return;
    }


    designNames.forEach(function(designName) {

        const quantity =
            selectedDesigns[designName];


        const row =
            document.createElement("div");

        row.classList.add("summary_text");


        row.innerHTML = `
            <p>${designName}</p>
            <p>${quantity}</p>
        `;


        selectedDesignsElement.appendChild(row);

    });

}


// ========================================
// CLOSE POPUP
// ========================================

closePopup.addEventListener("click", function() {

    imagePopup.style.display = "none";

});

// ========================================
// ADD NOTEBOOK TO CART
// ========================================

const addNotebookButton =
    document.getElementById("nbpAddNotebook");

const LOCAL_CART_KEY =
    "oserpCart";


addNotebookButton.addEventListener("click", async function () {

    // ------------------------------------
    // CHECK COVER
    // ------------------------------------

    if (!selectedCover) {

        showAppPopup("Please select a cover.");

        return;
    }


    // ------------------------------------
    // CHECK DESIGNS
    // ------------------------------------

    if (Object.keys(selectedDesigns).length === 0) {

        showAppPopup("Please select at least one design.");

        return;
    }


    // ------------------------------------
    // CREATE NOTEBOOK DATA
    // ------------------------------------

    const productElement = document.querySelector("[id^=\"product_name_\"]");
    const notebookData = {

    productId:
        productElement.id,

    product:
        productElement.textContent.trim(),

    cover:
        selectedCover,

    designs:
        selectedDesigns

};


    console.log("Sending notebook to server:");
    console.log(notebookData);


    // ------------------------------------
    // SEND TO BACKEND
    // ------------------------------------

    try {

        const response = await fetch(
    `${window.location.origin}/api/cart`,
    {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        credentials: "include",

        body: JSON.stringify(notebookData)
    }
);


        const result = await response.json();


        // --------------------------------
        // SERVER ERROR
        // --------------------------------

        if (!response.ok) {

            showAppPopup(result.message || "Failed to add notebook.");

            return;
        }


        // --------------------------------
        // SUCCESS
        // --------------------------------

        console.log("Server response:", result);

        localStorage.setItem(
            LOCAL_CART_KEY,
            JSON.stringify([result.item])
        );

        showAppPopup("Notebook added to cart!");

        window.location.href = "cart.html";

    } catch (error) {

        console.error("ADD NOTEBOOK ERROR:", error);

        const designCount =
            Object.values(selectedDesigns).reduce(
                function(total, quantity) {
                    return total + quantity;
                },
                0
            );

        const savedItems =
            JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || "[]");

        savedItems.push({
            id: Date.now(),
            product: "A5 140 GSM Customizeable Notebook",
            cover: selectedCover,
            designs: selectedDesigns,
            price: designCount * 3.5
        });

        localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(savedItems));

        showAppPopup(
            "Server unavailable. Notebook saved on this device."
        );

        window.location.href = "cart.html";

    }

});
