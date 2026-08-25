(function() {
    const popup = document.createElement("div");
    popup.className = "app_popup";
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.innerHTML = `
        <div class="app_popup_panel">
            <button type="button" class="app_popup_close" aria-label="Close">&times;</button>
            <span class="material-symbols-rounded app_popup_icon">info</span>
            <p class="app_popup_message"></p>
            <div class="app_popup_actions">
                <button type="button" class="app_popup_cancel">Cancel</button>
                <button type="button" class="app_popup_ok">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    const message = popup.querySelector(".app_popup_message");
    const closeButtons = popup.querySelectorAll(".app_popup_close, .app_popup_cancel");
    let popupResult = null;
    let popupResolve = null;

    function closePopup(result) {
        popup.hidden = true;
        if (popupResolve) {
            popupResolve(result);
            popupResolve = null;
        }
    }

    window.showAppPopup = function(text, options) {
        message.textContent = text;
        popupResult = options && options.confirm ? false : true;
        popup.querySelector(".app_popup_cancel").hidden = !(options && options.confirm);
        popup.querySelector(".app_popup_ok").textContent = options && options.confirm ? "Remove" : "OK";
        popup.hidden = false;
        popup.querySelector(".app_popup_ok").focus();
        return new Promise(function(resolve) {
            popupResolve = resolve;
        });
    };

    closeButtons.forEach(function(button) {
        button.addEventListener("click", function() {
            closePopup(button.classList.contains("app_popup_ok"));
        });
    });

    popup.querySelector(".app_popup_ok").addEventListener("click", function() {
        closePopup(true);
    });

    popup.addEventListener("click", function(event) {
        if (event.target === popup) {
            closePopup(popupResult);
        }
    });

    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape" && !popup.hidden) {
            closePopup(false);
        }
    });
})();
