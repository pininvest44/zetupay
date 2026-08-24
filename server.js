require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit: 5 requests per minute
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

    const initiatePayload = {
      amount: Number(amount),
      phoneNumber: phone,
      reference: `${reference || 'ORDER'}-${Date.now()}-${i + 1}`,
      redirectUrl: process.env.REDIRECT_URL || 'https://my-app.com/success',
      currency: 'KES',
      identifier: `cust_${Math.floor(10000 + Math.random() * 90000)}`
    };

    try {
      // Step 1: Initiate session to generate paymentKey
      const initResponse = await axios.post(
        'https://pay.zetupay.co.ke/api/v1/payment/initiate',
        initiatePayload,
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const paymentKey = initResponse.data?.data?.paymentKey;

      if (!paymentKey) {
        throw new Error('Failed to retrieve paymentKey from session initialization.');
      }

      // Step 2: Fire STK Push execution directly to the phone number using paymentKey
      const payResponse = await axios.post(
        'https://pay.zetupay.co.ke/api/v1/payment/pay',
        {
          paymentKey: paymentKey,
          phoneNumber: phone,
          paymentMethod: 'MPESA'
        },
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
        statusCode: payResponse.status,
        paymentKey: paymentKey,
        data: payResponse.data
      });

    } catch (err) {
      results.push({
        phone,
        status: 'FAILED',
        statusCode: err.response?.status || 500,
        error: err.response?.data || err.message
      });
    }

    // 1-second delay between batch requests
    if (i < phoneNumbers.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  res.json({ message: 'Batch processing complete', results });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
