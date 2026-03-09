// netlify/functions/submit-to-close.js

const CF = {
  leadSource:         'cf_yABHaHWbML9hNEy77Mu4QlWthjf3LXLkSobSkEgFgVO',
  pms:                'cf_gTwvG5VGF2RZhgzu1mUvQri0QiBM5FpPtOLj2SFcRj1',
  propertyName:       'cf_BugPKaXenAmkMdymXvrwMBR9jcNLII5EBLuoR5HF85J',
  propertyAddress:    'cf_vltfxti7afKgf3mnhoodIOulv2wcMytEqfDMfqZtXPB',
  conciergeChannel:   'cf_JXm6UvEEHIwkXySm3XQdeMTrjUgv25gnvkeSFZdU5Go',
  conciergeRequested: 'cf_IqQ1s9ZshyYPq60cEdSGPTVGV3zcFrrqyK0wXvw8nkm',
  totalUnits:         'cf_5HP7O9bC0L2Evm71ibnEOMg3VcuedBmj7w0Xq78sfOL',
  kitDownloaded:      'cf_PACYZMcqEhj64C9CodO5VKS7sVcmly92zDwZcHuvJCH',
};

// ── Slack alerting ───────────────────────────────────────────────────────────
async function slackAlert(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error('Slack alert failed:', err);
  }
}

