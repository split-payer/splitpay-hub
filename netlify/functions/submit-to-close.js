exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
  const auth = 'Basic ' + Buffer.from(CLOSE_API_KEY + ':').toString('base64');

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { formType, ...data } = body;

  try {
    // ── 1. CREATE LEAD ──────────────────────────────────────────────
    const leadPayload = {
      name: data.company || data.firm || `${data.firstName} ${data.lastName}`,
      contacts: [
        {
          name: `${data.firstName} ${data.lastName}`,
          emails: data.email ? [{ email: data.email, type: 'work' }] : [],
          phones: data.phone ? [{ phone: data.phone, type: 'mobile' }] : [],
        },
      ],
      // Custom fields — set these up in Close first, then paste the field IDs below
      custom: {
        'PM Tier': 'Local',
        'Lead Source': 'Hub Form',
        'Instantly Sequence': formType === 'kit' ? 'Kit Download' : 'Concierge',
        ...(data.portfolioSize && { 'Units Under Management': data.portfolioSize }),
        ...(data.pms && { 'PMS': data.pms }),
        ...(data.propertyName && { 'Property Name': data.propertyName }),
        ...(data.propertyAddress && { 'Property Address': data.propertyAddress }),
        ...(data.channel && { 'Concierge Channel': data.channel }),
        ...(data.hasRentRoll && { 'Concierge Requested': true }),
      },
    };

    const leadRes = await fetch('https://api.close.com/api/v1/lead/', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(leadPayload),
    });

    const lead = await leadRes.json();

    if (!leadRes.ok) {
      console.error('Close lead creation failed:', lead);
      return { statusCode: 500, body: JSON.stringify({ error: 'Lead creation failed', details: lead }) };
    }

    // ── 2. CREATE OPPORTUNITY ────────────────────────────────────────
    const oppPayload = {
      lead_id: lead.id,
      note: formType === 'kit'
        ? `Kit downloaded via pmc.splitpay.com. PMS: ${data.pms || 'Unknown'}. Portfolio: ${data.portfolioSize || 'Unknown'}.`
        : `Concierge form submitted. Property: ${data.propertyName || 'Unknown'}. Channel: ${data.channel || 'Unknown'}. Rent roll: ${data.hasRentRoll ? 'Yes' : 'No'}.`,
      // Status ID — replace with your actual "Active" status ID from Close
      // Get it from: https://api.close.com/api/v1/status/opportunity/
      status_id: process.env.CLOSE_OPP_STATUS_ID || null,
      confidence: 10,
      value: 0,
      value_period: 'monthly',
    };

    const oppRes = await fetch('https://api.close.com/api/v1/opportunity/', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(oppPayload),
    });

    const opp = await oppRes.json();

    if (!oppRes.ok) {
      // Lead was created — don't fail the whole request, just log the opp error
      console.error('Close opportunity creation failed:', opp);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, leadId: lead.id, oppId: opp.id || null }),
    };

  } catch (err) {
    console.error('submit-to-close error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};