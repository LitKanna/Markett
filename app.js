const BUNDLES = {
  tray1: { label: "1 tray (30 eggs)", price: 12 },
  tray2: { label: "2 trays (60 eggs)", price: 23 },
  box: { label: "Full box (6 trays, 180 eggs)", price: 66 },
};

const config = typeof SITE_CONFIG === "object" && SITE_CONFIG !== null ? SITE_CONFIG : {};

const form = document.getElementById("order-form");
const doneSection = document.getElementById("done");
const doneSummary = document.getElementById("done-summary");
const whatsappLink = document.getElementById("whatsapp-send");
const stripeLink = document.getElementById("stripe-pay");
const copyButton = document.getElementById("copy-message");
const againButton = document.getElementById("again");
const orderSection = document.getElementById("order");
const bundleSelect = document.getElementById("bundle");
const stockNote = document.getElementById("stock-note");
const receipt = {
  name: document.getElementById("r-name"),
  phone: document.getElementById("r-phone"),
  order: document.getElementById("r-order"),
  pickup: document.getElementById("r-pickup"),
  total: document.getElementById("r-total"),
};

let lastOrderMessage = "";
let lastOrderId = null;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Scroll effects, throttled to one update per frame ---------- */
const topbar = document.querySelector(".topbar");
let scrollTicking = false;

function onScrollFrame() {
  topbar.classList.toggle("scrolled", window.scrollY > 8);
  updateMobileCta();
  scrollTicking = false;
}

window.addEventListener("scroll", () => {
  if (!scrollTicking) {
    scrollTicking = true;
    requestAnimationFrame(onScrollFrame);
  }
}, { passive: true });

/* ---------- Scroll reveal ---------- */
const revealTargets = document.querySelectorAll(
  ".section-head, .price-card, .day-card, .steps, .trust-row p, .order-copy, .order-form, .faq details, .stock-note"
);

revealTargets.forEach((el, i) => {
  el.classList.add("reveal");
  el.style.setProperty("--reveal-delay", `${(i % 4) * 70}ms`);
});

if (!reducedMotion && "IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add("in"));
}

/* ---------- Cursor-following glow on price cards ---------- */
if (!reducedMotion && window.matchMedia("(hover: hover)").matches) {
  document.querySelectorAll(".price-card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      card.style.setProperty("--my", `${e.clientY - rect.top}px`);
    });
  });
}

/* ---------- Sticky mobile booking bar ---------- */
const mobileCta = document.getElementById("mobile-cta");
const heroSection = document.querySelector(".hero");

function updateMobileCta() {
  const pastHero = window.scrollY > heroSection.offsetHeight * 0.7;
  const orderRect = orderSection.getBoundingClientRect();
  const doneVisible = !doneSection.hidden;
  const orderOnScreen = orderRect.top < window.innerHeight && orderRect.bottom > 0;
  mobileCta.classList.toggle("show", pastHero && !orderOnScreen && !doneVisible);
}

/* ---------- Live price on the submit button ---------- */
const submitBtn = document.getElementById("submit-btn");
const submitPrice = document.getElementById("submit-price");
const quantitySelect = document.getElementById("quantity");
const bulkHint = document.getElementById("bulk-hint");

function currentQuantity() {
  return Math.max(1, parseInt(quantitySelect.value, 10) || 1);
}

function eggCount(bundleKey) {
  return bundleKey === "box" ? 180 : bundleKey === "tray2" ? 60 : 30;
}

// Human-clear order description: "20 trays (600 eggs)", "3 full boxes (540 eggs)"
function describeOrder(bundleKey, qty) {
  const eggs = (eggCount(bundleKey) * qty).toLocaleString("en-AU");
  if (bundleKey === "box") {
    return qty === 1
      ? `Full box (6 trays, 180 eggs)`
      : `${qty} full boxes (${eggs} eggs)`;
  }
  const trays = (bundleKey === "tray2" ? 2 : 1) * qty;
  return trays === 1 ? `1 tray (30 eggs)` : `${trays} trays (${eggs} eggs)`;
}

