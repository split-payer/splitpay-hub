// netlify/functions/submit-to-close.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
  if (!CLOSE_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing CLOSE_API_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    formType,       // 'kit' | 'concierge'
    firstName,
    lastName,
    company,        // Kit form: company name
    firm,           // Concierge form: firm name
    email,
    phone,
    portfolioSize,  // Kit form only
    pms,            // Kit form only
    unitCount,      // Kit form only: exact unit count for opp value
    propertyName,   // Concierge form only
    propertyAddress,// Concierge form only
    channel,        // Concierge form only: 'email' | 'sms' | 'both'
    hasRentRoll,    // Concierge form only
    rentRollName,   // Concierge form only
  } = body;

  const name = `${firstName || ''} ${lastName || ''}`.trim();
  const companyName = company || firm || '';

  // Build the Close lead payload
  const leadPayload = {
    name: companyName || name || 'Split Pay PMC Lead',
    contacts: [
      {
        name,
        emails: email ? [{ type: 'work', email }] : [],
        phones: phone ? [{ type: 'mobile', phone }] : [],
      },
    ],
    // Initial pipeline status — "New Lead"
    status: 'New Lead',
    // Custom fields — must match exactly what's in your Close account
    'custom.Lead Source':       formType === 'kit' ? 'PMC Kit Download' : 'PMC Concierge',
    'custom.PMS':               pms            || null,
    'custom.Units Under Management': portfolioSize || null,
    'custom.Property Name':     propertyName   || null,
    'custom.Property Address':  propertyAddress || null,
    'custom.Concierge Channel': channel        || null,
    'custom.Concierge Requested': formType === 'concierge' ? 'Yes' : null,
  };

  // Remove null custom fields to avoid Close API errors
  Object.keys(leadPayload).forEach((key) => {
    if (key.startsWith('custom.') && leadPayload[key] === null) {
      delete leadPayload[key];
    }
  });

  const authHeader = 'Basic ' + Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');

  try {
    // 1. Create the lead
    const leadRes = await fetch('https://api.close.com/api/v1/lead/', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(leadPayload),
    });

    const lead = await leadRes.json();

    if (!leadRes.ok) {
      console.error('Close lead creation failed:', JSON.stringify(lead));
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Close API error', detail: lead }),
      };
    }

    // 2. Create an opportunity on the lead
    // value = unit count * $500 (estimated ARR proxy — adjust multiplier as needed)
    const oppValue = unitCount ? parseInt(unitCount, 10) * 100 : null;

    const oppPayload = {
      lead_id:      lead.id,
      status_type:  'active',
      status_label: 'Interested',
      note:         buildNote(body),
      ...(oppValue ? { value: oppValue, value_period: 'annual' } : {}),
    };

    const oppRes = await fetch('https://api.close.com/api/v1/opportunity/', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(oppPayload),
    });

    const opp = await oppRes.json();

    if (!oppRes.ok) {
      // Lead was created — don't fail the whole request
      console.error('Close opportunity creation failed:', JSON.stringify(opp));
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

function buildNote(data) {
  const lines = [];
  lines.push(`Form Type: ${data.formType}`);
  if (data.company || data.firm) lines.push(`Company: ${data.company || data.firm}`);
  if (data.portfolioSize)  lines.push(`Portfolio Size: ${data.portfolioSize}`);
  if (data.unitCount)      lines.push(`Unit Count: ${data.unitCount}`);
  if (data.pms)            lines.push(`PMS: ${data.pms}`);
  if (data.propertyName)   lines.push(`Property: ${data.propertyName}`);
  if (data.propertyAddress)lines.push(`Address: ${data.propertyAddress}`);
  if (data.channel)        lines.push(`Channel: ${data.channel}`);
  if (data.hasRentRoll)    lines.push(`Rent Roll: ${data.rentRollName || 'Uploaded'}`);
  return lines.join('\n');
}