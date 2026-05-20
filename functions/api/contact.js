/**
 * Sky Rope contact form — Cloudflare Pages Function
 *
 * Receives JSON POST from the website's enquiry form, validates server-side,
 * persists the lead to Cloudflare D1, and notifies the sales inbox via Resend.
 *
 * Bindings expected (set in Cloudflare dashboard → Pages → Settings):
 *   env.DB              — D1 database binding named "DB"
 *   env.RESEND_API_KEY  — Resend API key (encrypted secret)
 *
 * D1 schema: see schema.sql in the project root.
 */

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
};

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: CORS });

const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const escapeHtml = (str) =>
    String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const phone = (body.phone || '').toString().trim();
    const company = (body.company || '').toString().trim();
    const service = (body.service || '').toString().trim();
    const message = (body.message || '').toString().trim();
    const source = (body.source || 'website').toString().trim().slice(0, 100);

    // Server-side validation
    if (!name)              return json({ error: 'Name is required', field: 'name' }, 400);
    if (!email)             return json({ error: 'Email is required', field: 'email' }, 400);
    if (!isEmail(email))    return json({ error: 'Invalid email', field: 'email' }, 400);
    if (!service)           return json({ error: 'Service is required', field: 'service' }, 400);
    if (!message)           return json({ error: 'Message is required', field: 'message' }, 400);

    // Soft length caps (defensive)
    if (name.length > 200 || email.length > 200 || (phone && phone.length > 50)
        || (company && company.length > 200) || service.length > 200 || message.length > 5000) {
        return json({ error: 'One or more fields exceed maximum length' }, 400);
    }

    const createdAt = new Date().toISOString();

    // ----- D1 insert -----
    try {
        const leadResult = await env.DB.prepare(`
            INSERT INTO leads
              (name, email, phone, company, service, message, source, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
        `).bind(
            name,
            email,
            phone || null,
            company || null,
            service,
            message,
            source,
            createdAt
        ).run();

        // Auto-assign to pipeline: Stage = New Inquiry (1), Status = New (1)
        const leadId = leadResult.meta?.last_row_id;
        if (leadId) {
            await env.DB.prepare(`
                INSERT OR IGNORE INTO lead_pipeline
                  (lead_id, stage_id, status_id, updated_at, created_at)
                VALUES (?, 1, 1, datetime('now'), datetime('now'))
            `).bind(leadId).run();
        }
    } catch (err) {
        console.error('D1 insert failed:', err && err.message ? err.message : err);
        return json({ error: 'Failed to process' }, 500);
    }

    // ----- Resend notification email -----
    // Send only if API key is configured; otherwise log and continue (lead is already saved).
    if (env.RESEND_API_KEY) {
        try {
            const safe = {
                name: escapeHtml(name),
                email: escapeHtml(email),
                phone: escapeHtml(phone || '—'),
                company: escapeHtml(company || '—'),
                service: escapeHtml(service),
                message: escapeHtml(message).replace(/\n/g, '<br>'),
                source: escapeHtml(source)
            };

            const html = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden;">
                <div style="background:#009a8e;padding:24px 32px;">
                  <h2 style="color:#fff;margin:0;font-size:20px;">New Enquiry — Sky Rope Technical Services</h2>
                </div>
                <div style="padding:32px;background:#fff;">
                  <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr style="border-bottom:1px solid #f0f0f0;">
                      <td style="padding:10px 0;color:#888;width:130px;">Name</td>
                      <td style="padding:10px 0;color:#222;font-weight:600;">${safe.name}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                      <td style="padding:10px 0;color:#888;">Email</td>
                      <td style="padding:10px 0;"><a href="mailto:${safe.email}" style="color:#009a8e;">${safe.email}</a></td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                      <td style="padding:10px 0;color:#888;">Phone</td>
                      <td style="padding:10px 0;color:#222;">${safe.phone}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                      <td style="padding:10px 0;color:#888;">Company</td>
                      <td style="padding:10px 0;color:#222;">${safe.company}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                      <td style="padding:10px 0;color:#888;">Service</td>
                      <td style="padding:10px 0;color:#009a8e;font-weight:600;">${safe.service}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                      <td style="padding:10px 0;color:#888;vertical-align:top;">Message</td>
                      <td style="padding:10px 0;color:#222;line-height:1.6;">${safe.message}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;color:#888;">Source</td>
                      <td style="padding:10px 0;color:#888;font-style:italic;">${safe.source}</td>
                    </tr>
                  </table>
                </div>
                <div style="background:#f7f8f9;padding:16px 32px;font-size:12px;color:#aaa;text-align:center;">
                  Submitted ${new Date().toUTCString()} · skyropetechnical.com
                </div>
              </div>
            `;

            const resendRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'Sky Rope Website <noreply@skyropetechnical.com>',
                    to: ['sales@skyropetechnical.com'],
                    reply_to: email,
                    subject: `New Enquiry — ${service} from ${name}`,
                    html
                })
            });

            if (!resendRes.ok) {
                const errText = await resendRes.text().catch(() => '');
                console.error('Resend non-2xx:', resendRes.status, errText);
                // Do not fail the request — lead is already stored in D1.
            }
        } catch (err) {
            console.error('Resend send failed:', err && err.message ? err.message : err);
            // Same as above: lead is saved, just continue.
        }
    } else {
        console.warn('RESEND_API_KEY not set — skipping email notification.');
    }

    return json({ success: true });
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// Any other method → 405
export async function onRequest({ request }) {
    return json({ error: `Method ${request.method} not allowed` }, 405);
}
