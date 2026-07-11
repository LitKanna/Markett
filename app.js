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

/* ---------- Ticker: always covers the screen, loops seamlessly ---------- */
const TICKER_ITEMS = [
  "Fresh eggs every week",
  "30 eggs for $12",
  "Pickup Friday & Saturday",
  "Paddy's Markets Flemington",
];

function renderTicker() {
  const track = document.getElementById("ticker-track");
  if (!track) return;

  const dot = '<i>\u2B24</i>';
  const base = TICKER_ITEMS.map((t) => `<span>${t}</span>${dot}`).join("");

  // Measure one copy, then repeat until each half is wider than the screen,
  // so the tail never leaves an empty gap before the loop restarts.
  track.innerHTML = `<div class="ticker-half">${base}</div>`;
  const half = track.firstElementChild;
  const copies = Math.max(1, Math.ceil(window.innerWidth / Math.max(1, half.scrollWidth)));
  const filled = base.repeat(copies);
  track.innerHTML = `<div class="ticker-half">${filled}</div><div class="ticker-half">${filled}</div>`;

  // Constant scroll speed regardless of content length
  const speed = 65; // px per second
  track.style.animationDuration = `${Math.round(track.firstElementChild.scrollWidth / speed)}s`;
}

renderTicker();

let tickerResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(tickerResizeTimer);
  tickerResizeTimer = setTimeout(renderTicker, 250);
});

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
  const show = pastHero && !orderOnScreen && !doneVisible;
  mobileCta.classList.toggle("show", show);
  // Keep the off-screen bar out of the tab order / a11y tree until it slides in.
  mobileCta.inert = !show;
}

/* ---------- Booking controls ---------- */
const submitBtn = document.getElementById("submit-btn");
const quantityInput = document.getElementById("quantity");
const qtyValue = document.getElementById("qty-value");
const orderSummary = document.getElementById("order-summary");

function currentBundle() {
  const checked = document.querySelector('input[name="bundle"]:checked');
  return checked ? checked.value : "tray2";
}

function setBundle(key) {
  const radio = document.querySelector(`input[name="bundle"][value="${key}"]`);
  if (radio) {
    radio.checked = true;
    refreshSubmitPrice();
  }
}

function currentPickupDay() {
  const checked = document.querySelector('input[name="pickupDay"]:checked');
  return checked ? checked.value : "Saturday";
}

function currentQuantity() {
  return Math.max(1, parseInt(quantityInput.value, 10) || 1);
}

function setQuantity(qty) {
  const next = Math.min(10, Math.max(1, qty));
  quantityInput.value = String(next);
  qtyValue.textContent = String(next);
  // Brief pop so the quantity change registers visually.
  qtyValue.classList.remove("bump");
  void qtyValue.offsetWidth;
  qtyValue.classList.add("bump");
  refreshSubmitPrice();
}

document.getElementById("qty-minus").addEventListener("click", () => setQuantity(currentQuantity() - 1));
document.getElementById("qty-plus").addEventListener("click", () => setQuantity(currentQuantity() + 1));

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
  const bundleKey = currentBundle();
  const bundle = BUNDLES[bundleKey] || BUNDLES.tray1;
  const qty = currentQuantity();

  orderSummary.innerHTML = `${describeOrder(bundleKey, qty)} &middot; ${currentPickupDay()} ${nextPickupDate(currentPickupDay())} &middot; $${bundle.price * qty}`;
  orderSummary.classList.remove("bump");
  void orderSummary.offsetWidth;
  orderSummary.classList.add("bump");
}

document.querySelectorAll('input[name="bundle"]').forEach((radio) => {
  radio.addEventListener("change", refreshSubmitPrice);
});

