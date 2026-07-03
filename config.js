// Fill these in to activate online payments and WhatsApp booking.
// The site works without them: orders fall back to a copy-and-send message.

const SITE_CONFIG = {
  // Your WhatsApp number in international format, digits only.
  // Example for an Australian mobile 0412 345 678: "61412345678"
  whatsappNumber: "",

  // Stripe Payment Links (create at https://dashboard.stripe.com/payment-links)
  // Paste the full link for each bundle. Leave empty to hide online payment.
  stripeLinks: {
    tray1: "https://buy.stripe.com/fZu7sN81A1yrfMh25u2wU00",
    tray2: "https://buy.stripe.com/bJe3cxbdMdh9bw111q2wU01",
    box: "https://buy.stripe.com/eVqfZj95E0un9nTaC02wU02",
  },

  // How many trays you have this week. Shown as a limited-stock note.
  traysAvailableThisWeek: 24,
};