function refreshSubmitPrice() {
  const bundle = BUNDLES[bundleSelect.value] || BUNDLES.tray1;
  const qty = currentQuantity();
  submitPrice.textContent = `$${bundle.price * qty}`;
  submitBtn.classList.remove("bump");
  void submitBtn.offsetWidth;
  submitBtn.classList.add("bump");

  if (qty > 1) {
    bulkHint.textContent = `That's ${describeOrder(bundleSelect.value, qty)}.`;
    bulkHint.hidden = false;
  } else {
    bulkHint.hidden = true;
  }
}

bundleSelect.addEventListener("change", refreshSubmitPrice);
quantitySelect.addEventListener("change", refreshSubmitPrice);

/* ---------- Australian mobile handling ---------- */
const phoneInput = document.getElementById("phone");
const phoneError = document.getElementById("phone-error");

// Normalise any way people type their number (+61 433..., 61433..., 0433..., 433...)
// down to local digits: 04XXXXXXXX
function normaliseAuMobile(raw) {
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("0061")) digits = digits.slice(4);
  if (digits.startsWith("61") && digits.length >= 10) digits = digits.slice(2);
  if (digits.startsWith("4")) digits = "0" + digits;
  return digits.slice(0, 10);
}

function isValidAuMobile(digits) {
  return /^04\d{8}$/.test(digits);
}

function formatAuMobile(digits) {
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean);
  return parts.join(" ");
}

phoneInput.addEventListener("input", () => {
  phoneInput.value = formatAuMobile(normaliseAuMobile(phoneInput.value));
  phoneError.hidden = true;
});

/* ---------- Field validation feedback ---------- */
function flagInvalid(input) {
  const field = input.closest(".field");
  field.classList.add("error", "shake");
  input.focus();
  field.addEventListener("animationend", () => field.classList.remove("shake"), { once: true });
  input.addEventListener("input", () => field.classList.remove("error"), { once: true });
}

// Limited-stock note from config
const traysLeft = Number(config.traysAvailableThisWeek);
if (Number.isFinite(traysLeft) && traysLeft > 0) {
  stockNote.textContent = `Only ${traysLeft} trays available this week. Book early.`;
  stockNote.hidden = false;
}

/* ---------- Live prices and stock from the shop API ---------- */
const API_BASE = location.hostname.endsWith("getyolko.com") ? "" : "https://getyolko.com";

function applySettings(settings) {
  const p = settings.prices || {};
  if (p.tray1) BUNDLES.tray1.price = p.tray1;
  if (p.tray2) BUNDLES.tray2.price = p.tray2;
  if (p.box) BUNDLES.box.price = p.box;

  const p1 = BUNDLES.tray1.price;
  const perEgg = Math.round((p1 / 30) * 100);
  const saving = Math.round(p1 * 2 - BUNDLES.tray2.price);

  // Hero
  const badge = document.querySelector(".badge-price");
  if (badge) badge.textContent = `$${p1}`;
  const stats = document.querySelectorAll(".hero-stats dt");
  if (stats[0]) stats[0].textContent = `$${p1}`;
  if (stats[1]) stats[1].innerHTML = `${perEgg}&cent;`;
  const leadStrong = document.querySelector(".hero-sub strong");
  if (leadStrong) leadStrong.textContent = `$${p1}`;

  // Ticker and mobile bar
  document.querySelectorAll(".ticker-track span").forEach((el) => {
    if (/30 eggs/i.test(el.textContent)) el.textContent = `30 eggs for $${p1}`;
  });
  const ctaStrong = document.querySelector(".mobile-cta-text strong");
  if (ctaStrong) ctaStrong.textContent = `30 eggs · $${p1}`;

  // Price cards
  const bigs = document.querySelectorAll(".price-big");
  const pers = document.querySelectorAll(".price-per");
  if (bigs[0]) bigs[0].textContent = `$${BUNDLES.tray1.price}`;
  if (bigs[1]) bigs[1].textContent = `$${BUNDLES.tray2.price}`;
  if (bigs[2]) bigs[2].textContent = `$${BUNDLES.box.price}`;
  if (pers[0]) pers[0].innerHTML = `30 eggs · ${perEgg}&cent; each`;
  if (pers[1]) pers[1].textContent = saving > 0 ? `60 eggs · save $${saving}` : "60 eggs";
  if (pers[2]) pers[2].textContent = "6 trays · 180 eggs";

  // Form options and submit chip
  bundleSelect.options[0].textContent = `1 tray (30 eggs) $${BUNDLES.tray1.price}`;
  bundleSelect.options[1].textContent = `2 trays (60 eggs) $${BUNDLES.tray2.price}`;
  bundleSelect.options[2].textContent = `Full box (180 eggs) $${BUNDLES.box.price}`;
  refreshSubmitPrice();

  // Stock note
  const stock = Number(settings.traysAvailable);
  if (Number.isFinite(stock)) {
    if (stock > 0) {
      stockNote.textContent = `Only ${stock} trays available this week. Book early.`;
      stockNote.hidden = false;
      stockNote.classList.add("in");
    } else {
      stockNote.textContent = "Sold out this week. Check back Wednesday.";
      stockNote.hidden = false;
      stockNote.classList.add("in");
    }
  }

  // Pickup days and hours
  if (settings.pickup) applyPickup(settings.pickup);
}