// Day radios are re-rendered from settings, so listen on the container
document.getElementById("day-seg").addEventListener("change", refreshSubmitPrice);

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
  input.setAttribute("aria-invalid", "true");
  input.focus();
  field.addEventListener("animationend", () => field.classList.remove("shake"), { once: true });
  input.addEventListener("input", () => {
    field.classList.remove("error");
    input.removeAttribute("aria-invalid");
  }, { once: true });
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
  TICKER_ITEMS[1] = `30 eggs for $${p1}`;
  renderTicker();
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
  const bpTray1 = document.getElementById("bp-tray1");
  const bpTray2 = document.getElementById("bp-tray2");
  const bpBox = document.getElementById("bp-box");
  if (bpTray1) bpTray1.textContent = `$${BUNDLES.tray1.price}`;
  if (bpTray2) bpTray2.textContent = `$${BUNDLES.tray2.price}`;
  if (bpBox) bpBox.textContent = `$${BUNDLES.box.price}`;
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

  // Product type from admin (cage trays or free-range packs)
  applyProductType(settings.trayWeight);

  // Pickup days and hours
  if (settings.pickup) applyPickup(settings.pickup);
}

const PRODUCT_TYPES = {
  "1.75": {
    shortSpec: "Cage · Extra large · 1.75kg",
    packLine: "Cage eggs · 1.75kg tray",
    faq: "Pace Farm cage eggs, 30 to a tray (1.75kg). The same brand you'll find in the big supermarkets, for less.",
    alt: "Cage eggs · 1.75kg tray",
  },
  "1.5": {
    shortSpec: "Cage · Large · 1.5kg",
    packLine: "Cage eggs · 1.5kg tray",
    faq: "Pace Farm cage eggs, 30 to a tray (1.5kg). The same brand you'll find in the big supermarkets, for less.",
    alt: "Cage eggs · 1.5kg tray",
  },
  "fr-700": {
    shortSpec: "Free range · 700g",
    packLine: "Free range · 700g",
    faq: "Pace Farm free range eggs, 700g pack. The same brand you'll find in the big supermarkets, for less.",
    alt: "Free range · 700g Pace Farm eggs",
  },
  "fr-600": {
    shortSpec: "Free range · 600g",
    packLine: "Free range · 600g",
    faq: "Pace Farm free range eggs, 600g pack. The same brand you'll find in the big supermarkets, for less.",
    alt: "Free range · 600g Pace Farm eggs",
  },
};

function applyProductType(key) {
  const product = PRODUCT_TYPES[key] || PRODUCT_TYPES["1.75"];
  const traySpec = document.getElementById("tray-spec");
  if (traySpec) traySpec.textContent = product.shortSpec;
  const packLine = document.getElementById("pack-eggs-line");
  if (packLine) packLine.textContent = product.packLine;
  const faqEggs = document.getElementById("faq-eggs");
  if (faqEggs) faqEggs.textContent = product.faq;
  const heroImg = document.getElementById("hero-tray-img");
  if (heroImg) heroImg.alt = `${product.alt} on a bright yolk-yellow studio background`;
  const orderImg = document.getElementById("order-tray-img");
  if (orderImg) orderImg.alt = product.alt;
}

