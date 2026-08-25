(function() {
    const scrollers = document.querySelectorAll(
        ".highlight_container, .formats_container"
    );

    scrollers.forEach(function(scroller) {
        let isDragging = false;
        let hasDragged = false;
        let startX = 0;
        let startScrollLeft = 0;

        scroller.querySelectorAll("img").forEach(function(image) {
            image.draggable = false;
            image.addEventListener("dragstart", function(event) {
                event.preventDefault();
            });
        });

        scroller.addEventListener("mousedown", function(event) {
            if (event.button !== 0) return;

            isDragging = true;
            hasDragged = false;
            startX = event.pageX;
            startScrollLeft = scroller.scrollLeft;
            scroller.classList.add("is_mouse_dragging");
        });

        document.addEventListener("mousemove", function(event) {
            if (!isDragging) return;

            const distance = event.pageX - startX;

            if (Math.abs(distance) > 5) {
                hasDragged = true;
            }

            scroller.scrollLeft = startScrollLeft - distance;
        });

        document.addEventListener("mouseup", function() {
            if (!isDragging) return;

            isDragging = false;
            scroller.classList.remove("is_mouse_dragging");

            if (hasDragged) {
                scroller.classList.add("suppress_next_click");
                window.setTimeout(function() {
                    scroller.classList.remove("suppress_next_click");
                }, 0);
            }
        });

        scroller.addEventListener("click", function(event) {
            if (scroller.classList.contains("suppress_next_click")) {
                event.preventDefault();
                event.stopPropagation();
                scroller.classList.remove("suppress_next_click");
            }
        }, true);
    });
})();
