/* ================================
   Lotus & Fire — Frontend Only App
================================== */

(function () {
  "use strict";

  const STATE = {
    menu: null,
    orderType: "delivery", // "delivery" | "pickup"
    search: "",
    openCategoryIndex: -1,
    cart: {}
  };

  const CART_KEY = "lf_cart_v1";

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

  // ==============================
// ✅ Store Hours (Lotus & Fire)
// Lunch: 12:00 PM – 3:30 PM
// Dinner: 7:00 PM – 12:00 AM
// ==============================
function getStoreStatus(now = new Date()) {
  const h = now.getHours();   // 0-23
  const m = now.getMinutes(); // 0-59
  const minutes = h * 60 + m;

  const LUNCH_START = 12 * 60;        // 12:00
  const LUNCH_END   = 15 * 60 + 30;   // 15:30
  const DINNER_START = 19 * 60;       // 19:00
  const DINNER_END   = 24 * 60;       // 24:00 (midnight)

  const isLunchOpen  = minutes >= LUNCH_START && minutes < LUNCH_END;
  const isDinnerOpen = minutes >= DINNER_START && minutes < DINNER_END;

  const isOpen = isLunchOpen || isDinnerOpen;

  let nextOpenText = "";
  if (minutes < LUNCH_START) nextOpenText = "Closed now — Opens at 12:00 PM";
  else if (minutes >= LUNCH_END && minutes < DINNER_START) nextOpenText = "Closed now — Opens at 7:00 PM";
  else nextOpenText = "Closed now — Opens at 12:00 PM";

  return { isOpen, nextOpenText, isLunchOpen, isDinnerOpen };
}

function updateStoreStatusLine() {
  const status = getStoreStatus();
  const el = document.getElementById("store-status");
  if (!el) return;

  if (status.isOpen) {
    el.textContent = "Open now — Orders accepted";
  } else {
    el.innerHTML = status.nextOpenText.replace(
      /(12:00 PM|7:00 PM)/,
      "<strong>$1</strong>"
    );
  }
}

function applyStoreButtonState() {
  const status = getStoreStatus();

  document.querySelectorAll("button").forEach(btn => {
    if (btn.textContent.trim() === "Add") {
      btn.disabled = !status.isOpen;
      btn.title = status.isOpen ? "" : status.nextOpenText;
    }
  });
}

function scheduleNextStoreRefresh() {
  // Update UI now
  updateStoreStatusLine();
  applyStoreButtonState();

  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const current = h * 3600 + m * 60 + s; // seconds since midnight

  // Store boundary times (in seconds)
  const LUNCH_START  = 12 * 3600;            // 12:00:00
  const LUNCH_END    = 15 * 3600 + 30 * 60;  // 15:30:00
  const DINNER_START = 19 * 3600;            // 19:00:00
  const DINNER_END   = 24 * 3600;            // 24:00:00 (midnight)

  const boundaries = [LUNCH_START, LUNCH_END, DINNER_START, DINNER_END];

  // Find next boundary today, else tomorrow lunch start
  let next = boundaries.find(t => t > current);
  if (next == null) next = LUNCH_START + 24 * 3600; // tomorrow 12:00

  // ms until next boundary + small buffer (1.2s) so clock ticks over
  const msUntil = (next - current) * 1000 + 1200;

  clearTimeout(window.__storeRefreshTimer);
  window.__storeRefreshTimer = setTimeout(scheduleNextStoreRefresh, msUntil);
}

  function money(n) {
    const v = Math.round(Number(n) || 0);
    return "₹" + v.toLocaleString("en-IN");
  }

  function normalize(s) {
    return String(s || "").toLowerCase().trim();
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      STATE.cart = raw ? JSON.parse(raw) : {};
    } catch (e) {
      STATE.cart = {};
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(STATE.cart));
  }

  function cartCount() {
    return Object.values(STATE.cart).reduce((sum, it) => sum + (it.qty || 0), 0);
  }

  function cartSubtotal() {
    return Object.values(STATE.cart).reduce((sum, it) => sum + (Number(it.price) * (it.qty || 0)), 0);
  }

  function normalSubtotal() {
    return Object.values(STATE.cart)
      .filter(it => !it.isOfferItem)
      .reduce((sum, it) => sum + (Number(it.price) * (it.qty || 0)), 0);
  }

  function offerSubtotal() {
    return Object.values(STATE.cart)
      .filter(it => it.isOfferItem)
      .reduce((sum, it) => sum + (Number(it.price) * (it.qty || 0)), 0);
  }

  function getDeliveryDiscountPercentForNormalItems(normalSub) {
    const slabs = (STATE.menu && STATE.menu.discounts && STATE.menu.discounts.deliverySlabs) ? STATE.menu.discounts.deliverySlabs : [];
    let best = 0;
    for (const s of slabs) {
      if (normalSub >= Number(s.minSubtotal) && Number(s.percent) > best) {
        best = Number(s.percent);
      }
    }
    return best;
  }

  function computeBill() {
  const gstPercent = Number(STATE.menu?.tax?.gstPercent || 0);

  const subTotal = cartSubtotal();
  const normalSub = normalSubtotal();
  const offerSub = offerSubtotal();

  let discount = 0;

  if (STATE.orderType === "delivery") {
    const pct = getDeliveryDiscountPercentForNormalItems(normalSub);
    discount = Math.round(normalSub * (pct / 100));
    // offer items do not get extra discount (already offer price)
  }

  const afterDiscount = Math.max(0, subTotal - discount);
  const gst = Math.round(afterDiscount * (gstPercent / 100));
  const total = afterDiscount + gst; // base total before delivery fee

  // ✅ Delivery Fee Rule: ₹50 only when Delivery AND total < 200
  let deliveryFee = 0;
  if (STATE.orderType === "delivery" && total < 200) {
    deliveryFee = 50;
  }

  const grandTotal = total + deliveryFee;

  return { subTotal, normalSub, offerSub, discount, gst, total, deliveryFee, grandTotal };
}

  function setupSplash() {
    const splash = qs("#splash");
    if (!splash) return;

    const KEY = "lf_splash_seen_session";
    const seen = sessionStorage.getItem(KEY);

    if (seen) {
      splash.classList.add("hidden");
      return;
    }

    splash.classList.remove("hidden");
    splash.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      splash.classList.add("fade");
      setTimeout(() => {
        splash.classList.add("hidden");
        splash.setAttribute("aria-hidden", "true");
        // sessionStorage.setItem(KEY, "1");  // TEMP: testing
      }, 350);
    }, 200);
  }

  window.addEventListener("load", setupSplash);

  async function loadMenu() {
    const res = await fetch("data/menu.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load data/menu.json");
    STATE.menu = await res.json();
  }

  function itemMatchesSearch(item) {
    const q = normalize(STATE.search);
    if (!q) return true;
    const hay = normalize(item.name + " " + (item.desc || ""));
    return hay.includes(q);
  }

  // ===============================