function formatTime(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function applyPickup(pickup) {
  const days = ["Friday", "Saturday"];
  const enabledDays = days.filter((d) => pickup[d]?.enabled);
  const dayCards = document.querySelectorAll(".day-cards .day-card");
  const daySelect = document.getElementById("pickup-day");

  days.forEach((day, i) => {
    const info = pickup[day];
    const card = dayCards[i];
    const option = [...daySelect.options].find((o) => o.value === day);
    if (!info || !card || !option) return;

    const hours = `${formatTime(info.open)} – ${formatTime(info.close)}`;
    card.style.display = info.enabled ? "" : "none";
    const timeEl = card.querySelector(".day-time");
    if (timeEl) timeEl.textContent = hours;
    option.textContent = `${day} · ${hours}`;
    option.disabled = !info.enabled;
    option.hidden = !info.enabled;
  });

  // Keep a valid selection
  if (daySelect.selectedOptions[0]?.disabled && enabledDays.length) {
    daySelect.value = enabledDays[enabledDays.length - 1];
  }

  // Texts that mention the days
  const dayText =
    enabledDays.length === 2 ? "Friday & Saturday" :
    enabledDays.length === 1 ? `${enabledDays[0]}s only` : "Paused this week";

  const pickupTitle = document.getElementById("pickup-title");
  if (pickupTitle) {
    pickupTitle.textContent =
      enabledDays.length === 2 ? "Come Friday or Saturday" :
      enabledDays.length === 1 ? `Come on ${enabledDays[0]}` : "Pickup is paused this week";
  }

  const stats = document.querySelectorAll(".hero-stats div");
  if (stats[2]) {
    stats[2].querySelector("dt").textContent = enabledDays.length ? `${enabledDays.length} day${enabledDays.length > 1 ? "s" : ""}` : "Paused";
    stats[2].querySelector("dd").textContent = dayText;
  }

  document.querySelectorAll(".ticker-track span").forEach((el) => {
    if (/^Pickup /i.test(el.textContent)) el.textContent = `Pickup ${dayText}`;
  });

  const ctaSpan = document.querySelector(".mobile-cta-text span");
  if (ctaSpan) ctaSpan.textContent = `Pickup ${dayText}`;

  // No pickup days: block the form politely
  if (!enabledDays.length) {
    submitBtn.disabled = true;
    submitBtn.querySelector("#submit-label").textContent = "Bookings paused";
  } else {
    submitBtn.disabled = false;
    submitBtn.querySelector("#submit-label").textContent = "Reserve my eggs";
  }
}

fetch(`${API_BASE}/api/settings`)
  .then((r) => (r.ok ? r.json() : null))
  .then((s) => { if (s) applySettings(s); })
  .catch(() => {});

/* ---------- Payment confirmation on return from Stripe ---------- */
const paidSession = new URLSearchParams(location.search).get("paid");
if (paidSession && paidSession.startsWith("cs_")) {
  history.replaceState(null, "", location.pathname);
  fetch(`${API_BASE}/api/confirm-payment?session=${encodeURIComponent(paidSession)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && d.paid) showToast("Payment received! Your eggs are locked in. See you at the market. 🥚");
    })
    .catch(() => {});
}

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}

// Price-card buttons preselect the bundle in the form
document.querySelectorAll("[data-bundle]").forEach((link) => {
  link.addEventListener("click", () => {
    bundleSelect.value = link.dataset.bundle;
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const phoneDigits = normaliseAuMobile(data.get("phone") || "");
  const bundleKey = String(data.get("bundle") || "tray1");
  const pickupDay = String(data.get("pickupDay") || "Saturday");
  const bundle = BUNDLES[bundleKey] || BUNDLES.tray1;
  const quantity = currentQuantity();
  const total = bundle.price * quantity;
  const orderLabel = describeOrder(bundleKey, quantity);

  if (!name) return flagInvalid(document.getElementById("name"));
  if (!isValidAuMobile(phoneDigits)) {
    phoneError.hidden = false;
    return flagInvalid(phoneInput);
  }
  const phone = formatAuMobile(phoneDigits);

  const message = [
    "Hi! I'd like to book eggs for pickup at Flemington.",
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Order: ${orderLabel}`,
    `Pickup day: ${pickupDay}`,
    `Total: $${total}`,
  ].join("\n");
  lastOrderMessage = message;

  // Record the order so it shows in the admin dashboard,
  // and remember its id for locked-amount online payment
  lastOrderId = null;
  fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone: phoneDigits, bundle: bundleKey, pickupDay, quantity }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && d.id) lastOrderId = d.id; })
    .catch(() => {});

  doneSummary.textContent = `Thanks ${name.split(" ")[0]}! Here are your pickup details.`;
  receipt.name.textContent = name;
  receipt.phone.textContent = phone;
  receipt.order.textContent = orderLabel;
  receipt.pickup.textContent = `${pickupDay} at Paddy's Markets Flemington`;
  receipt.total.textContent = `$${total}`;

  // WhatsApp deep link when a number is configured
  const number = String(config.whatsappNumber || "").replace(/\D/g, "");
  if (number) {
    whatsappLink.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    whatsappLink.hidden = false;
  } else {
    whatsappLink.hidden = true;
  }

  // Online payment: locked-amount checkout created on demand,
  // with the static payment link as fallback
  const stripeUrl = config.stripeLinks && config.stripeLinks[bundleKey];
  stripeLink.textContent = `Pay $${total} online now`;
  stripeLink.href = "#";
  stripeLink.hidden = false;
  stripeLink.onclick = async (e) => {
    e.preventDefault();
    stripeLink.textContent = "Opening secure checkout…";
    try {
      if (!lastOrderId) throw new Error("no order id yet");
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: lastOrderId }),
      });
      const d = await res.json();
      if (!d.url) throw new Error("checkout failed");
      window.location.href = d.url;
    } catch {
      if (stripeUrl) {
        window.location.href = stripeUrl;
      } else {
        stripeLink.textContent = "Payment unavailable, pay on pickup";
      }
    }
  };

  orderSection.hidden = true;
  doneSection.hidden = false;
  mobileCta.classList.remove("show");
  doneSection.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
});

copyButton.addEventListener("click", async () => {
  if (!lastOrderMessage) return;

  try {
    await navigator.clipboard.writeText(lastOrderMessage);
    copyButton.textContent = "Copied!";
  } catch {
    copyButton.textContent = "Copy failed";
  }

  setTimeout(() => {
    copyButton.textContent = "Copy order";
  }, 1800);
});

againButton.addEventListener("click", () => {
  form.reset();
  refreshSubmitPrice();
  doneSection.hidden = true;
  orderSection.hidden = false;
  orderSection.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
});
