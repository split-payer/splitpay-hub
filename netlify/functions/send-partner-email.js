// netlify/functions/send-partner-email.js
//
// Handles two partner email types:
//   emailType: 'welcome'  — immediate confirmation after partner application
//   emailType: 'monthly'  — monthly reminder (~20th), called by partner-reminder scheduled fn
//
// Called from submit-to-close.js (welcome) and partner-reminder.js (monthly)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SENDGRID_API_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { emailType, firstName, email, company, refSlug } = body;
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };

  const name = firstName || 'there';
  const companyName = company || '';
  const refLink = refSlug ? `https://pmc.splitpay.com/go?ref=${refSlug}` : 'https://pmc.splitpay.com/go';
  const refDisplay = refSlug ? `pmc.splitpay.com/go?ref=${refSlug}` : 'pmc.splitpay.com/go';

  let subject, htmlBody, textBody;

  if (emailType === 'welcome') {
    subject = `You're in — here's your Split Pay referral link`;
    htmlBody = buildWelcomeHtml({ name, companyName, refLink, refDisplay });
    textBody = buildWelcomeText({ name, companyName, refLink });
  } else if (emailType === 'monthly') {
    subject = `Your Split Pay partner link — share it this month`;
    htmlBody = buildMonthlyHtml({ name, companyName, refLink, refDisplay });
    textBody = buildMonthlyText({ name, companyName, refLink });
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid emailType' }) };
  }

  try {
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email, name: name !== 'there' ? name : undefined }] }],
        from: { email: 'pm-support@o.splitpay.com', name: 'Nils at Split Pay' },
        reply_to: { email: 'pm-support@o.splitpay.com', name: 'Nils at Split Pay' },
        subject,
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

    console.log(`send-partner-email: sent ${emailType} to ${email}`);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('send-partner-email error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME EMAIL
// ─────────────────────────────────────────────────────────────────────────────

function buildWelcomeHtml({ name, companyName, refLink, refDisplay }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're in — Split Pay Partner Program</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;font-family:Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;color:#f5f5f0;">Your referral link is ready — start sharing it with residents today.</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f0;">
<tr><td align="center" style="padding:32px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8e0;">

    <!-- Logo bar -->
    <tr>
      <td style="background:#ffffff;padding:20px 32px;border-bottom:1px solid #f0f0ea;">
        <img src="https://pmc.splitpay.com/assets/logos/splitpay-logo.svg" alt="Split Pay" height="32" style="display:block;" />
      </td>
    </tr>

    <!-- Forest green hero -->
    <tr>
      <td style="background-color:#1a3d20;padding:32px 32px 28px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#8ab88f;letter-spacing:0.1em;text-transform:uppercase;">🤝 Partner Program</p>
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#fae182;line-height:1.25;letter-spacing:-0.4px;">You're in${companyName ? ', ' + companyName : ''}.</h1>
      </td>
    </tr>

    <!-- Intro -->
    <tr>
      <td style="padding:32px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;">Hi ${name},</p>
        <p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;">Welcome to the Split Pay Partner Program. We'll confirm your application within 1 business day — but your referral link is ready right now. You can start sharing it today.</p>
      </td>
    </tr>

    <!-- Ref link box -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f0;border-radius:12px;border:1px solid #e8e8e0;">
          <tr><td style="padding:24px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#888;letter-spacing:0.1em;text-transform:uppercase;">Your referral link</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1a3d20;word-break:break-all;">${refDisplay}</p>
            <a href="${refLink}" style="display:inline-block;background:#1a3d20;color:#fae182;font-size:12px;font-weight:700;padding:10px 22px;border-radius:100px;text-decoration:none;">Open your link →</a>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- How to use it -->
    <tr>
      <td style="padding:28px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1a1a1a;">How to use it</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#fae182;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#1a1a1a;line-height:20px;">1</span></td>
              <td style="padding-left:10px;font-size:14px;color:#1a1a1a;line-height:1.6;">Share the link with your residents — via email, text, or post it anywhere</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#fae182;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#1a1a1a;line-height:20px;">2</span></td>
              <td style="padding-left:10px;font-size:14px;color:#1a1a1a;line-height:1.6;">Residents click and sign up for Split Pay</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#fae182;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#1a1a1a;line-height:20px;">3</span></td>
              <td style="padding-left:10px;font-size:14px;color:#1a1a1a;line-height:1.6;">Once 21 residents are active, rev-share kicks in automatically — $3–$5/resident/month</td>
            </tr></table>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Tier reminder -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a3d20;border-radius:10px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#8ab88f;letter-spacing:0.07em;text-transform:uppercase;">Revenue tiers</p>
            <p style="margin:0;font-size:13px;color:#d4e8d4;line-height:1.7;">
              <strong style="color:#fae182;">Growth</strong> (0–20 residents) · Partnership badge + $100 gift card on first activation<br>
              <strong style="color:#fae182;">Local Partner</strong> (21–50) · $3/resident/month<br>
              <strong style="color:#fae182;">Regional Partner</strong> (51–100) · $4/resident/month<br>
              <strong style="color:#fae182;">National Partner</strong> (101+) · $5/resident/month
            </p>
          </td></tr>
        </table>
      </td>
    </tr>


    <!-- Hub cross-sell -->
    <tr>
      <td style="padding:20px 32px 0;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#1a1a1a;">Make the most of your partnership</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e0;border-radius:12px;overflow:hidden;">
          <tr>
            <td width="33%" valign="top" style="padding:16px 18px;border-right:1px solid #e8e8e0;">
              <p style="margin:0 0 5px;font-size:16px;">📄</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1a1a1a;">Starter Kit</p>
              <p style="margin:0 0 10px;font-size:11px;color:#666;line-height:1.45;">Flyers, email templates &amp; SMS scripts ready to share.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#E8531A;color:#fff;font-size:10px;font-weight:700;padding:6px 12px;border-radius:100px;text-decoration:none;">Download kit →</a>
            </td>
            <td width="33%" valign="top" style="padding:16px 18px;border-right:1px solid #e8e8e0;">
              <p style="margin:0 0 5px;font-size:16px;">🤖</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1a1a1a;">Concierge</p>
              <p style="margin:0 0 10px;font-size:11px;color:#666;line-height:1.45;">We contact every resident on your behalf. Done for you.</p>
              <a href="https://pmc.splitpay.com/#concierge" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:10px;font-weight:700;padding:6px 12px;border-radius:100px;text-decoration:none;">Try Concierge →</a>
            </td>
            <td width="33%" valign="top" style="padding:16px 18px;">
              <p style="margin:0 0 5px;font-size:16px;">🏠</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1a1a1a;">Marketing Hub</p>
              <p style="margin:0 0 10px;font-size:11px;color:#666;line-height:1.45;">Videos, logos, staff FAQ &amp; more — everything in one place.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:10px;font-weight:700;padding:6px 12px;border-radius:100px;text-decoration:none;">Visit hub →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Signature -->
    <tr>
      <td style="padding:28px 32px 24px;">
        <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.6;">Questions? Just reply or give me a call.</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="border-left:3px solid #fae182;padding-left:14px;vertical-align:top;">
              <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Nils Decker</p>
              <p style="margin:0 0 10px;font-size:13px;color:#666;">Head of Business Development · Split Pay</p>
              <p style="margin:0;font-size:13px;color:#555;line-height:2;">
                <a href="tel:+17743586955" style="color:#555;text-decoration:none;">+1 774-358-6955</a><br>
                <a href="mailto:nils@splitpay.com" style="color:#E8531A;text-decoration:none;">nils@splitpay.com</a><br>
                <a href="https://pmc.splitpay.com/partners" style="color:#E8531A;text-decoration:none;">pmc.splitpay.com/partners</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f5f5f0;padding:16px 32px;border-top:1px solid #e8e8e0;">
        <p style="margin:0;font-size:11px;color:#999;line-height:1.6;">Split Pay · <a href="https://pmc.splitpay.com/partners" style="color:#999;text-decoration:none;">pmc.splitpay.com/partners</a> · You're receiving this because you applied to the Split Pay Partner Program.</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeText({ name, companyName, refLink }) {
  return `Hi ${name},

Welcome to the Split Pay Partner Program${companyName ? ' — ' + companyName : ''}. We'll confirm your application within 1 business day, but your referral link is live now.

YOUR REFERRAL LINK
${refLink}

Share it with your residents — via email, text, or anywhere. Every resident who signs up through your link is tracked to you.

REVENUE TIERS
- Growth (0–20 residents): Partnership badge + $100 gift card on first activation
- Local Partner (21–50): $3/resident/month
- Regional Partner (51–100): $4/resident/month
- National Partner (101+): $5/resident/month

Tiers upgrade automatically — no action needed from you.

Questions? Just reply or call me at +1 774-358-6955.

---
MARKETING RESOURCES FOR PARTNERS
📄 Starter Kit (flyers, templates, SMS scripts): https://pmc.splitpay.com
🤖 Concierge (we contact your residents for you): https://pmc.splitpay.com/#concierge
🏠 Full marketing hub: https://pmc.splitpay.com
---

Nils Decker
Head of Business Development · Split Pay
nils@splitpay.com`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY REMINDER EMAIL
// ─────────────────────────────────────────────────────────────────────────────

function buildMonthlyHtml({ name, companyName, refLink, refDisplay }) {
  const month = new Date().toLocaleString('en-US', { month: 'long' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Split Pay partner link — ${month}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;font-family:Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;color:#f5f5f0;">Your referral link for ${month} — share it with residents to grow your rev-share.</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f0;">
<tr><td align="center" style="padding:32px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8e0;">

    <!-- Logo bar -->
    <tr>
      <td style="background:#ffffff;padding:20px 32px;border-bottom:1px solid #f0f0ea;">
        <img src="https://pmc.splitpay.com/assets/logos/splitpay-logo.svg" alt="Split Pay" height="32" style="display:block;" />
      </td>
    </tr>

    <!-- Hero -->
    <tr>
      <td style="background-color:#1a3d20;padding:32px 32px 28px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#8ab88f;letter-spacing:0.1em;text-transform:uppercase;">📅 ${month} · Partner Update</p>
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#fae182;line-height:1.25;letter-spacing:-0.4px;">Your referral link<br>for ${month}.</h1>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:32px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;">Hi ${name},</p>
        <p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;">Quick reminder — your Split Pay referral link is still live. Every resident who signs up through it counts toward your rev-share tier. The more you share it, the faster you climb.</p>
      </td>
    </tr>

    <!-- Ref link box -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f0;border-radius:12px;border:1px solid #e8e8e0;">
          <tr><td style="padding:24px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#888;letter-spacing:0.1em;text-transform:uppercase;">Your referral link</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1a3d20;word-break:break-all;">${refDisplay}</p>
            <a href="${refLink}" style="display:inline-block;background:#1a3d20;color:#fae182;font-size:12px;font-weight:700;padding:10px 22px;border-radius:100px;text-decoration:none;">Open your link →</a>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Quick share ideas -->
    <tr>
      <td style="padding:28px 32px 0;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1a1a1a;">Quick ways to share this month</p>
        <table cellpadding="0" cellspacing="0" border="0" style="background:#f9f9f4;border-radius:10px;width:100%;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#444;line-height:2;">
              📧 &nbsp;Drop it in your next resident email blast<br>
              💬 &nbsp;Add it to your SMS rent reminder<br>
              📋 &nbsp;Pin it to your leasing office board<br>
              🏠 &nbsp;Include it in new resident welcome packets
            </p>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Tier reminder -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a3d20;border-radius:10px;">
          <tr><td style="padding:16px 24px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#8ab88f;letter-spacing:0.07em;text-transform:uppercase;">Revenue tiers — upgrades automatically</p>
            <p style="margin:0;font-size:13px;color:#d4e8d4;line-height:1.7;">
              <strong style="color:#fae182;">21–50 residents</strong> → $3/mo each &nbsp;·&nbsp;
              <strong style="color:#fae182;">51–100</strong> → $4/mo &nbsp;·&nbsp;
              <strong style="color:#fae182;">101+</strong> → $5/mo
            </p>
          </td></tr>
        </table>
      </td>
    </tr>


    <!-- Hub cross-sell -->
    <tr>
      <td style="padding:20px 32px 0;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#1a1a1a;">Make the most of your partnership</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e0;border-radius:12px;overflow:hidden;">
          <tr>
            <td width="33%" valign="top" style="padding:16px 18px;border-right:1px solid #e8e8e0;">
              <p style="margin:0 0 5px;font-size:16px;">📄</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1a1a1a;">Starter Kit</p>
              <p style="margin:0 0 10px;font-size:11px;color:#666;line-height:1.45;">Flyers, email templates &amp; SMS scripts ready to share.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#E8531A;color:#fff;font-size:10px;font-weight:700;padding:6px 12px;border-radius:100px;text-decoration:none;">Download kit →</a>
            </td>
            <td width="33%" valign="top" style="padding:16px 18px;border-right:1px solid #e8e8e0;">
              <p style="margin:0 0 5px;font-size:16px;">🤖</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1a1a1a;">Concierge</p>
              <p style="margin:0 0 10px;font-size:11px;color:#666;line-height:1.45;">We contact every resident on your behalf. Done for you.</p>
              <a href="https://pmc.splitpay.com/#concierge" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:10px;font-weight:700;padding:6px 12px;border-radius:100px;text-decoration:none;">Try Concierge →</a>
            </td>
            <td width="33%" valign="top" style="padding:16px 18px;">
              <p style="margin:0 0 5px;font-size:16px;">🏠</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1a1a1a;">Marketing Hub</p>
              <p style="margin:0 0 10px;font-size:11px;color:#666;line-height:1.45;">Videos, logos, staff FAQ &amp; more — everything in one place.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:10px;font-weight:700;padding:6px 12px;border-radius:100px;text-decoration:none;">Visit hub →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Signature -->
    <tr>
      <td style="padding:28px 32px 24px;">
        <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.6;">Any questions, just reply.</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="border-left:3px solid #fae182;padding-left:14px;vertical-align:top;">
              <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Nils Decker</p>
              <p style="margin:0 0 10px;font-size:13px;color:#666;">Head of Business Development · Split Pay</p>
              <p style="margin:0;font-size:13px;color:#555;line-height:2;">
                <a href="tel:+17743586955" style="color:#555;text-decoration:none;">+1 774-358-6955</a><br>
                <a href="mailto:nils@splitpay.com" style="color:#E8531A;text-decoration:none;">nils@splitpay.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f5f5f0;padding:16px 32px;border-top:1px solid #e8e8e0;">
        <p style="margin:0;font-size:11px;color:#999;line-height:1.6;">Split Pay · <a href="https://pmc.splitpay.com/partners" style="color:#999;text-decoration:none;">pmc.splitpay.com/partners</a> · You're receiving this as a Split Pay partner. Reply to unsubscribe.</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

function buildMonthlyText({ name, companyName, refLink }) {
  const month = new Date().toLocaleString('en-US', { month: 'long' });
  return `Hi ${name},

Quick ${month} reminder — your Split Pay referral link is live. Every resident who signs up through it counts toward your rev-share.

YOUR REFERRAL LINK
${refLink}

Quick ways to share: resident emails, SMS rent reminders, leasing office, welcome packets.

TIERS (auto-upgrade):
- 21–50 residents → $3/resident/month
- 51–100 → $4/resident/month  
- 101+ → $5/resident/month

Any questions, just reply.

---
MARKETING RESOURCES FOR PARTNERS
📄 Starter Kit (flyers, templates, SMS scripts): https://pmc.splitpay.com
🤖 Concierge (we contact your residents for you): https://pmc.splitpay.com/#concierge
🏠 Full marketing hub: https://pmc.splitpay.com
---

Nils Decker
Head of Business Development · Split Pay
nils@splitpay.com`;
}
