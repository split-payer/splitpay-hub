// netlify/functions/partner-reminder.js
//
// Scheduled function — runs on the 20th of every month at 9 AM ET
// Pulls all contacts from the SENDGRID_PARTNER_LIST_ID list and
// fires send-partner-email for each one.
//
// netlify.toml entry:
//   [functions."partner-reminder"]
//   schedule = "0 14 20 * *"   # 9 AM ET = 14:00 UTC

const SITE_URL = 'https://pmc.splitpay.com';

exports.handler = async () => {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const PARTNER_LIST_ID = process.env.SENDGRID_PARTNER_LIST_ID;

  if (!SENDGRID_API_KEY || !PARTNER_LIST_ID) {
    console.error('partner-reminder: missing env vars SENDGRID_API_KEY or SENDGRID_PARTNER_LIST_ID');
    return { statusCode: 500, body: 'Missing env vars' };
  }

  // 1. Fetch all contacts in the partner list
  let contacts = [];
  try {
    const res = await fetch(
      `https://api.sendgrid.com/v3/marketing/lists/${PARTNER_LIST_ID}/contacts?page_size=1000`,
      { headers: { Authorization: `Bearer ${SENDGRID_API_KEY}` } }
    );
    const data = await res.json();
    contacts = data.result || [];
    console.log(`partner-reminder: found ${contacts.length} partners`);
  } catch (err) {
    console.error('partner-reminder: failed to fetch contacts', err.message);
    return { statusCode: 500, body: err.message };
  }

  if (contacts.length === 0) {
    console.log('partner-reminder: no partners found, nothing to send');
    return { statusCode: 200, body: 'No partners' };
  }

  // 2. Send reminder to each partner
  let sent = 0, failed = 0;
  for (const contact of contacts) {
    const email = contact.email;
    const firstName = contact.first_name || '';
    const refSlug = contact.custom_fields?.partner_ref_slug || '';

    if (!email) { failed++; continue; }

    try {
      const res = await fetch(`${SITE_URL}/.netlify/functions/send-partner-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: 'monthly',
          firstName,
          email,
          refSlug,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        const err = await res.text();
        console.error(`partner-reminder: failed for ${email}:`, err);
        failed++;
      }
    } catch (err) {
      console.error(`partner-reminder: exception for ${email}:`, err.message);
      failed++;
    }
  }

  console.log(`partner-reminder: done — sent ${sent}, failed ${failed}`);
  return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
};
