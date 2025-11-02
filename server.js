// server.js (Production Ready)
const express = require('express');
const crypto = require('crypto');
const qs = require('qs');
const path = require('path');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Environment variables (will be set in Render)
const PF_MERCHANT_ID = process.env.PF_MERCHANT_ID;
const PF_MERCHANT_KEY = process.env.PF_MERCHANT_KEY;
const PF_PASSPHRASE = process.env.PF_PASSPHRASE;
const PORT = process.env.PORT || 3000;

// Validate required environment variables
if (!PF_MERCHANT_ID || !PF_MERCHANT_KEY || !PF_PASSPHRASE) {
    console.error('Missing required environment variables: PF_MERCHANT_ID, PF_MERCHANT_KEY, PF_PASSPHRASE');
    process.exit(1);
}

// Order recommended by PayFast
const PF_ORDER = [
    "merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url",
    "name_first", "name_last", "email_address", "cell_number",
    "m_payment_id", "amount", "item_name", "item_description"
];

function encodeRFC3986(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateSignature(params = {}) {
    const parts = [];
    for (const key of PF_ORDER) {
        if (params[key] !== undefined && params[key] !== null && String(params[key]) !== '') {
            parts.push(`${key}=${encodeRFC3986(String(params[key]).trim())}`);
        }
    }
    let temp = parts.join('&');
    if (PF_PASSPHRASE && PF_PASSPHRASE.length) {
        temp += `&passphrase=${encodeRFC3986(PF_PASSPHRASE)}`;
    }
    return crypto.createHash('md5').update(temp).digest('hex');
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Pay endpoint
app.get('/pay', (req, res) => {
    try {
        const amount = parseFloat(req.query.amount || '0').toFixed(2);

        if (isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Use your Render URL for return URLs
        const baseUrl = process.env.RENDER_URL || `https://${req.get('host')}`;
        
        const pfData = {
            merchant_id: PF_MERCHANT_ID,
            merchant_key: PF_MERCHANT_KEY,
            return_url: `${baseUrl}/thank-you`,
            cancel_url: `${baseUrl}/cancel`,
            notify_url: `${baseUrl}/payfast-itn`,
            m_payment_id: `don-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            amount: amount,
            item_name: `Donation to I.C Norath NGO`,
            item_description: 'Charitable donation'
        };

        const signature = generateSignature(pfData);
        const action = process.env.NODE_ENV === 'production' 
            ? 'https://www.payfast.co.za/eng/process'
            : 'https://sandbox.payfast.co.za/eng/process';

        let inputs = '';
        for (const [k, v] of Object.entries(pfData)) {
            inputs += `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}" />\n`;
        }
        inputs += `<input type="hidden" name="signature" value="${signature}" />\n`;

        const html = `<!doctype html>
        <html><head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Redirecting to PayFast</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
                .loading { color: #007bff; font-size: 48px; margin-bottom: 20px; }
            </style>
        </head>
        <body onload="document.forms[0].submit();">
            <div class="container">
                <div class="loading">⟳</div>
                <p>Redirecting to PayFast checkout for R${amount}...</p>
                <form action="${action}" method="post">
                    ${inputs}
                    <noscript>
                        <button type="submit">Click here to continue to PayFast</button>
                    </noscript>
                </form>
            </div>
        </body></html>`;

        res.set('Content-Type', 'text/html');
        res.send(html);
    } catch (e) {
        console.error('Pay endpoint error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Thank you page endpoint
app.get('/thank-you', (req, res) => {
    const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Thank You for Your Donation</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .success { color: #28a745; font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 20px; }
            p { color: #666; margin-bottom: 30px; line-height: 1.6; }
            .button { background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success">✓</div>
            <h1>Thank You for Your Donation!</h1>
            <p>Your generous contribution will make a meaningful difference in our community. We appreciate your support.</p>
            <p><strong>Payment Status:</strong> Successful</p>
            <a href="wilapp://donation/success" class="button">Return to App</a>
            <script>
                setTimeout(function() {
                    window.location.href = 'wilapp://donation/success';
                }, 3000);
            </script>
        </div>
    </body>
    </html>`;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
});

// Cancel page endpoint
app.get('/cancel', (req, res) => {
    const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Payment Cancelled</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .cancel { color: #dc3545; font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 20px; }
            p { color: #666; margin-bottom: 30px; line-height: 1.6; }
            .button { background: #6c757d; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="cancel">✕</div>
            <h1>Payment Cancelled</h1>
            <p>Your payment was cancelled. No charges have been made to your account.</p>
            <a href="wilapp://donation/cancelled" class="button">Return to App</a>
            <script>
                setTimeout(function() {
                    window.location.href = 'wilapp://donation/cancelled';
                }, 3000);
            </script>
        </div>
    </body>
    </html>`;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
});

// ITN endpoint
app.post('/payfast-itn', express.urlencoded({ extended: false }), async (req, res) => {
    console.log('ITN data received:', req.body);
    res.status(200).send('OK');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});