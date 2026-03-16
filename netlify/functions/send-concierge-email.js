// netlify/functions/send-concierge-email.js

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing environment variables' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { firstName, lastName, firm, phone, email, propertyName, propertyAddress, channel, unitCount, portfolioUnits, pms } = body;
  const channelLabel = channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS' : 'Email &amp; SMS';
  const unitLabel = unitCount ? `~${unitCount} residents` : '—';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || '—';
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };
  }


  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>We're on it — Split Pay Concierge</title>
</head>
<body style="margin:0;padding:0;background-color:#1a2f42;font-family:Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;color:#1a2f42;">Your residents at ${propertyName} will start hearing about Split Pay shortly — we'll handle everything from here.</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a2f42;">
<tr><td align="center" style="padding:32px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

    <!-- Logo bar -->
    <tr>
      <td style="padding:0 0 24px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <img src="https://pmc.splitpay.com/assets/logos/splitpay-logo-white-orange.png" alt="Split Pay" height="28" style="display:block;" />
            </td>
            <td align="right">
              <span style="display:inline-block;background:#00B2A9;color:#fff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:100px;letter-spacing:0.05em;">CONCIERGE</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Dark main card -->
    <tr>
      <td style="background:#1e3448;border-radius:16px 16px 0 0;padding:36px 36px 32px;">

        <p style="margin:0 0 20px;font-size:11px;font-weight:700;color:#00B2A9;letter-spacing:0.08em;text-transform:uppercase;">● Submission received</p>

        <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#ffffff;line-height:1.2;letter-spacing:-0.4px;">We're on it,<br>${firstName || 'there'}.</h1>

        <p style="margin:0 0 28px;font-size:15px;color:#aac4d8;line-height:1.7;">Thanks for submitting <strong style="color:#ffffff;">${propertyName || 'your property'}</strong>${propertyAddress ? ' at ' + propertyAddress : ''}. We'll reach out to your residents on your behalf and let them know they can start splitting rent — no further action needed from you.</p>

        <!-- Table 1: Property details -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#152a3a;border-radius:10px;border:1px solid #2a4a64;margin-bottom:12px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#00B2A9;letter-spacing:0.07em;text-transform:uppercase;">This property</p>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="50%" style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Property</p>
                  <p style="margin:0;font-size:13px;font-weight:700;color:#ffffff;">${propertyName || '—'}</p>
                </td>
                <td width="50%" style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Address</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${propertyAddress || '—'}</p>
                </td>
              </tr>
              <tr>
                <td width="50%">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Outreach channel</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${channelLabel}</p>
                </td>
                <td width="50%">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Residents at this property</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${unitLabel}</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- Table 2: Contact details -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#152a3a;border-radius:10px;border:1px solid #2a4a64;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#00B2A9;letter-spacing:0.07em;text-transform:uppercase;">Your details</p>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="50%" style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Name</p>
                  <p style="margin:0;font-size:13px;font-weight:700;color:#ffffff;">${fullName}</p>
                </td>
                <td width="50%" style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Property Management Firm</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${firm || '—'}</p>
                </td>
              </tr>
              <tr>
                <td width="50%">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Email</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${email}</p>
                </td>
                <td width="50%">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Phone</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${phone || '—'}</p>
                </td>
              </tr>
              <tr>
                <td width="50%" style="padding-top:12px;">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Property Management Software</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${pms || '—'}</p>
                </td>
                <td width="50%" style="padding-top:12px;">
                  <p style="margin:0 0 2px;font-size:10px;color:#5a7a90;text-transform:uppercase;letter-spacing:0.06em;">Total Units (Portfolio)</p>
                  <p style="margin:0;font-size:13px;color:#aac4d8;">${portfolioUnits ? '~' + portfolioUnits + ' units' : '—'}</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- What happens next -->
        <p style="margin:28px 0 14px;font-size:13px;font-weight:700;color:#ffffff;">What happens next</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#00B2A9;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#fff;line-height:20px;">1</span></td>
              <td style="padding-left:10px;font-size:13px;color:#aac4d8;line-height:1.6;">We review your rent roll and prepare personalized outreach</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#00B2A9;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#fff;line-height:20px;">2</span></td>
              <td style="padding-left:10px;font-size:13px;color:#aac4d8;line-height:1.6;">Each resident receives a personalized invitation to sign up</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#00B2A9;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#fff;line-height:20px;">3</span></td>
              <td style="padding-left:10px;font-size:13px;color:#aac4d8;line-height:1.6;">Nothing changes for you — your portal and process stay exactly the same</td>
            </tr></table>
          </td></tr>
        </table>

        <!-- Another property CTA -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
          <tr>
            <td>
              <a href="https://pmc.splitpay.com/#concierge" style="display:inline-block;background:#00B2A9;color:#ffffff;font-size:13px;font-weight:700;padding:10px 22px;border-radius:100px;text-decoration:none;">Submit another property →</a>
            </td>
          </tr>
        </table>

        <!-- Signature -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid #2a4a64;padding-top:24px;width:100%;">
          <tr><td>
            <p style="margin:0 0 14px;font-size:14px;color:#aac4d8;line-height:1.6;">Questions? Just reply or give me a call.</p>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-left:3px solid #00B2A9;padding-left:14px;vertical-align:top;">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#ffffff;">Nils Decker</p>
                  <p style="margin:0 0 10px;font-size:12px;color:#5a7a90;">Head of Business Development · Split Pay</p>
                  <p style="margin:0;font-size:12px;color:#5a7a90;line-height:2;">
                    <a href="tel:+13205924807" style="color:#5a7a90;text-decoration:none;">+1-320-592-4807</a><br>
                    <a href="mailto:nils@splitpay.com" style="color:#00B2A9;text-decoration:none;">nils@splitpay.com</a><br>
                    <a href="https://linkedin.com/in/nilsdecker" style="color:#00B2A9;text-decoration:none;">LinkedIn</a>
                  </p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

      </td>
    </tr>

    <!-- Hub footer - white background with icon grid + orange button -->
    <tr>
      <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="25%" align="center" valign="top" style="padding-bottom:16px;">
              <a href="https://pmc.splitpay.com" style="text-decoration:none;display:block;">
                <p style="margin:0 0 5px;font-size:22px;line-height:1;">📄</p>
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#1a1a1a;">Resident Flyer</p>
                <p style="margin:0;font-size:10px;color:#999;line-height:1.4;">EN, ES &amp; PT · PDF</p>
              </a>
            </td>
            <td width="25%" align="center" valign="top" style="padding-bottom:16px;">
              <a href="https://pmc.splitpay.com" style="text-decoration:none;display:block;">
                <p style="margin:0 0 5px;font-size:22px;line-height:1;">✉️</p>
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#1a1a1a;">Email Templates</p>
                <p style="margin:0;font-size:10px;color:#999;line-height:1.4;">5 ready-to-send</p>
              </a>
            </td>
            <td width="25%" align="center" valign="top" style="padding-bottom:16px;">
              <a href="https://pmc.splitpay.com" style="text-decoration:none;display:block;">
                <p style="margin:0 0 5px;font-size:22px;line-height:1;">💬</p>
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#1a1a1a;">SMS Scripts</p>
                <p style="margin:0;font-size:10px;color:#999;line-height:1.4;">Mobile-ready blasts</p>
              </a>
            </td>
            <td width="25%" align="center" valign="top" style="padding-bottom:16px;">
              <a href="https://pmc.splitpay.com" style="text-decoration:none;display:block;">
                <p style="margin:0 0 5px;font-size:22px;line-height:1;">🎬</p>
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#1a1a1a;">Videos</p>
                <p style="margin:0;font-size:10px;color:#999;line-height:1.4;">Explainer &amp; ads</p>
              </a>
            </td>
          </tr>
          <tr>
            <td colspan="4" align="center" style="padding-top:4px;">
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#E8531A;color:#ffffff;font-size:13px;font-weight:700;padding:11px 28px;border-radius:100px;text-decoration:none;">Marketing hub · pmc.splitpay.com →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:16px 0 0;">
        <p style="margin:0;font-size:11px;color:#2a4a6a;line-height:1.6;text-align:center;">Split Pay · <a href="https://pmc.splitpay.com" style="color:#2a4a6a;text-decoration:none;">pmc.splitpay.com</a> · You're receiving this because you submitted a property through Split Pay Concierge.</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

  const textBody = `Hi ${firstName || 'there'},

We've received your submission for ${propertyName || 'your property'}${propertyAddress ? ' at ' + propertyAddress : ''}.

We'll reach out to your residents on your behalf — no further action needed from you.

What happens next:
1. We review your rent roll and prepare personalized outreach
2. Each resident receives a personalized invitation to sign up
3. Nothing changes for you — your portal and process stay exactly the same

Have more buildings? Submit another property: https://pmc.splitpay.com/#concierge
Need marketing materials? Visit the hub: https://pmc.splitpay.com

Questions? Just reply to this email or call me at +1-320-592-4807.

Nils Decker
Head of Business Development · Split Pay
nils@splitpay.com`;

  try {
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'pm-support@o.splitpay.com', name: 'Nils at Split Pay' },
        reply_to: { email: 'pm-support@o.splitpay.com', name: 'Nils at Split Pay' },
        subject: `We're on it — your residents at ${propertyName || 'your property'} are next`,
        content: [
          { type: 'text/plain', value: textBody },
          { type: 'text/html', value: htmlBody },
        ],
      }),
    });

    if (!sgRes.ok) {
      const err = await sgRes.text();
      console.error('SendGrid error:', err);
      return { statusCode: 502, body: JSON.stringify({ error: 'SendGrid error', detail: err }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('send-concierge-email error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
