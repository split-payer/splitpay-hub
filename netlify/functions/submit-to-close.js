// netlify/functions/submit-to-close.js

// ── Custom Field IDs (Lead-scoped) ────────────────────────────────────────────
const CF = {
  leadSource:         'cf_EOQPBnrrysvnIKFiTN7yANCjTULX8zvYoICmsiaeQA0',
  pms:                'cf_Jr0LDrn6Nj1pxvMyKQtq6p9TF7nsWwHKMcmRj9SsX7m',
  // propertyName is Contact-scoped — removed from lead payload
  // propertyAddress is Contact-scoped — removed from lead payload
  conciergeChannel:   'cf_JXm6UvEEHIwkXySm3XQdeMTrjUgv25gnvkeSFZdU5Go',
  conciergeRequested: 'cf_IqQ1s9ZshyYPq60cEdSGPTVGV3zcFrrqyK0wXvw8nkm',
  totalUnits:         'cf_5HP7O9bC0L2Evm71ibnEOMg3VcuedBmj7w0Xq78sfOL',
  kitDownloaded:      'cf_PACYZMcqEhj64C9CodO5VKS7sVcmly92zDwZcHuvJCH',
  partnerRefSlug: 'cf_5NfIAJEjrKVL6v4pJqk4Ql9MRZUl2Ut8tMLDJOQ0SdK',
};

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

