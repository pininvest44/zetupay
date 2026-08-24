require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting: 5 requests per minute overall to prevent API spam
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { status: 'error', message: 'Rate limit exceeded: Max 5 requests per minute.' }
});

app.use('/api/', apiLimiter);

app.post('/api/stk-push', async (req, res) => {
  const { phoneNumbers, amount, reference } = req.body;

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ error: 'At least one phone number is required.' });
  }
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ error: 'Valid amount is required.' });
  }

  const results = [];
  const secretKey = process.env.ZETUPAY_SECRET_KEY;

  for (let i = 0; i < phoneNumbers.length; i++) {
    const phone = phoneNumbers[i].trim();
    if (!phone) continue;

    const payload = {
      amount: Number(amount),
      phoneNumber: phone,
      reference: `${reference || 'BULK'}-${Date.now()}-${i + 1}`,
      redirectUrl: process.env.REDIRECT_URL || 'https://my-app.com/success',
      currency: 'KES',
      identifier: `cust_${Math.floor(10000 + Math.random() * 90000)}`
    };

    try {
      const response = await axios.post(
        'https://pay.zetupay.co.ke/api/v1/payment/initiate',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      results.push({
        phone,
        status: 'SUCCESS',
        statusCode: response.status,
        data: response.data
      });
    } catch (err) {
      results.push({
        phone,
        status: 'FAILED',
        statusCode: err.response?.status || 500,
        error: err.response?.data || err.message
      });
    }

    // Delay between processing to avoid overwhelming API limits
    if (i < phoneNumbers.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  res.json({ message: 'Batch processing finished', results });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
