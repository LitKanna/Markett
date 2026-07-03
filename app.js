const form = document.getElementById("order-form");
const result = document.getElementById("result");
const message = document.getElementById("message");
const copyButton = document.getElementById("copy-button");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const trays = Number(data.get("trays") || 1);
  const pickupDay = String(data.get("pickupDay") || "Saturday");
  const total = trays * 10;

  if (!name || !phone) {
    return;
  }

  const orderMessage = [
    "Fresh Eggs Flemington order",
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Order: ${trays} tray${trays > 1 ? "s" : ""} (${trays * 30} eggs)`,
    `Total: $${total}`,
    `Pickup: ${pickupDay} at Paddy's Markets Flemington`,
  ].join("\n");

  message.textContent = orderMessage;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

copyButton.addEventListener("click", async () => {
  const text = message.textContent;

  if (!text) {
    return;
  }

  await navigator.clipboard.writeText(text);
  copyButton.textContent = "Copied";

  setTimeout(() => {
    copyButton.textContent = "Copy message";
  }, 1600);
});