async function enrollInSendGrid({ email, firstName, lastName, listId }) {
  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) { console.warn('SENDGRID_API_KEY not set — skipping'); return; }
  if (!email || !listId) { console.warn('enrollInSendGrid: missing email or listId — skipping'); return; }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
  if (!CLOSE_API_KEY) {
    await slackAlert('🚨 *submit-to-close*: Missing CLOSE_API_KEY');
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
    // partner-specific
    portfolioSize, website, refSlug,
  } = body;

  const name = `${firstName || ''} ${lastName || ''}`.trim();
  const companyName = company || firm || '';
  const authHeader = 'Basic ' + Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');

  try {
    // ── 1. Search for existing lead by email ──────────────────────────────
    let existingLeadId = null;
    if (email) {
      try {
        const searchRes = await fetch(
          `https://api.close.com/api/v1/lead/?query=${encodeURIComponent(`email:"${email}"`)}`,
          { headers: { Authorization: authHeader, Accept: 'application/json' } }
        );
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) existingLeadId = searchData.data[0].id;
      } catch (err) {
        console.error('Lead search error:', err);
      }
    }

    // ── 2. Build custom fields ────────────────────────────────────────────
    const leadSourceMap = {
      kit:       'PMC Kit Download',
      concierge: 'PMC Concierge',
      partner:   'PMC Partner Application',
    };

    const customFieldValues = {
      [CF.leadSource]:         leadSourceMap[formType] || formType,
      [CF.pms]:                pms || null,
      [CF.conciergeChannel]:   channel || null,
      [CF.conciergeRequested]: formType === 'concierge' ? 'Yes' : null,
      [CF.totalUnits]:         unitCount || portfolioSize || null,
      [CF.kitDownloaded]:      formType === 'kit' ? 'Yes' : null,
      [CF.partnerRefSlug]: refSlug || null,
    };
    Object.keys(customFieldValues).forEach((k) => {
      if (customFieldValues[k] === null) delete customFieldValues[k];
    });

    // ── 3. Create or update lead ──────────────────────────────────────────
    let leadId;
    if (existingLeadId) {
      const updateRes = await fetch(`https://api.close.com/api/v1/lead/${existingLeadId}/`, {
        method: 'PUT',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...(companyName ? { name: companyName } : {}),
          custom: customFieldValues,
        }),
      });
      if (!updateRes.ok) {
        const detail = await updateRes.text();
        console.error('Lead update failed:', detail);
        await slackAlert(`⚠️ *submit-to-close*: Lead update failed for \`${email || 'unknown'}\`\n\`\`\`${detail}\`\`\``);
      } else {
        console.log(`Close: updated lead ${existingLeadId}`);
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
          custom: customFieldValues,
        }),
      });
      const lead = await leadRes.json();
      if (!leadRes.ok) {
        const detail = JSON.stringify(lead);
        console.error('Lead creation failed:', detail);
        await slackAlert(`🚨 *submit-to-close*: Lead creation failed for \`${email || 'unknown'}\` (${formType})\n\`\`\`${detail}\`\`\``);
        return { statusCode: 502, body: JSON.stringify({ error: 'Close API error', detail: lead }) };
      }
      console.log(`Close: created lead ${lead.id}`);
      leadId = lead.id;
    }

    // ── 4. Activity note ──────────────────────────────────────────────────
    if (formType === 'kit') {
      await fetch('https://api.close.com/api/v1/activity/note/', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ lead_id: leadId, note: 'Kit downloaded via pmc.splitpay.com' }),
      });
    }

    // ── 5. Opportunity ────────────────────────────────────────────────────
    const oppNote = buildNote(body);
    const oppValue = rentRollRowCount ? rentRollRowCount * 100
                   : unitCount ? parseInt(unitCount, 10) * 100
                   : portfolioSize ? parseInt(portfolioSize, 10) * 100
                   : null;

    let opp = { id: null };
    let dupOpp = false;
    try {
      const existingOppsRes = await fetch(
        `https://api.close.com/api/v1/opportunity/?lead_id=${leadId}&_limit=20`,
        { headers: { Authorization: authHeader, Accept: 'application/json' } }
      );
      const existingOpps = await existingOppsRes.json();
      dupOpp = (existingOpps.data || []).some((o) => o.note === oppNote);
    } catch (err) {
      console.error('Opp dedup check failed:', err.message);
    }

    if (dupOpp) {
      console.log(`Close: duplicate opp skipped for lead ${leadId}`);
    } else {
      const oppRes = await fetch('https://api.close.com/api/v1/opportunity/', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          status_type: 'active',
          status_label: 'Interested',
          note: oppNote,
          ...(oppValue ? { value: oppValue, value_period: 'annual' } : {}),
        }),
      });
      opp = await oppRes.json();
      if (!oppRes.ok) {
        const detail = JSON.stringify(opp);
        console.error('Opportunity creation failed:', detail);
        await slackAlert(`⚠️ *submit-to-close*: Opportunity creation failed for lead \`${leadId}\`\n\`\`\`${detail}\`\`\``);
      }
    }

    // ── 6. SendGrid enrollment ────────────────────────────────────────────
    if (email && formType !== 'partner') {
      const primaryListId = formType === 'concierge'
        ? process.env.SENDGRID_CONCIERGE_LIST_ID
        : process.env.SENDGRID_KIT_LIST_ID;
      await enrollInSendGrid({ email, firstName, lastName, listId: primaryListId });
      await enrollInSendGrid({ email, firstName, lastName, listId: process.env.SENDGRID_NEWSLETTER_LIST_ID });
    }

    // ── 7. Slack alert ────────────────────────────────────────────────────
    const alertLines = {
      kit:       `📥 *Kit download*: ${name || email} (${companyName || '—'})`,
      concierge: `🏠 *Concierge*: ${name || email} — ${propertyName || propertyAddress || '—'}`,
      partner:   `🤝 *Partner application*: ${name || email} (${companyName || '—'}) · ref: \`${refSlug || '—'}\``,
    };
    await slackAlert(alertLines[formType] || `📋 *Form submit* (${formType}): ${email}`);

    // ── 8. Partner welcome email ──────────────────────────────────────────
    if (formType === 'partner' && email) {
      try {
        const siteUrl = process.env.URL || 'https://pmc.splitpay.com';
        await fetch(`${siteUrl}/.netlify/functions/send-partner-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailType: 'welcome',
            firstName,
            email,
            company: companyName,
            refSlug,
          }),
        });
        console.log(`send-partner-email: welcome queued for ${email}`);
      } catch (err) {
        console.error('send-partner-email call failed:', err.message);
        // non-fatal — lead is already saved
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, leadId, oppId: opp.id || null, wasExisting: !!existingLeadId }),
    };

  } catch (err) {
    console.error('Unhandled error in submit-to-close:', err);
    await slackAlert(`🚨 *submit-to-close*: Unhandled crash for \`${email || 'unknown'}\` (${formType || 'unknown'})\n\`\`\`${err.message}\`\`\``);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function buildNote(data) {
  const lines = [`Form Type: ${data.formType}`];
  if (data.company || data.firm) lines.push(`Company: ${data.company || data.firm}`);
  if (data.unitCount) lines.push(`Unit Count: ${data.unitCount}`);
  if (data.portfolioSize) lines.push(`Portfolio Size: ${data.portfolioSize}`);
  if (data.pms) lines.push(`PMS: ${data.pms}`);
  if (data.propertyName) lines.push(`Property: ${data.propertyName}`);
  if (data.propertyAddress) lines.push(`Address: ${data.propertyAddress}`);
  if (data.website) lines.push(`Website: ${data.website}`);
  if (data.refSlug) lines.push(`Referral Slug: ${data.refSlug}`);
  if (data.channel) lines.push(`Channel: ${data.channel}`);
  if (data.hasRentRoll) {
    lines.push(`Rent Roll: ${data.rentRollName || 'Uploaded'}`);
    if (data.rentRollRowCount) lines.push(`Rent Roll Row Count: ${data.rentRollRowCount}`);
    if (data.rentRollDriveUrl) lines.push(`Rent Roll Link: ${data.rentRollDriveUrl}`);
  }
  return lines.join('\n');
}