// ✅ Simple Toast (no HTML needed)
// ===============================
function toast(msg) {
  let el = document.getElementById("lf-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "lf-toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "12px";
    el.style.background = "rgba(18,26,39,0.92)";
    el.style.border = "1px solid rgba(255,255,255,0.12)";
    el.style.color = "#e9eef6";
    el.style.fontSize = "13px";
    el.style.zIndex = "9999";
    el.style.maxWidth = "90vw";
    el.style.textAlign = "center";
    el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    el.style.opacity = "0";
    el.style.transition = "opacity 180ms ease";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(window.__lfToastTimer);
  window.__lfToastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 2200);
}

  function addToCart(item, delta) {
    // ✅ Store Closed Guard (block add/remove when closed)
  const status = getStoreStatus();
  if (!status.isOpen) {
    alert(status.nextOpenText);
    return;
  }

  const id = String(item.id);
  const existing = STATE.cart[id];

  // ----------------------------
  // ✅ Today’s Offer Gate Helpers
  // ----------------------------
  const isOffer = !!item.isOfferItem;

  const regularCount = Object.values(STATE.cart).reduce(
    (sum, it) => sum + (!it.isOfferItem ? (it.qty || 0) : 0),
    0
  );

  const offerCount = Object.values(STATE.cart).reduce(
    (sum, it) => sum + (it.isOfferItem ? (it.qty || 0) : 0),
    0
  );

  // 1) Block: Offer cannot be added before any regular item
  if (isOffer && delta > 0 && regularCount === 0) {
    toast("Add any one regular menu item to unlock Today’s Offer.");
    return;
  }

  // 2) Block: Only 1 offer item per order (Option B)
  // Allow same offer item to be removed (-1), but block adding any offer if one is already present
  if (isOffer && delta > 0 && offerCount >= 1 && !existing) {
    toast("Today’s Offer already applied.");
    return;
  }

  // Normal guard
  if (!existing && delta < 0) return;

  // Create cart entry if missing
  if (!existing) {
    STATE.cart[id] = {
      id: String(item.id),
      name: item.name,
      desc: item.desc || "",
      veg: !!item.veg,
      image: item.image || "",
      isOfferItem: !!item.isOfferItem,
      originalPrice: item.originalPrice ?? null,
      offerPrice: item.offerPrice ?? null,
      price: Number(item.price) || 0,
      qty: 0
    };
  }

  // 3) Offer qty fixed: can only be 0 or 1
  if (isOffer) {
    const nextQty = (STATE.cart[id].qty || 0) + delta;

    // If trying to increase beyond 1, block softly
    if (delta > 0 && (STATE.cart[id].qty || 0) >= 1) {
      toast("Today’s Offer is limited to 1 item per order.");
      return;
    }

    // Set qty to 1 or remove to 0
    if (nextQty <= 0) {
      delete STATE.cart[id];
    } else {
      STATE.cart[id].qty = 1;
    }
  } else {
    // Regular item normal behaviour
    STATE.cart[id].qty += delta;
    if (STATE.cart[id].qty <= 0) delete STATE.cart[id];
  }

  // ✅ SECTION 3 will run here (auto-remove offer if no regular items)
  normalizeOfferRules();

  saveCart();
  renderTodayOffer();
  renderMenuAccordion();
  updateCartUI();
}

