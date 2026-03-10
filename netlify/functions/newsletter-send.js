// netlify/functions/newsletter-send.js
//
// Shared handler called by 4 thin scheduled wrappers:
//   newsletter-send-15.js  → fires 15th  9am UTC (fixed)
//   newsletter-send-28.js  → fires 28th  9am UTC (fixed)
//   newsletter-send-01.js  → fires 1st   9am UTC (variable)
//   newsletter-send-06.js  → fires 6th   9am UTC (variable)
//
// Default/override logic:
//   - Fixed sends (15, 28): always use the default design for that date.
//   - Variable sends (1, 6): check env var NEWSLETTER_OVERRIDE_01 / NEWSLETTER_OVERRIDE_06
//     for a SendGrid design ID. If set → use it. If not → fall back to default.
//
// To set an override for the 1st send:
//   In Netlify dashboard → Site config → Environment variables
//   Add: NEWSLETTER_OVERRIDE_01 = <SendGrid design ID>
//   After it fires, delete the env var to revert to default next month.

const SENDGRID_API = 'https://api.sendgrid.com/v3';

const NEWSLETTER_LIST_ID  = '9d084de8-4446-4b10-adf9-f6b0b6459a6e';
const UNSUBSCRIBE_GROUP_ID = 38307; // Split Pay Property Manager Kit
const SENDER_ID            = 8617495; // Nils from Split Pay - PM Support

// Default design IDs (created in SendGrid Design Library)
const DEFAULT_DESIGNS = {
  15: { id: 'e30c6eb8-2a82-4f99-8346-f8f37babf318', subject: "Your residents can split rent — here's everything they need" },
  28: { id: '41c9a208-fbf4-46db-a73c-b3243c5b46d1', subject: "There's still time — residents can get approved before the 1st" },
   1: { id: '16531196-1802-4c25-a45e-96ea49528d35', subject: "Happy 1st — make sure your residents are set up for next month" },
   6: { id: '180233a4-4032-40dd-84c7-edfd96da46fc', subject: "No cut-off dates — residents can still sign up for next month" },
};

// Override env var names for variable sends
const OVERRIDE_ENV = {
  1: 'NEWSLETTER_OVERRIDE_01',
  6: 'NEWSLETTER_OVERRIDE_06',
};

async function getDesignSubject(designId, apiKey) {
  // If override is set, fetch its subject from SendGrid so the email subject stays accurate
  try {
    const res = await fetch(`${SENDGRID_API}/designs/${designId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    return data.subject || DEFAULT_DESIGNS[1].subject;
  } catch {
    return null;
  }
}

async function sendNewsletter(day, apiKey, slackWebhook) {
  const defaults = DEFAULT_DESIGNS[day];
  if (!defaults) throw new Error(`No default design configured for day ${day}`);

  // Resolve design: check override env var for variable sends
  const overrideEnvKey = OVERRIDE_ENV[day];
  const overrideDesignId = overrideEnvKey ? process.env[overrideEnvKey] : null;

  let designId, subject, isOverride;
  if (overrideDesignId) {
    designId   = overrideDesignId;
    subject    = await getDesignSubject(designId, apiKey) || defaults.subject;
    isOverride = true;
    console.log(`Newsletter day-${day}: using OVERRIDE design ${designId}`);
  } else {
    designId   = defaults.id;
    subject    = defaults.subject;
    isOverride = false;
    console.log(`Newsletter day-${day}: using DEFAULT design ${designId}`);
  }

  const sendName = `Split Pay Newsletter — ${new Date().toISOString().slice(0, 7)} day-${day}${isOverride ? ' (custom)' : ''}`;

  // 1. Create Single Send
  const createRes = await fetch(`${SENDGRID_API}/marketing/singlesends`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: sendName,
      send_to: { list_ids: [NEWSLETTER_LIST_ID] },
      email_config: {
        subject,
        sender_id: SENDER_ID,
        suppression_group_id: UNSUBSCRIBE_GROUP_ID,
        design_id: designId,
      },
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(`Create single send failed: ${JSON.stringify(createData)}`);

  const singleSendId = createData.id;
  console.log(`Newsletter day-${day}: created single send ${singleSendId}`);

  // 2. Schedule to send now
  const schedRes = await fetch(`${SENDGRID_API}/marketing/singlesends/${singleSendId}/schedule`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ send_at: 'now' }),
  });

  const schedData = await schedRes.json();
  if (!schedRes.ok) throw new Error(`Schedule single send failed: ${JSON.stringify(schedData)}`);

  console.log(`Newsletter day-${day}: scheduled — status: ${schedData.status}`);

  // 3. Slack alert
  if (slackWebhook) {
    const icon  = isOverride ? '🆕' : '📬';
    const label = isOverride ? 'CUSTOM send' : 'default send';
    await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${icon} *Split Pay Newsletter sent* — day-${day} ${label}\nSubject: _${subject}_\nDesign: ${designId}\nSingle Send ID: ${singleSendId}`,
      }),
    }).catch(e => console.error('Slack alert failed:', e));
  }

  return { singleSendId, status: schedData.status, designId, isOverride };
}

async function handler(day) {
  const apiKey       = process.env.SENDGRID_API_KEY;
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;

  if (!apiKey) {
    console.error('Missing SENDGRID_API_KEY');
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SENDGRID_API_KEY' }) };
  }

  try {
    const result = await sendNewsletter(day, apiKey, slackWebhook);
    return { statusCode: 200, body: JSON.stringify({ success: true, day, ...result }) };
  } catch (err) {
    console.error(`Newsletter day-${day} error:`, err.message);
    if (slackWebhook) {
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `❌ *Split Pay Newsletter FAILED* — day-${day}\nError: ${err.message}` }),
      }).catch(() => {});
    }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

module.exports = { handler };
