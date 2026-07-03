// Fill these in to activate online payments and WhatsApp booking.
// The site works without them: orders fall back to a copy-and-send message.

const SITE_CONFIG = {
  // Your WhatsApp number in international format, digits only.
  // Example for an Australian mobile 0412 345 678: "61412345678"
  whatsappNumber: "",

  // Stripe Payment Links (create at https://dashboard.stripe.com/payment-links)
  // Paste the full link for each bundle. Leave empty to hide online payment.
  stripeLinks: {
    tray1: "",
    tray2: "",
    box: "",
  },

  // How many trays you have this week. Shown as a limited-stock note.
  traysAvailableThisWeek: 24,
};