// ===============================
// ✅ Today’s Offer: Auto-remove rule
// If no regular items remain, remove offer item automatically.
// ===============================
function normalizeOfferRules() {
  const regularCount = Object.values(STATE.cart).reduce(
    (sum, it) => sum + (!it.isOfferItem ? (it.qty || 0) : 0),
    0
  );

  if (regularCount === 0) {
    const hadOffer = Object.values(STATE.cart).some(it => it.isOfferItem);
    if (hadOffer) {
      Object.keys(STATE.cart).forEach((k) => {
        if (STATE.cart[k]?.isOfferItem) delete STATE.cart[k];
      });
      toast("Today’s Offer removed. Add any regular item to unlock it again.");
    }
  }
}

  function makeQtyControls(item) {
  const row = document.createElement("div");
  row.className = "qtyrow";

  const isOffer = !!item.isOfferItem;
  const inCart = STATE.cart[String(item.id)]?.qty || 0;

  const regularCount = Object.values(STATE.cart).reduce(
    (sum, it) => sum + (!it.isOfferItem ? (it.qty || 0) : 0),
    0
  );

  const offerCount = Object.values(STATE.cart).reduce(
    (sum, it) => sum + (it.isOfferItem ? (it.qty || 0) : 0),
    0
  );

  const offerLocked = isOffer && regularCount === 0;
  const offerAlreadyAppliedElsewhere = isOffer && offerCount >= 1 && inCart <= 0;

  // ----------------------------
  // ✅ Offer item behaviour
  // ----------------------------
  if (isOffer) {
    // If not in cart yet, show Add (maybe disabled)
    if (inCart <= 0) {
      const add = document.createElement("button");
      add.className = "btn primary";
      add.textContent = "Add";

      if (offerLocked) {
        add.disabled = true;
        add.title = "Add any one regular item to unlock Today’s Offer.";
      } else if (offerAlreadyAppliedElsewhere) {
        add.disabled = true;
        add.title = "Today’s Offer already applied.";
      } else {
        add.addEventListener("click", (e) => {
          e.stopPropagation();
          addToCart(item, 1);
        });
      }

      row.appendChild(add);

      // Small helper text (premium, calm)
      const note = document.createElement("div");
      note.className = "muted";
      note.style.fontSize = "12px";
      note.style.marginTop = "6px";
      note.textContent = offerLocked
        ? "Add any one regular item to unlock."
        : (offerAlreadyAppliedElsewhere ? "Today’s Offer already applied." : "Limit: 1 Today’s Offer per order.");
      row.appendChild(note);

      return row;
    }

    // If offer is already in cart: show only Remove (no plus)
    const remove = document.createElement("button");
    remove.className = "qbtn";
    remove.textContent = "–";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCart(item, -1); // removes offer
    });

    const num = document.createElement("div");
    num.className = "qnum";
    num.textContent = String(inCart);

    // No plus for offer (fixed qty)
    row.append(remove, num);
    return row;
  }

  // ----------------------------
  // ✅ Regular item behaviour (unchanged)
  // ----------------------------
  if (inCart <= 0) {
    const add = document.createElement("button");
    add.className = "btn primary";
    add.textContent = "Add";
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCart(item, 1);
    });
    row.appendChild(add);
    return row;
  }

  const minus = document.createElement("button");
  minus.className = "qbtn";
  minus.textContent = "–";
  minus.addEventListener("click", (e) => {
    e.stopPropagation();
    addToCart(item, -1);
  });

  const num = document.createElement("div");
  num.className = "qnum";
  num.textContent = String(inCart);

  const plus = document.createElement("button");
  plus.className = "qbtn";
  plus.textContent = "+";
  plus.addEventListener("click", (e) => {
    e.stopPropagation();
    addToCart(item, 1);
  });

  row.append(minus, num, plus);
  return row;
}

  function renderCategoryTabs() {
    const tabs = qs("#category-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";

    const cats = STATE.menu?.categories || [];
    cats.forEach((c, idx) => {
      const b = document.createElement("button");
      b.className = "tab" + (idx === STATE.openCategoryIndex ? " active" : "");
      b.textContent = c.title;
      b.addEventListener("click", () => {
        openCategory(idx);
        qs("#menu-accordion")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      tabs.appendChild(b);
    });
  }

  function openCategory(idx) {
    STATE.openCategoryIndex = (STATE.openCategoryIndex === idx) ? -1 : idx;
    renderCategoryTabs();
    renderMenuAccordion();
  }

  function openModal(item) {
    const modal = qs("#modal");
    if (!modal) return;

    const img = qs("#modal-img");
    const name = qs("#modal-name");
    const desc = qs("#modal-desc");
    const price = qs("#modal-price");
    const dot = qs("#modal-dot");
    const actions = qs("#modal-actions");

    if (img) {
      img.src = item.image || "images/hero.jpg";
      img.alt = item.name;
    }
    if (name) name.textContent = item.name;
    if (desc) desc.textContent = item.desc || "";

    if (dot) dot.className = "dot " + (item.veg ? "veg" : "nonveg");
    if (price) price.textContent = item.isOfferItem ? (money(item.price) + " (Offer)") : money(item.price);

    if (actions) {
      actions.innerHTML = "";
      actions.appendChild(makeQtyControls(item));
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    const modal = qs("#modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function renderMenuAccordion() {
    const accWrap = qs("#menu-accordion");
    if (!accWrap) return;
    accWrap.innerHTML = "";

    const cats = STATE.menu?.categories || [];
    cats.forEach((cat, idx) => {
      const items = (cat.items || [])
        .filter(it => it.available !== false)
        .filter(it => itemMatchesSearch(it));

      if (STATE.search && items.length === 0) return;

      const acc = document.createElement("div");
      acc.className = "acc" + (idx === STATE.openCategoryIndex ? " open" : "");

      const head = document.createElement("button");
      head.className = "acc-head";
      head.type = "button";
      head.innerHTML = '<div class="acc-title">' + cat.title + '</div><div class="muted">' + items.length + " items</div>";
      head.addEventListener("click", () => openCategory(idx));

      const body = document.createElement("div");
      body.className = "acc-body";

      items.forEach((it, i) => {
        const row = document.createElement("div");
        row.className = "menuitem";
        row.addEventListener("click", () => {
          openModal({
            id: it.id,
            name: it.name,
            desc: it.desc,
            veg: it.veg,
            image: it.image,
            isOfferItem: false,
            price: Number(it.price)
          });
        });

        const dotClass = it.veg ? "veg" : "nonveg";

        const left = document.createElement("div");
        left.className = "mi-left";
        left.innerHTML =
          '<div class="mi-name"><span class="dot ' + dotClass + '"></span><span>' + it.name +
          '</span></div><div class="mi-desc">' + (it.desc || "") +
          '</div><div class="mi-price">' + money(it.price) +
          '</div><div class="tapnote">Tap to view image</div>';

        const right = document.createElement("div");
        right.className = "mi-right";
        right.appendChild(makeQtyControls({
          id: it.id,
          name: it.name,
          desc: it.desc,
          veg: it.veg,
          image: it.image,
          isOfferItem: false,
          price: Number(it.price)
        }));

        row.append(left, right);
        body.appendChild(row);

        if (i !== items.length - 1) {
          const line = document.createElement("div");
          line.className = "rowline";
          body.appendChild(line);
        }
      });

      acc.append(head, body);
      accWrap.appendChild(acc);
    });

    if (!STATE.search && STATE.openCategoryIndex === -1 && (STATE.menu?.categories || []).length) {
      STATE.openCategoryIndex = 0;
      renderCategoryTabs();
      renderMenuAccordion();
    }
  }

  function renderTodayOffer() {
    const sec = qs("#today-offer");
    const grid = qs("#offer-grid");
    if (!sec || !grid) return;

    grid.innerHTML = "";

    const offer = STATE.menu?.todayOffer;
    if (!offer || offer.enabled !== true || !Array.isArray(offer.items) || offer.items.length === 0) {
      sec.classList.add("hidden");
      return;
    }

    sec.classList.remove("hidden");

    offer.items.slice(0, 2).forEach((it) => {
      const card = document.createElement("div");
      card.className = "item";

      card.addEventListener("click", () => {
        openModal({
          id: it.id,
          name: it.name,
          desc: it.desc,
          veg: it.veg,
          image: it.image,
          isOfferItem: true,
          originalPrice: Number(it.originalPrice),
          offerPrice: Number(it.offerPrice),
          price: Number(it.offerPrice)
        });
      });

      const dotClass = it.veg ? "veg" : "nonveg";

      const media = document.createElement("div");
      media.className = "item-media";
      media.innerHTML = '<img src="' + it.image + '" alt="' + it.name + '" loading="lazy" decoding="async" />';

      const body = document.createElement("div");
      body.className = "item-body";
      body.innerHTML =
        '<div class="item-title"><div class="item-name">' + it.name + '</div>' +
        '<div class="price"><span class="strike">' + money(it.originalPrice) + '</span>' +
        '<span><span class="dot ' + dotClass + '"></span>' + money(it.offerPrice) + '</span></div></div>' +
        '<div class="item-desc">' + (it.desc || "") + "</div>";

      const qtyMount = document.createElement("div");
      qtyMount.className = "qtyrow";
      qtyMount.appendChild(makeQtyControls({
        id: it.id,
        name: it.name,
        desc: it.desc,
        veg: it.veg,
        image: it.image,
        isOfferItem: true,
        originalPrice: Number(it.originalPrice),
        offerPrice: Number(it.offerPrice),
        price: Number(it.offerPrice)
      }));

      body.appendChild(qtyMount);
      card.append(media, body);
      grid.appendChild(card);
    });
  }

  function renderCartItems() {
    const wrap = qs("#cart-items");
    if (!wrap) return;
    wrap.innerHTML = "";

    const items = Object.values(STATE.cart);
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Cart is empty.";
      wrap.appendChild(empty);
      return;
    }

    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "ci";

      const left = document.createElement("div");
      left.innerHTML =
        '<div class="ci-name">' + it.name + '</div>' +
        '<div class="ci-meta">' +
        (it.isOfferItem ? "Offer item • No extra delivery discount" : "Standard item") +
        " • " + (it.veg ? "Veg" : "Non-veg") +
        " • " + money(it.price) + " each</div>";

      const right = document.createElement("div");
      right.appendChild(makeQtyControls(it));

      row.append(left, right);
      wrap.appendChild(row);
    });
  }

  function updateCartUI() {
    const count = cartCount();
    const cc = qs("#cart-count");
    if (cc) cc.textContent = String(count);

    const bar = qs("#cart-bar");
    if (bar) bar.classList.toggle("hidden", count === 0);

    const bill = computeBill();

    const barItems = qs("#cart-bar-items");
    const barTotal = qs("#cart-bar-total");
    if (barItems) barItems.textContent = count + " items";
    if (barTotal) barTotal.textContent = money(bill.grandTotal); // 🔁 use grandTotal

    const s1 = qs("#sum-subtotal");
    const s2 = qs("#sum-discount");
    const s3 = qs("#sum-gst");
    const s5 = qs("#sum-delivery"); // NEW
    const s4 = qs("#sum-total");

    if (s1) s1.textContent = money(bill.subTotal);
    if (s2) s2.textContent = "-" + money(bill.discount);
    if (s3) s3.textContent = money(bill.gst);
    if (s5) s5.textContent = money(bill.deliveryFee); // NEW
    if (s4) s4.textContent = money(bill.grandTotal);  // 🔁 use grandTotal

    const tip = qs("#delivery-tip");
if (tip) {
  if (count > 0 && STATE.orderType === "delivery" && bill.total < 200) {
    tip.textContent = `➕ Add ₹${200 - bill.total} to get delivery free on ₹200+ orders.`;
  } else {
    tip.textContent = "";
  }
}

// ✅ Empty cart: no delivery fee, no tip, total must be ₹0
if (count === 0) {
  const s5 = qs("#sum-delivery");
  const s4 = qs("#sum-total");
  if (s5) s5.textContent = money(0);
  if (s4) s4.textContent = money(0);

  const tip = qs("#delivery-tip");
  if (tip) tip.textContent = "";
}

    renderCartItems();
  }

  function setOrderType(type) {
    STATE.orderType = type;

    qs("#pill-delivery")?.classList.toggle("active", type === "delivery");
    qs("#pill-pickup")?.classList.toggle("active", type === "pickup");

    updateCartUI();
  }

  function openCart() {
    const d = qs("#cart-drawer");
    if (!d) return;
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
  }

  function closeCart() {
    const d = qs("#cart-drawer");
    if (!d) return;
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
  }

  function buildWhatsAppUrl(text) {
    const phone = String(STATE.menu?.contact?.whatsapp || "").replace(/[^\d+]/g, "");
    const msg = encodeURIComponent(text);
    return "https://wa.me/" + phone + "?text=" + msg;
  }

  function buildOrderMessage() {
    const bill = computeBill();
    const items = Object.values(STATE.cart);

    const lines = [];
    lines.push("🍽️ *Lotus & Fire – Website Order*");
    lines.push("Order Type: *" + STATE.orderType.toUpperCase() + "*");
    lines.push("");

    items.forEach((it) => {
      const tag = it.isOfferItem ? " (Offer)" : "";
      lines.push("• " + it.name + tag + " — " + it.qty + " x " + money(it.price) + " = " + money(it.price * it.qty));
    });

    lines.push("");
    lines.push("Subtotal: " + money(bill.subTotal));
    lines.push("Discount: -" + money(bill.discount));
    lines.push("GST (5%): " + money(bill.gst));
    lines.push("Delivery Fee: " + money(bill.deliveryFee));          // NEW
    lines.push("*Total Payable: " + money(bill.grandTotal) + "*");   // UPDATED
    lines.push("");

    const notes = qs("#order-notes")?.value?.trim() || "";
    const nameAddr = qs("#order-name-address")?.value?.trim() || "";

    if (notes) lines.push("Notes: " + notes);
    if (nameAddr) lines.push("Name & Address: " + nameAddr);

    return lines.join("\n");
  }

  function buildBookingMessage() {
    const name = qs("#bk-name")?.value?.trim() || "";
    const phone = qs("#bk-phone")?.value?.trim() || "";
    const date = qs("#bk-date")?.value || "";
    const time = qs("#bk-time")?.value || "";
    const people = qs("#bk-people")?.value || "";
    const note = qs("#bk-note")?.value?.trim() || "";

    const lines = [];
    lines.push("🍽️ *Lotus & Fire – Table Booking (Website)*");
    lines.push("Name: " + name);
    lines.push("Phone: " + phone);
    lines.push("Date: " + date);
    lines.push("Time: " + time);
    lines.push("Guests: " + people);
    if (note) lines.push("Notes: " + note);
    return lines.join("\n");
  }

  async function init() {
    setupSplash();
    loadCart();
    await loadMenu();

    // ✅ Clean invalid offer state on refresh
    normalizeOfferRules();
    saveCart();

    // Buttons: Call / Directions
    const goReserveTable = () => {
      document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
    };

    const goOffers = () => {
     document.getElementById("offers")?.scrollIntoView({ behavior: "smooth" });
    };


    const callNumber = STATE.menu?.contact?.phone || "+919326510688";
    const directionsUrl = STATE.menu?.contact?.directionsUrl || "https://maps.app.goo.gl/";

    const goCall = () => { window.location.href = "tel:" + callNumber; };
    const goDirections = () => { window.open(directionsUrl, "_blank"); };

    qs("#btn-call")?.addEventListener("click", goReserveTable);
    qs("#btn-directions")?.addEventListener("click", goOffers);
    qs("#btn-call-contact")?.addEventListener("click", goCall);
    qs("#btn-directions-contact")?.addEventListener("click", goDirections);

    // WhatsApp buttons
    const goWhatsApp = (text) => window.open(buildWhatsAppUrl(text), "_blank");
    qs("#btn-whatsapp-top")?.addEventListener("click", () => goWhatsApp("Hello! I want to enquire about Lotus & Fire."));
    qs("#btn-whatsapp-contact")?.addEventListener("click", () => goWhatsApp("Hello! I want to enquire about Lotus & Fire."));
   function goWhatsAppOrder(orderText) {

  // 1️⃣ Open WhatsApp
  window.open(buildWhatsAppUrl(orderText), "_blank");

  // 2️⃣ Clear cart state
  STATE.cart = {};

  // 3️⃣ Clear storage
  localStorage.removeItem("lf_cart_v1");
  if (typeof saveCart === "function") saveCart();

  // 4️⃣ FORCE clear cart UI (THIS WAS MISSING)
  forceClearCartUI();

  // 5️⃣ Sync rest of UI
  if (typeof updateCartBar === "function") updateCartBar();
  if (typeof renderMenu === "function") renderMenu();
}

  function forceClearCartUI() {
  const items = document.getElementById("cart-items");
  if (items) items.innerHTML = "";

  const subtotal = document.getElementById("subtotal");
  const discount = document.getElementById("discount");
  const gst = document.getElementById("gst");
  const delivery = document.getElementById("sum-delivery"); // NEW
  const total = document.getElementById("total");

  if (subtotal) subtotal.textContent = "₹0";
  if (discount) discount.textContent = "₹0";
  if (gst) gst.textContent = "₹0";
  if (delivery) delivery.textContent = "₹0"; // NEW
  if (total) total.textContent = "₹0";
}


  window.addEventListener("pageshow", () => {
  if (typeof renderMenu === "function") renderMenu();
  scheduleNextStoreRefresh(); // ✅ auto updates at 12:00 / 3:30 / 7:00 / 12:00
  if (typeof updateCartBar === "function") updateCartBar();
});

  if (!window.__storeIntervalStarted) {
  window.__storeIntervalStarted = true;
  setInterval(() => {
    updateStoreStatusLine();
    applyStoreButtonState();
  }, 60000);
}

    // Mobile menu toggle
    const btnMenu = qs("#btn-menu");
    const mobileNav = qs("#mobile-nav");
    btnMenu?.addEventListener("click", () => {
      mobileNav?.classList.toggle("open");
      mobileNav?.setAttribute("aria-hidden", mobileNav.classList.contains("open") ? "false" : "true");
    });
    qsa(".navlink").forEach(a => a.addEventListener("click", () => {
      mobileNav?.classList.remove("open");
      mobileNav?.setAttribute("aria-hidden", "true");
    }));

    // Order type pills
    qs("#pill-delivery")?.addEventListener("click", () => setOrderType("delivery"));
    qs("#pill-pickup")?.addEventListener("click", () => setOrderType("pickup"));

    // Search
    qs("#search")?.addEventListener("input", (e) => {
      STATE.search = e.target.value;
      if (STATE.search) STATE.openCategoryIndex = -1;
      renderCategoryTabs();
      renderMenuAccordion();
    });

    // Render sections
    renderTodayOffer();
    renderCategoryTabs();
    renderMenuAccordion();
    updateCartUI();

    // Cart open/close
    qs("#btn-cart")?.addEventListener("click", openCart);
    qs("#cart-bar-open")?.addEventListener("click", openCart);
    qs("#cart-close")?.addEventListener("click", closeCart);

    // Clear cart
    qs("#btn-clear-cart")?.addEventListener("click", () => {
      STATE.cart = {};
      saveCart();
      renderTodayOffer();
      renderMenuAccordion();
      updateCartUI();
    });

    // WhatsApp order
    qs("#btn-wa-order")?.addEventListener("click", () => {
      if (cartCount() === 0) return alert("Cart is empty.");
      const nameAddr = qs("#order-name-address")?.value?.trim() || "";
      if (!nameAddr) return alert("Please enter Full Name & Address.");
      goWhatsAppOrder(buildOrderMessage());
    });

    // Booking form
    qs("#booking-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      window.open(buildWhatsAppUrl(buildBookingMessage()), "_blank");
    });

    // Modal close
    qs("#modal-close")?.addEventListener("click", closeModal);
    qs("#modal-backdrop")?.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // Footer year
    const y = qs("#year");
    if (y) y.textContent = String(new Date().getFullYear());

    // Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init().catch((err) => {
    console.error(err);
    alert("Menu load error. Please check data/menu.json path.");
  });

})();

/* ============================= */
/* GALLERY IMAGE MODAL (CLEAN)   */
/* ============================= */

(function () {
  const gallery = document.querySelector(".gallery");
  if (!gallery) return;

  const modal = document.getElementById("galleryModal");
  const modalImg = document.getElementById("gmodalImg");
  const modalName = document.getElementById("gmodalName");
  const modalDesc = document.getElementById("gmodalDesc");

  function openModal(img) {
    modalImg.src = img.src;
    modalImg.alt = img.alt || "Gallery image";
    modalName.textContent = img.dataset.name || "";
    modalDesc.textContent = img.dataset.desc || "";

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modalImg.src = "";
    document.body.style.overflow = "";
  }

  // Open modal on image click
  gallery.addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img) return;
    openModal(img);
  });

  // Close modal (X or backdrop)
  modal.addEventListener("click", (e) => {
    if (e.target.dataset.close === "true") closeModal();
  });

  // ESC key close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
})();
