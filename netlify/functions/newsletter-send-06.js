// netlify/functions/newsletter-send-06.js
// Variable send — uses NEWSLETTER_OVERRIDE_06 env var if set, else default.
// Fires 6th at 9am UTC.
const { handler } = require('./newsletter-send');
exports.handler = () => handler(6);
