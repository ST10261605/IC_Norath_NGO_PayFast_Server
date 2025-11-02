// server.js -- sandbox
const express = require('express');
const crypto = require('crypto');
const qs = require('qs');

const app = express();
app.use(express.urlencoded({ extended: true }));

// configuration
const PF_MERCHANT_ID = process.env.PF_MERCHANT_ID || '10042229';
const PF_MERCHANT_KEY = process.env.PF_MERCHANT_KEY || '0qf1h50r8zhd5';

// using passphrase for extra layer of security. It is added to the signature to ensure the data has not been tampered with
const PF_PASSPHRASE  = process.env.PF_PASSPHRASE  || 'Folks-Student2-Cheese-Important'; 

// order recommended by lots of PayFast examples (matches the PayFast doc order)
const PF_ORDER = [
  "merchant_id","merchant_key","return_url","cancel_url","notify_url",
  "name_first","name_last","email_address","cell_number",
  "m_payment_id","amount","item_name","item_description"
];

function encodeRFC3986(str) {
  // ensure encoding is compatible with PayFast requirements
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

//function to generate the signature
function generateSignature(params = {}) {
  // build the parameter string in the PF_ORDER order
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

//getting the /pay endpoint e.g GET /pay?amount=26.80
app.get('/pay', (req, res) => {
  try {
    // amount from query: validate this in WIL app when integrating
    const amount = parseFloat(req.query.amount || '0').toFixed(2);

    //if the amount is not a number or less than or equal to 0
    if (isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).send('invalid amount'); //send a 400 status error as that amount is invalid
    }

    // prepare PayFast fields
    const pfData = {
      merchant_id: PF_MERCHANT_ID,
      merchant_key: PF_MERCHANT_KEY,
      return_url: 'https://yourserver.example/thank-you',
      cancel_url: 'https://yourserver.example/cancel',
      notify_url: 'https://yourserver.example/payfast-itn', // PayFast will POST here. The ITN is a notification that displays real-time updates about the status of a payment
      m_payment_id: `don-${Date.now()}`,
      amount: amount,
      item_name: `Donation`
    };

    // generate signature
    const signature = generateSignature(pfData);

    // create an auto-submitting HTML form that posts to PayFast sandbox

    //essentially I am using the /pay endpoint to open this html form which posts to the payfast sandbox 
    //and is opened with the phone's browser
    
    const action = 'https://sandbox.payfast.co.za/eng/process';

    let inputs = '';
    for (const [k,v] of Object.entries(pfData)) {
      inputs += `<input type="hidden" name="${k}" value="${String(v).replace(/"/g,'&quot;')}" />\n`;
    }
    inputs += `<input type="hidden" name="signature" value="${signature}" />\n`;

    //html form
    const html = `<!doctype html>
    <html><head><meta charset="utf-8"><title>Redirecting to PayFast</title></head>
    <body onload="document.forms[0].submit();">
      <p>Redirecting to PayFast checkout for R${amount}...</p>
      <form action="${action}" method="post">
        ${inputs}
        <noscript><button type="submit">Click here to continue</button></noscript>
      </form>
    </body></html>`;

    res.set('Content-Type','text/html');
    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('server error');
  }
});

// ITN / notify endpoint (PayFast POSTs here)
app.post('/payfast-itn', express.urlencoded({ extended: false }), async (req, res) => {
  // PayFast will POST transaction details here.
  // I need to:
  // 1. Verify the signature matches (recompute using my passphrase)
  // 2. Optionally POST back to PayFast's validate endpoint to confirm the data
  // 3. Check source IP or validation result and check amounts -- also add rate limiting so that users dont spam on payfast
  console.log('ITN data received:', req.body);
  // TODO: recompute signature and verify. Then respond with 200 (to showcase success)
  res.status(200).send('OK');
});

// Add thank-you and cancel endpoints for Render
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

app.get('/cancel', (req, res) => {
  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Payment Cancelled</title>
    <style>
      body { font-family: Arial, sans-serif; text-text-align: center; padding: 50px; background: #f5f5f5; }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));