function formatTime(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Next pickup date for a weekday, Sydney time, always at least tomorrow.
// Booking today for today isn't possible; orders roll to the next market day.
// Uses the Australia/Sydney zone directly so it stays correct across daylight
// saving (UTC+10 in winter, UTC+11 in summer) regardless of the viewer's zone.
function nextPickupDate(dayName) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const todayIdx = DAY_INDEX[{ Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" }[get("weekday")]];

  // Anchor on Sydney's calendar date as a UTC instant, then add whole days.
  // No fixed offset, so DST transitions never shift the result by a day.
  const base = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  let ahead = (DAY_INDEX[dayName] - todayIdx + 7) % 7;
  if (ahead === 0) ahead = 7;
  const d = new Date(base + ahead * 86400 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
const DAY_BEFORE = {
  Monday: "Sunday", Tuesday: "Monday", Wednesday: "Tuesday", Thursday: "Wednesday",
  Friday: "Thursday", Saturday: "Friday", Sunday: "Saturday",
};
const SHORT_DAY = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

function applyPickup(pickup) {
  const enabledDays = WEEK_DAYS.filter((d) => pickup[d]?.enabled);
  const previousChoice = currentPickupDay();

  // Day cards in the pickup section, with the actual next date
  const cardsBox = document.querySelector(".day-cards");
  if (cardsBox) {
    cardsBox.innerHTML = enabledDays.map((day) => {
      const hours = `${formatTime(pickup[day].open)} to ${formatTime(pickup[day].close)}`;
      return `<article class="day-card">
        <p class="day-name">${day} ${nextPickupDate(day)}</p>
        <p class="day-time">${hours}</p>
        <p class="day-note">Book by ${DAY_BEFORE[day]} night</p>
      </article>`;
    }).join("") || `<article class="day-card"><p class="day-name">Paused</p><p class="day-time">Back soon</p><p class="day-note">Check again Wednesday</p></article>`;
  }

  // Booking form day segments, dated
  const seg = document.getElementById("day-seg");
  if (seg) {
    const pick = enabledDays.includes(previousChoice) ? previousChoice : enabledDays[enabledDays.length - 1];
    seg.innerHTML = enabledDays.map((day) => {
      const hours = `${formatTime(pickup[day].open)} to ${formatTime(pickup[day].close)}`;
      return `<label class="seg-opt">
        <input type="radio" name="pickupDay" value="${day}"${day === pick ? " checked" : ""}>
        <span class="seg-day">${day} ${nextPickupDate(day)}</span>
        <span class="seg-hours">${hours}</span>
      </label>`;
    }).join("");
  }
  refreshSubmitPrice();

  // Texts that mention the days
  const shortNames = enabledDays.map((d) => SHORT_DAY[d]);
  const dayText =
    enabledDays.length === 0 ? "Paused this week" :
    enabledDays.length === 1 ? `${enabledDays[0]}s only` :
    enabledDays.length === 2 ? `${shortNames[0]} & ${shortNames[1]}` :
    `${enabledDays.length} days a week`;

  const pickupTitle = document.getElementById("pickup-title");
  if (pickupTitle) {
    pickupTitle.textContent =
      enabledDays.length === 0 ? "Pickup is paused this week" :
      enabledDays.length === 1 ? `Come on ${enabledDays[0]}` :
      enabledDays.length === 2 ? `Come ${enabledDays[0]} or ${enabledDays[1]}` :
      `Open ${enabledDays.length} days a week`;
  }

  const stats = document.querySelectorAll(".hero-stats div");
  if (stats[2]) {
    stats[2].querySelector("dt").textContent = enabledDays.length ? `${enabledDays.length} day${enabledDays.length > 1 ? "s" : ""}` : "Paused";
    stats[2].querySelector("dd").textContent = dayText;
  }

  TICKER_ITEMS[2] = `Pickup ${dayText}`;
  renderTicker();

  const ctaSpan = document.querySelector(".mobile-cta-text span");
  if (ctaSpan) ctaSpan.textContent = `Pickup ${dayText}`;

  // No pickup days: block the form politely
  const paused = !enabledDays.length;
  const buyBtn = document.getElementById("buynow-btn");
  submitBtn.disabled = paused;
  if (buyBtn) buyBtn.disabled = paused;
  submitBtn.querySelector("#submit-label").textContent = paused ? "Bookings paused" : "Reserve";
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
    setBundle(link.dataset.bundle);
  });
});

// Validate the form and collect the booking; returns null after flagging errors
function collectBooking() {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const phoneDigits = normaliseAuMobile(data.get("phone") || "");
  const bundleKey = String(data.get("bundle") || "tray1");
  const pickupDay = String(data.get("pickupDay") || "Saturday");
  const bundle = BUNDLES[bundleKey] || BUNDLES.tray1;
  const quantity = currentQuantity();

  if (!name) {
    flagInvalid(document.getElementById("name"));
    return null;
  }
  if (!isValidAuMobile(phoneDigits)) {
    phoneError.hidden = false;
    flagInvalid(phoneInput);
    return null;
  }

  return {
    name,
    phoneDigits,
    phone: formatAuMobile(phoneDigits),
    bundleKey,
    pickupDay,
    pickupDate: nextPickupDate(pickupDay),
    quantity,
    total: bundle.price * quantity,
    orderLabel: describeOrder(bundleKey, quantity),
    company: String(data.get("company") || "").trim(),
  };
}

function createOrder(b) {
  return fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: b.name,
      phone: b.phoneDigits,
      bundle: b.bundleKey,
      pickupDay: b.pickupDay,
      pickupDate: b.pickupDate,
      quantity: b.quantity,
      company: b.company || "",
    }),
  })
    .then(async (r) => {
      if (r.status === 429) return { error: "rate" };
      if (!r.ok) return null;
      return r.json();
    })
    .then((d) => {
      if (!d) return null;
      if (d.error === "rate") return { error: "rate" };
      return d.id ? { id: d.id } : null;
    })
    .catch(() => null);
}

