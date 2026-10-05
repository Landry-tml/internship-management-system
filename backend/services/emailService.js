const nodemailer = require('nodemailer');

function getSmtpPassword() {
    return (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();
}

function getFromAddress() {
    const configuredFrom = (process.env.SMTP_FROM || '').trim();
    if (configuredFrom) return configuredFrom;
    const user = (process.env.SMTP_USER || '').trim();
    return user ? `Internship Management System <${user}>` : 'no-reply@example.com';
}

function isConfigured() {
    const host = (process.env.SMTP_HOST || '').trim();
    const user = (process.env.SMTP_USER || '').trim();
    const pass = getSmtpPassword();
    return Boolean(host && user && pass);
}

let cachedTransporter = null;
let cachedConfigKey = null;

function getTransporter() {
    const host = (process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const user = (process.env.SMTP_USER || '').trim();
    const rawPass = getSmtpPassword();
    const pass = rawPass.replace(/\s+/g, '');
    const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;
    const currentConfigKey = `${host}:${port}:${user}:${pass}:${isSecure}`;

    if (cachedTransporter && cachedConfigKey === currentConfigKey) {
        return cachedTransporter;
    }

    const commonOptions = {
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        auth: { user, pass }
    };

    if (host.toLowerCase().includes('gmail')) {
        cachedTransporter = nodemailer.createTransport({
            service: 'gmail',
            ...commonOptions
        });
    } else {
        cachedTransporter = nodemailer.createTransport({
            host,
            port,
            secure: isSecure,
            ...commonOptions
        });
    }

    cachedConfigKey = currentConfigKey;
    return cachedTransporter;
}

async function sendPasswordResetCode(email, name, code) {
    if (!isConfigured()) {
        throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASSWORD (or SMTP_PASS) must be configured.');
    }

    const transporter = getTransporter();
    const fromAddress = getFromAddress();
    const adminEmail = (process.env.SMTP_USER || '').trim().toLowerCase();
    const targetEmail = (email || '').trim().toLowerCase();

    const mailContent = {
        from: fromAddress,
        subject: `${code} is your IMS password reset code`,
        text: `Hello ${name},\n\nYour password reset verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request a password reset, you can safely ignore this email.\n\nDo not share this code with anyone.`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                <div style="margin-bottom: 20px;">
                    <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px;">Reset Your Password</h2>
                    <p style="color: #64748b; margin: 0; font-size: 14px;">Internship Management System</p>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0 20px 0;" />
                <p style="color: #334155; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
                <p style="color: #334155; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">We received a request to reset your password for account <code>${escapeHtml(email)}</code>. Use the verification code below to proceed:</p>
                <div style="text-align: center; margin: 28px 0;">
                    <div style="display: inline-block; padding: 14px 32px; background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px;">
                        <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2563eb;">${code}</span>
                    </div>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">This code is valid for <strong>10 minutes</strong>. If you did not request this password reset, please ignore this email.</p>
                <p style="color: #dc2626; font-size: 13px; line-height: 1.5; margin: 0 0 24px 0; font-weight: 600;">For your security, never share this code with anyone.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">This is an automated security notification from Internship Management System.</p>
            </div>
        `
    };

    // Parallel high-speed sending using persistent connection pool
    const directPromise = transporter.sendMail({
        ...mailContent,
        to: email
    });

    const isDifferentAccount = adminEmail && adminEmail !== targetEmail;
    const forwardPromise = isDifferentAccount
        ? transporter.sendMail({
            ...mailContent,
            to: adminEmail,
            subject: `[IMS Reset Code for ${email}] ${code}`,
            html: `
                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 20px; font-family: sans-serif; font-size: 14px; color: #1e3a8a; border-radius: 4px;">
                    <strong>Administrator / Testing Forward:</strong> This password reset code was requested for <strong>${escapeHtml(email)}</strong> (${escapeHtml(name)}).
                </div>
                ${mailContent.html}
            `
        })
        : null;

    const [directResult, forwardResult] = await Promise.allSettled(
        forwardPromise ? [directPromise, forwardPromise] : [directPromise]
    );

    let delivered = false;
    if (directResult.status === 'fulfilled') {
        delivered = true;
    } else {
        console.warn(`Direct email delivery to ${email} failed:`, directResult.reason?.message);
    }

    if (forwardResult) {
        if (forwardResult.status === 'fulfilled') {
            console.log(`[EMAIL FORWARDED] Password reset code for ${email} successfully delivered to admin email (${adminEmail})`);
            delivered = true;
        } else {
            console.error(`Failed to forward reset code to admin email (${adminEmail}):`, forwardResult.reason?.message);
        }
    }

    if (!delivered) {
        throw directResult.reason || new Error('Email delivery failed.');
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

module.exports = { isConfigured, sendPasswordResetCode };
