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

// Limited-stock note from config
const traysLeft = Number(config.traysAvailableThisWeek);
if (Number.isFinite(traysLeft) && traysLeft > 0) {
  stockNote.textContent = `Only ${traysLeft} trays available this week — book early.`;
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

  if (!name || !phone) return;

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
  doneSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
  doneSection.hidden = true;
  orderSection.hidden = false;
  orderSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
