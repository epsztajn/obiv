(function () {
  function getApi() {
    return window.DocumentsCustomizeApi || null;
  }

  function showPanel(selector) {
    const panel = document.querySelector(selector);
    const root = document.getElementById("documents-panels");
    if (!panel || !root) return;
    root.classList.add("documents-panels--active");
    root.setAttribute("aria-hidden", "false");
    panel.classList.add("is-open");
    document.body.classList.add("documents-panel-open");
    if (selector === ".order_view") {
      document.body.classList.add("documents-order-open");
    }
  }

  function hidePanel(selector) {
    const panel = document.querySelector(selector);
    const root = document.getElementById("documents-panels");
    if (!panel) return;
    panel.classList.remove("is-open");
    if (selector === ".order_view") {
      document.body.classList.remove("documents-order-open");
    }
    const anyOpen = root && root.querySelector(".doc-panel.is-open");
    if (!anyOpen) {
      if (root) {
        root.classList.remove("documents-panels--active");
        root.setAttribute("aria-hidden", "true");
      }
      document.body.classList.remove("documents-panel-open");
      document.body.classList.remove("documents-order-open");
    }
  }

  function selectLayout(value) {
    document.querySelectorAll(".customize_view .option").forEach(function (opt) {
      opt.classList.toggle("selected", opt.dataset.option === value);
    });
    document.querySelectorAll('.customize_view input[name="doc_layout"]').forEach(
      function (input) {
        input.checked = input.value === value;
      },
    );
  }

  function saveLayoutSelection(value) {
    if (!value) return;
    try {
      localStorage.setItem("documents_layout", value);
    } catch (_) {}
  }

  function persistOrderFromList(list) {
    const api = getApi();
    if (!list || !api) return;
    const keys = Array.from(list.querySelectorAll("li[data-key]")).map(function (
      li,
    ) {
      return li.getAttribute("data-key");
    });
    if (!keys.length) return;
    api.setVisibleOrder(keys);
  }

  function populateOrder() {
    const list = document.querySelector(".order_view .order_list");
    const api = getApi();
    if (!list || !api) return;

    if (list._orderPointerHandlers) {
      document.removeEventListener("pointermove", list._orderPointerHandlers.move);
      document.removeEventListener("pointerup", list._orderPointerHandlers.end);
      document.removeEventListener("pointercancel", list._orderPointerHandlers.end);
      delete list._orderPointerHandlers;
    }

    list.innerHTML = "";
    const order = api.getVisibleOrder();

    order.forEach(function (docId) {
      const doc = api.getDoc(docId);
      if (!doc) return;

      const li = document.createElement("li");
      li.setAttribute("data-key", docId);
      li.className = "order_item";
      li.setAttribute("draggable", "true");

      const imgWrap = document.createElement("div");
      const img = document.createElement("img");
      img.src = doc.image;
      img.alt = doc.title;
      imgWrap.appendChild(img);

      const textWrap = document.createElement("div");
      textWrap.className = "order_item_text";
      const title = document.createElement("div");
      title.className = "order_item_title";
      title.textContent = doc.title;
      const hint = document.createElement("div");
      hint.className = "order_item_hint";
      hint.textContent = "Przytrzymaj i przeciągnij";
      textWrap.appendChild(title);
      textWrap.appendChild(hint);

      const handle = document.createElement("div");
      handle.className = "order_drag_handle";
      handle.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 6; i++) {
        handle.appendChild(document.createElement("span"));
      }

      li.appendChild(imgWrap);
      li.appendChild(textWrap);
      li.appendChild(handle);
      list.appendChild(li);
    });

    initOrderDrag(list);
  }

  function initOrderDrag(list) {
    let dragged = null;
    let placeholder = null;
    let pointerId = null;
    let startOffsetY = 0;

    function cleanupPointerDrag() {
      if (!dragged) return;
      dragged.classList.remove("dragging");
      dragged.style.position = "";
      dragged.style.left = "";
      dragged.style.top = "";
      dragged.style.width = "";
      dragged.style.pointerEvents = "";
      dragged.style.cursor = "grab";
      dragged.style.transform = "";
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(dragged, placeholder);
        placeholder.remove();
      }
      dragged = null;
      placeholder = null;
      pointerId = null;
    }

    function getDragAfterElement(container, clientY) {
      const items = Array.from(
        container.querySelectorAll(".order_item:not(.dragging)"),
      );
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      items.forEach(function (child) {
        const box = child.getBoundingClientRect();
        const offset = clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          closest = { offset: offset, element: child };
        }
      });
      return closest.element;
    }

    function startPointerDrag(event, li) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const rect = li.getBoundingClientRect();
      dragged = li;
      pointerId = event.pointerId;
      startOffsetY = event.clientY - rect.top;
      placeholder = document.createElement("li");
      placeholder.className = "order_placeholder";
      placeholder.style.height = rect.height + "px";
      li.parentNode.insertBefore(placeholder, li.nextSibling);
      li.classList.add("dragging");
      li.style.position = "fixed";
      li.style.left = rect.left + "px";
      li.style.top = rect.top + "px";
      li.style.width = rect.width + "px";
      li.style.pointerEvents = "none";
      li.style.cursor = "grabbing";
      try {
        li.setPointerCapture(pointerId);
      } catch (_) {}
    }

    function movePointerDrag(event) {
      if (!dragged || event.pointerId !== pointerId) return;
      event.preventDefault();
      dragged.style.top = event.clientY - startOffsetY + "px";
      const afterElement = getDragAfterElement(list, event.clientY);
      if (!afterElement) {
        list.appendChild(placeholder);
      } else {
        list.insertBefore(placeholder, afterElement);
      }
    }

    function endPointerDrag(event) {
      if (!dragged || event.pointerId !== pointerId) return;
      cleanupPointerDrag();
      persistOrderFromList(list);
    }

    list.addEventListener("dragover", function (e) {
      e.preventDefault();
      const draggingEl = list.querySelector(".order_item.dragging") || dragged;
      if (!draggingEl) return;
      const afterElement = getDragAfterElement(list, e.clientY);
      if (!afterElement) {
        list.appendChild(draggingEl);
      } else {
        list.insertBefore(draggingEl, afterElement);
      }
    });

    list.querySelectorAll("li[data-key]").forEach(function (li) {
      li.addEventListener("dragstart", function (e) {
        dragged = li;
        li.classList.add("dragging");
        try {
          e.dataTransfer.effectAllowed = "move";
        } catch (_) {}
        try {
          e.dataTransfer.setData("text/plain", li.getAttribute("data-key"));
        } catch (_) {}
      });

      li.addEventListener("dragend", function () {
        li.classList.remove("dragging");
        dragged = null;
        persistOrderFromList(list);
      });

      li.addEventListener("pointerdown", function (e) {
        startPointerDrag(e, li);
      });
      li.addEventListener("pointermove", movePointerDrag);
      li.addEventListener("pointerup", endPointerDrag);
      li.addEventListener("pointercancel", endPointerDrag);
    });

    list._orderPointerHandlers = {
      move: movePointerDrag,
      end: endPointerDrag,
    };
    document.addEventListener("pointermove", list._orderPointerHandlers.move);
    document.addEventListener("pointerup", list._orderPointerHandlers.end);
    document.addEventListener("pointercancel", list._orderPointerHandlers.end);
  }

  document.addEventListener("DOMContentLoaded", function () {
    const openBtn = document.getElementById("customize-view-btn");
    if (openBtn) {
      openBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showPanel(".customize_view");
      });
    }

    const backCustomize = document.querySelector('[data-button="customize_back"]');
    if (backCustomize) {
      backCustomize.addEventListener("click", function (e) {
        e.preventDefault();
        hidePanel(".customize_view");
      });
    }

    document.querySelectorAll(".customize_view .option").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.preventDefault();
        const input = opt.querySelector('input[name="doc_layout"]');
        if (input) input.checked = true;
        selectLayout(opt.dataset.option);
      });
    });

    const saveCustomize = document.querySelector('[data-button="save_customize"]');
    if (saveCustomize) {
      saveCustomize.addEventListener("click", function (e) {
        e.preventDefault();
        const selected = document.querySelector(
          '.customize_view input[name="doc_layout"]:checked',
        );
        if (selected) {
          try {
            localStorage.setItem("documents_layout", selected.value);
          } catch (_) {}
        }
        hidePanel(".customize_view");
      });
    }

    try {
      const saved = localStorage.getItem("documents_layout") || "big";
      selectLayout(saved);
    } catch (_) {
      selectLayout("big");
    }

    const setOrderBtn = document.querySelector('[data-button="set_order"]');
    if (setOrderBtn) {
      setOrderBtn.addEventListener("click", function (e) {
        e.preventDefault();
        populateOrder();
        showPanel(".order_view");
      });
    }

    const orderBack = document.querySelector('[data-button="order_back"]');
    if (orderBack) {
      orderBack.addEventListener("click", function (e) {
        e.preventDefault();
        hidePanel(".order_view");
      });
    }

  });
})();
