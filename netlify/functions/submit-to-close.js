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
    formType, firstName, lastName,
    company, firm, email, phone,
    pms, unitCount,
    propertyName, propertyAddress, channel,
    hasRentRoll, rentRollName, rentRollDriveUrl, rentRollRowCount,
  } = body;

  const name = `${firstName || ''} ${lastName || ''}`.trim();
  const companyName = company || firm || '';
  const authHeader = 'Basic ' + Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');

  // ── 1. Look up existing lead by email ──────────────────────────────────────
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

  // ── 2. Build custom fields ─────────────────────────────────────────────────
  const customFields = {
    'custom.Lead Source':              formType === 'kit' ? 'PMC Kit Download' : 'PMC Concierge',
    'custom.PMS':                      pms             || null,
    'custom.Property Name':            propertyName    || null,
    'custom.Property Address':         propertyAddress || null,
    'custom.Concierge Channel':        channel         || null,
    'custom.Concierge Requested':      formType === 'concierge' ? 'Yes' : null,
    'custom.Total Units': unitCount || null,
  };
  Object.keys(customFields).forEach((k) => {
    if (customFields[k] === null) delete customFields[k];
  });

  let leadId;

  if (existingLeadId) {
    // ── 3a. UPDATE existing lead ───────────────────────────────────────────
    const updateRes = await fetch(`https://api.close.com/api/v1/lead/${existingLeadId}/`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...(companyName ? { name: companyName } : {}), ...customFields }),
    });
    if (!updateRes.ok) console.error('Lead update failed:', await updateRes.text());
    leadId = existingLeadId;

  } else {
    // ── 3b. CREATE new lead ────────────────────────────────────────────────
    const leadRes = await fetch('https://api.close.com/api/v1/lead/', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: companyName || name || 'Split Pay PMC Lead',
        contacts: [{ name, emails: email ? [{ type: 'work', email }] : [], phones: phone ? [{ type: 'mobile', phone }] : [] }],
        status: 'New Lead',
        ...customFields,
      }),
    });
    const lead = await leadRes.json();
    if (!leadRes.ok) return { statusCode: 502, body: JSON.stringify({ error: 'Close API error', detail: lead }) };
    leadId = lead.id;
  }

  // ── 4. Create opportunity ──────────────────────────────────────────────────
  const oppValue = rentRollRowCount
    ? rentRollRowCount * 100
    : (unitCount ? parseInt(unitCount, 10) * 100 : null);
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
  if (!oppRes.ok) console.error('Opportunity creation failed:', JSON.stringify(opp));

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, leadId, oppId: opp.id || null, wasExisting: !!existingLeadId }),
  };
};

function buildNote(data) {
  const lines = [`Form Type: ${data.formType}`];
  if (data.company || data.firm)  lines.push(`Company: ${data.company || data.firm}`);
  if (data.unitCount)             lines.push(`Unit Count: ${data.unitCount}`);
  if (data.pms)                   lines.push(`PMS: ${data.pms}`);
  if (data.propertyName)          lines.push(`Property: ${data.propertyName}`);
  if (data.propertyAddress)       lines.push(`Address: ${data.propertyAddress}`);
  if (data.channel)               lines.push(`Channel: ${data.channel}`);
  if (data.hasRentRoll) {
    lines.push(`Rent Roll: ${data.rentRollName || 'Uploaded'}`);
    if (data.rentRollRowCount)    lines.push(`Rent Roll Row Count: ${data.rentRollRowCount}`);
    if (data.rentRollDriveUrl)    lines.push(`Rent Roll Link: ${data.rentRollDriveUrl}`);
  }
  return lines.join('\n');
}