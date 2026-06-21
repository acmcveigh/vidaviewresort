const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  /* handle CORS preflight */
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const {
      label,
      depositAmount,
      isFullPayment,
      name,
      email,
      checkin,
      checkout,
      guests,
    } = JSON.parse(event.body || '{}');

    if (!label || !depositAmount) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields.' }),
      };
    }

    const amount = Math.round(parseFloat(depositAmount) * 100);
    if (isNaN(amount) || amount < 50) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid amount.' }),
      };
    }

    const productName = isFullPayment ? label : `Deposit — ${label}`;
    const description = isFullPayment
      ? (checkin && checkout ? `${checkin} → ${checkout}` : 'Add-on experience')
      : (checkin && checkout
          ? `Dates: ${checkin} → ${checkout} · Guests: ${guests || '—'} · Balance due before arrival`
          : 'Reservation deposit · Balance due before arrival');

    const siteUrl = 'https://vidaviewresort.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: productName, description },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: email || undefined,
      metadata: {
        property:   label,
        checkin:    checkin    || '',
        checkout:   checkout   || '',
        guests:     String(guests || ''),
        guest_name: name       || '',
        type:       isFullPayment ? 'full_payment' : 'deposit',
      },
      success_url: `${siteUrl}/booking-confirmed.html?property=${encodeURIComponent(label)}&type=${isFullPayment ? 'full' : 'deposit'}`,
      cancel_url:  `${siteUrl}/`,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
