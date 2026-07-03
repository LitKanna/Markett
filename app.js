const PRICES = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
};

const PICKUP_INFO = {
  friday: {
    label: "Friday",
    hours: "10:00 AM – 4:30 PM",
    location: "Paddy's Markets Flemington, Building D",
  },
  saturday: {
    label: "Saturday",
    hours: "6:00 AM – 2:00 PM",
    location: "Paddy's Markets Flemington, Building D",
  },
};

const form = document.getElementById("order-form");
const confirmationSection = document.getElementById("confirmation");
const confirmationMessage = document.getElementById("confirmation-message");
const confirmationDetails = document.getElementById("confirmation-details");
const newOrderBtn = document.getElementById("new-order-btn");
const orderSection = document.getElementById("order");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const name = data.get("name").trim();
  const phone = data.get("phone").trim();
  const email = data.get("email").trim();
  const trays = data.get("trays");
  const pickupDay = data.get("pickup-day");
  const notes = data.get("notes").trim();

  if (!name || !phone) {
    return;
  }

  const pickup = PICKUP_INFO[pickupDay];
  const total = PRICES[trays];
  const trayCount = parseInt(trays, 10);
  const orderId = "FFE-" + Date.now().toString(36).toUpperCase().slice(-6);

  confirmationMessage.textContent =
    `Thanks ${name}! We'll confirm your order by SMS/WhatsApp within a few hours.`;

  confirmationDetails.innerHTML = `
    <dl>
      <div>
        <dt>Order reference</dt>
        <dd>${orderId}</dd>
      </div>
      <div>
        <dt>Pickup day</dt>
        <dd>${pickup.label} · ${pickup.hours}</dd>
      </div>
      <div>
        <dt>Pickup location</dt>
        <dd>${pickup.location}<br>250 Parramatta Rd, Flemington NSW 2129</dd>
      </div>
      <div>
        <dt>Your order</dt>
        <dd>${trayCount} tray${trayCount > 1 ? "s" : ""} (${trayCount * 30} eggs) — $${total.toFixed(2)}</dd>
      </div>
      <div>
        <dt>Contact</dt>
        <dd>${phone}${email ? `<br>${email}` : ""}</dd>
      </div>
      ${notes ? `<div><dt>Notes</dt><dd>${escapeHtml(notes)}</dd></div>` : ""}
      <div>
        <dt>Payment</dt>
        <dd>Pay on pickup (cash or card)</dd>
      </div>
    </dl>
  `;

  orderSection.classList.add("hidden");
  confirmationSection.classList.remove("hidden");
  confirmationSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

newOrderBtn.addEventListener("click", () => {
  form.reset();
  document.getElementById("pickup-day").value = "saturday";
  confirmationSection.classList.add("hidden");
  orderSection.classList.remove("hidden");
  orderSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
