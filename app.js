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

function refreshSubmitPrice() {
  const bundle = BUNDLES[bundleSelect.value] || BUNDLES.tray1;
  submitPrice.textContent = `$${bundle.price}`;
  submitBtn.classList.remove("bump");
  void submitBtn.offsetWidth;
  submitBtn.classList.add("bump");
}

bundleSelect.addEventListener("change", refreshSubmitPrice);

/* ---------- Phone formatting as you type ---------- */
const phoneInput = document.getElementById("phone");

phoneInput.addEventListener("input", () => {
  const digits = phoneInput.value.replace(/\D/g, "").slice(0, 10);
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean);
  phoneInput.value = parts.join(" ");
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
  const phone = String(data.get("phone") || "").trim();
  const bundleKey = String(data.get("bundle") || "tray1");
  const pickupDay = String(data.get("pickupDay") || "Saturday");
  const bundle = BUNDLES[bundleKey] || BUNDLES.tray1;

  if (!name) return flagInvalid(document.getElementById("name"));
  if (phone.replace(/\D/g, "").length < 8) return flagInvalid(phoneInput);

  const message = [
    "Hi! I'd like to book eggs for pickup at Flemington.",
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Order: ${bundle.label}`,
    `Pickup day: ${pickupDay}`,
    `Total: $${bundle.price}`,
  ].join("\n");
  lastOrderMessage = message;

  doneSummary.textContent = `Thanks ${name.split(" ")[0]}! Here are your pickup details.`;
  receipt.name.textContent = name;
  receipt.phone.textContent = phone;
  receipt.order.textContent = bundle.label;
  receipt.pickup.textContent = `${pickupDay} at Paddy's Markets Flemington`;
  receipt.total.textContent = `$${bundle.price}`;

  // WhatsApp deep link when a number is configured
  const number = String(config.whatsappNumber || "").replace(/\D/g, "");
  if (number) {
    whatsappLink.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    whatsappLink.hidden = false;
  } else {
    whatsappLink.hidden = true;
  }

  // Stripe Payment Link for the chosen bundle when configured
  const stripeUrl = config.stripeLinks && config.stripeLinks[bundleKey];
  if (stripeUrl) {
    stripeLink.href = stripeUrl;
    stripeLink.textContent = `Pay $${bundle.price} online now`;
    stripeLink.hidden = false;
  } else {
    stripeLink.hidden = true;
  }

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
