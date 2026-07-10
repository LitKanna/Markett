// Fill these in to activate online payments and WhatsApp booking.
// The site works without them: orders fall back to a copy-and-send message.

const SITE_CONFIG = {
  // Bump when site assets change — forces browsers to fetch fresh files.
  assetVersion: "114",

  // Your WhatsApp number in international format, digits only.
  // Example for an Australian mobile 0412 345 678: "61412345678"
  whatsappNumber: "61433975055",

  // Stripe Payment Links (create at https://dashboard.stripe.com/payment-links)
  // Paste the full link for each bundle. Leave empty to hide online payment.
  stripeLinks: {
    tray1: "https://buy.stripe.com/bJe00l6Xwfphbw1fWk2wU03",
    tray2: "https://buy.stripe.com/cNi3cx3Lk3GzdE9cK82wU04",
    box: "https://buy.stripe.com/8x2eVf81A90TeIdeSg2wU05",
  },

  // How many trays you have this week. Shown as a limited-stock note.
  traysAvailableThisWeek: 24,
};
