const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const API_KEY = process.env.ZETUPAY_SECRET_KEY;
const API_URL = 'https://pay.zetupay.co.ke/api/v1/payment/initiate';

app.post('/api/bulk-stk', async (req, res) => {
  const { phoneNumbers, amount, reference, redirectUrl } = req.body;

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ error: 'At least one phone number is required.' });
  }

  // Set SSE headers for real-time log streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLog = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < phoneNumbers.length; i++) {
    const phone = phoneNumbers[i].trim();
    if (!phone) continue;

    const payload = {
      amount: Number(amount),
      phoneNumber: phone,
      reference: `${reference}-${i + 1}`,
      redirectUrl: redirectUrl || 'https://my-app.com/success'
    };

    try {
      const response = await axios.post(API_URL, payload, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      sendLog({
        status: 'SUCCESS',
        phone,
        reference: payload.reference,
        statusCode: response.status,
        data: response.data
      });
    } catch (error) {
      sendLog({
        status: 'FAILURE',
        phone,
        reference: payload.reference,
        statusCode: error.response ? error.response.status : 500,
        error: error.response ? error.response.data : error.message
      });
    }

    // Rate Limiting: 30 requests/min = 1 request every 2000ms
    if (i < phoneNumbers.length - 1) {
      await delay(2000);
    }
  }

  sendLog({ status: 'COMPLETE' });
  res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