async function openCheckout(orderId, fallbackUrl) {
  try {
    if (!orderId) throw new Error("no order");
    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const d = await res.json();
    if (!d.url) throw new Error("checkout failed");
    window.location.href = d.url;
    return true;
  } catch {
    if (fallbackUrl) {
      window.location.href = fallbackUrl;
      return true;
    }
    return false;
  }
}

function showConfirmation(b) {
  const message = [
    "Hi! I'd like to book eggs for pickup at Flemington.",
    `Name: ${b.name}`,
    `Phone: ${b.phone}`,
    `Order: ${b.orderLabel}`,
    `Pickup: ${b.pickupDay} ${b.pickupDate}`,
    `Total: $${b.total}`,
  ].join("\n");
  lastOrderMessage = message;

  doneSummary.textContent = `Thanks ${b.name.split(" ")[0]}! Here are your pickup details.`;
  receipt.name.textContent = b.name;
  receipt.phone.textContent = b.phone;
  receipt.order.textContent = b.orderLabel;
  receipt.pickup.textContent = `${b.pickupDay} ${b.pickupDate} at Paddy's Markets Flemington`;
  receipt.total.textContent = `$${b.total}`;

  const number = String(config.whatsappNumber || "").replace(/\D/g, "");
  if (number) {
    whatsappLink.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    whatsappLink.hidden = false;
  } else {
    whatsappLink.hidden = true;
  }

  const stripeUrl = config.stripeLinks && config.stripeLinks[b.bundleKey];
  stripeLink.textContent = `Pay $${b.total} online for priority`;
  stripeLink.href = "#";
  stripeLink.hidden = false;
  document.getElementById("pay-perk").hidden = false;
  stripeLink.onclick = async (e) => {
    e.preventDefault();
    stripeLink.textContent = "Opening secure checkout…";
    const ok = await openCheckout(lastOrderId, stripeUrl);
    if (!ok) stripeLink.textContent = "Payment unavailable, pay on pickup";
  };

  orderSection.hidden = true;
  doneSection.hidden = false;
  mobileCta.classList.remove("show");
  mobileCta.inert = true;
  doneSection.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

// Reserve: book now, pay at pickup. Keep the progress state visible long
// enough to acknowledge the action before transitioning to the receipt.
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const booking = collectBooking();
  if (!booking) return;

  lastOrderId = null;
  submitBtn.disabled = true;
  submitBtn.setAttribute("aria-busy", "true");
  document.getElementById("submit-label").textContent = "Reserving…";
  const [orderResult] = await Promise.all([
    createOrder(booking),
    new Promise((resolve) => setTimeout(resolve, 850)),
  ]);
  submitBtn.disabled = false;
  submitBtn.removeAttribute("aria-busy");
  document.getElementById("submit-label").textContent = "Reserve";
  if (orderResult?.error === "rate") {
    showToast("Too many bookings from this phone or connection. Try again later.");
    return;
  }
  lastOrderId = orderResult?.id || null;
  showConfirmation(booking);
});

// Buy now: book and go straight to payment
const buynowBtn = document.getElementById("buynow-btn");
const buynowLabel = document.getElementById("buynow-label");

buynowBtn.addEventListener("click", async () => {
  const booking = collectBooking();
  if (!booking) return;

  buynowBtn.disabled = true;
  buynowLabel.textContent = "Opening checkout…";

  const orderResult = await createOrder(booking);
  if (orderResult?.error === "rate") {
    buynowBtn.disabled = false;
    buynowLabel.textContent = "Buy now";
    showToast("Too many bookings from this phone or connection. Try again later.");
    return;
  }
  lastOrderId = orderResult?.id || null;
  const fallback = config.stripeLinks && config.stripeLinks[booking.bundleKey];
  const ok = await openCheckout(lastOrderId, fallback);

  if (!ok) {
    buynowBtn.disabled = false;
    buynowLabel.textContent = "Buy now";
    showConfirmation(booking);
  }
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