// ── SendGrid: enroll contact in a single list ────────────────────────────────
async function enrollInSendGrid({ email, firstName, lastName, listId }) {
  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) {
    console.warn('SENDGRID_API_KEY not set — skipping SendGrid enrollment');
    return;
  }
  if (!email || !listId) {
    console.warn('enrollInSendGrid: missing email or listId — skipping');
    return;
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${sgKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        list_ids: [listId],
        contacts: [{ email, first_name: firstName || '', last_name: lastName || '' }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('SendGrid enrollment error:', err);
      await slackAlert(`⚠️ *submit-to-close*: SendGrid enrollment failed for \`${email}\` (list \`${listId}\`)\n\`\`\`${err}\`\`\``);
    } else {
      console.log(`SendGrid: enrolled ${email} in list ${listId}`);
    }
  } catch (err) {
    console.error('SendGrid enrollment exception:', err.message);
    await slackAlert(`⚠️ *submit-to-close*: SendGrid enrollment exception for \`${email}\`: ${err.message}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
  if (!CLOSE_API_KEY) {
    await slackAlert('🚨 *submit-to-close*: Missing CLOSE_API_KEY environment variable.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing CLOSE_API_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    formType, firstName, lastName, company, firm, email, phone,
    pms, unitCount, propertyName, propertyAddress, channel,
    hasRentRoll, rentRollName, rentRollDriveUrl, rentRollRowCount,
  } = body;

  const name        = `${firstName || ''} ${lastName || ''}`.trim();
  const companyName = company || firm || '';
  const authHeader  = 'Basic ' + Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');

  try {

    // ── Search for existing lead by email ──────────────────────────────────
    let existingLeadId = null;
    if (email) {
      try {
        const searchRes = await fetch(
          `https://api.close.com/api/v1/lead/?query=${encodeURIComponent(`email:"${email}"`)}`,
          { headers: { Authorization: authHeader, Accept: 'application/json' } }
        );
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) {
          existingLeadId = searchData.data[0].id;
        }
      } catch (err) {
        console.error('Lead search error:', err);
      }
    }

    // ── Build custom fields ────────────────────────────────────────────────
    const customFields = {
      [CF.leadSource]:         formType === 'kit' ? 'PMC Kit Download' : 'PMC Concierge',
      [CF.pms]:                pms || null,
      [CF.propertyName]:       propertyName || null,
      [CF.propertyAddress]:    propertyAddress || null,
      [CF.conciergeChannel]:   channel || null,
      [CF.conciergeRequested]: formType === 'concierge' ? 'Yes' : null,
      [CF.totalUnits]:         unitCount || null,
      [CF.kitDownloaded]:      formType === 'kit' ? 'Yes' : null,
    };

    Object.keys(customFields).forEach((k) => {
      if (customFields[k] === null) delete customFields[k];
    });

    // ── Create or update lead ──────────────────────────────────────────────
    let leadId;

    if (existingLeadId) {
      const updateRes = await fetch(`https://api.close.com/api/v1/lead/${existingLeadId}/`, {
        method: 'PUT',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...(companyName ? { name: companyName } : {}),
          ...customFields,
        }),
      });
      if (!updateRes.ok) {
        const detail = await updateRes.text();
        console.error('Lead update failed:', detail);
        await slackAlert(`⚠️ *submit-to-close*: Lead update failed for \`${email || 'unknown'}\`\n\`\`\`${detail}\`\`\``);
      }
      leadId = existingLeadId;
    } else {
      const leadRes = await fetch('https://api.close.com/api/v1/lead/', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: companyName || name || 'Split Pay PMC Lead',
          contacts: [{
            name,
            emails: email ? [{ type: 'work', email }] : [],
            phones: phone ? [{ type: 'mobile', phone }] : [],
          }],
          status: 'New Lead',
          ...customFields,
        }),
      });
      const lead = await leadRes.json();
      if (!leadRes.ok) {
        const detail = JSON.stringify(lead);
        console.error('Lead creation failed:', detail);
        await slackAlert(`🚨 *submit-to-close*: Lead creation failed for \`${email || 'unknown'}\` (${formType})\n\`\`\`${detail}\`\`\``);
        return { statusCode: 502, body: JSON.stringify({ error: 'Close API error', detail: lead }) };
      }
      leadId = lead.id;
    }

    // ── Note for kit downloads ─────────────────────────────────────────────
    if (formType === 'kit') {
      await fetch('https://api.close.com/api/v1/activity/note/', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ lead_id: leadId, note: 'Kit downloaded via pmc.splitpay.com' }),
      });
    }

    // ── Opportunity ────────────────────────────────────────────────────────
    const oppValue = rentRollRowCount
      ? rentRollRowCount * 100
      : unitCount ? parseInt(unitCount, 10) * 100 : null;

    const oppRes = await fetch('https://api.close.com/api/v1/opportunity/', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        status_type: 'active',
        status_label: 'Interested',
        note: buildNote(body),
        ...(oppValue ? { value: oppValue, value_period: 'annual' } : {}),
      }),
    });
    const opp = await oppRes.json();
    if (!oppRes.ok) {
      const detail = JSON.stringify(opp);
      console.error('Opportunity creation failed:', detail);
      await slackAlert(`⚠️ *submit-to-close*: Opportunity creation failed for lead \`${leadId}\` (${email || 'unknown'})\n\`\`\`${detail}\`\`\``);
    }

    // ── SendGrid list enrollment ───────────────────────────────────────────
    if (email) {
      // Primary list: Kit Downloads or Concierge Submissions
      const primaryListId = formType === 'concierge'
        ? process.env.SENDGRID_CONCIERGE_LIST_ID
        : process.env.SENDGRID_KIT_LIST_ID;

      await enrollInSendGrid({ email, firstName, lastName, listId: primaryListId });

      // Always also enroll in Newsletter Subscribers
      await enrollInSendGrid({ email, firstName, lastName, listId: process.env.SENDGRID_NEWSLETTER_LIST_ID });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, leadId, oppId: opp.id || null, wasExisting: !!existingLeadId }),
    };

  } catch (err) {
    console.error('Unhandled error in submit-to-close:', err);
    await slackAlert(`🚨 *submit-to-close*: Unhandled crash for \`${email || 'unknown'}\` (${formType || 'unknown form'})\n\`\`\`${err.message}\`\`\``);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// ── Note builder ─────────────────────────────────────────────────────────────
function buildNote(data) {
  const lines = [`Form Type: ${data.formType}`];
  if (data.company || data.firm) lines.push(`Company: ${data.company || data.firm}`);
  if (data.unitCount)            lines.push(`Unit Count: ${data.unitCount}`);
  if (data.pms)                  lines.push(`PMS: ${data.pms}`);
  if (data.propertyName)         lines.push(`Property: ${data.propertyName}`);
  if (data.propertyAddress)      lines.push(`Address: ${data.propertyAddress}`);
  if (data.channel)              lines.push(`Channel: ${data.channel}`);
  if (data.hasRentRoll) {
    lines.push(`Rent Roll: ${data.rentRollName || 'Uploaded'}`);
    if (data.rentRollRowCount) lines.push(`Rent Roll Row Count: ${data.rentRollRowCount}`);
    if (data.rentRollDriveUrl) lines.push(`Rent Roll Link: ${data.rentRollDriveUrl}`);
  }
  return lines.join('\n');
}
