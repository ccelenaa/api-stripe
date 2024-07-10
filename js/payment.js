const express = require('express')
const app = express()
var bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid');
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const port = 3003
const stripe = require('stripe')('sk_test_51Hark4KsN1yd9fSIQvlfdE1uJbjJsCiS07Z97lSBUG2GRApc3zjNiqkSxXnvShyyJETh5dorzEU9tSeYhuETpAGj00v6rmHDzg');

app.get('/', (req, res) => {
  res.status(200).json({ from: 'payment api' });
})

app.post('/payment', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: 'kamal.mehdi.dev@gmail.com',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Adhésion',
            description: 'Procuit description',
            images: ['https://www.campingoasis.com/wp-content/uploads/2018/04/merci.jpg']
          },
          unit_amount: 5000,
        },
        quantity: 1,
        description: 'Description a ajouter ...',
      },
    ],
    mode: 'payment',
    locale: 'fr',
    success_url: 'https://bleme.fr',
    cancel_url: 'https://iheggaren.bleme.fr/galerie',
  });

  res.json({ id: session.id });
});

app.post('/setup', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: 'kamal.mehdi.dev@gmail.com',
    mode: 'setup',
    locale: 'fr',
    success_url: 'https://bleme.fr',
    cancel_url: 'https://iheggaren.bleme.fr/galerie',
  });

  res.json({ id: session.id });
});

app.post('/charge', async (req, res) => {
  try {
    const { token } = req.body;
    console.log(req.body);

    const customer = await stripe.customers.create({
      email: token.email,
      source: token.id
    });

    const idempotencyKey = uuidv4();
    const charge = await stripe.charges.create({
      amount: 9000,
      currency: 'eur',
      customer: customer.id,
      description: 'Test live Abonnement',
      shipping: {
        name: token.card.name,
        address: {
          line1: token.card.address_line1,
          line2: token.card.address_line2,
          city: token.card.address_city,
          country: token.card.address_country,
          postal_code: token.card.address_zip
        }
      }
    }, {
      idempotencyKey
    });
    console.log({ charge });
    res.status(200).json({ charge });

    // 

    // stripe.balance.retrieve(function (err, balance) {
    //     console.log(JSON.stringify(balance));
    // });

    // stripe.balanceTransactions.list().then((data) => {
    //     console.log(data);
    // });



    // stripe.paymentMethods.create({
    //     type: 'card',
    //     card: {
    //         number: '4242424242424242',
    //         exp_month: 10,
    //         exp_year: 2021,
    //         cvc: '314',
    //     },
    // }).then(paymentMethod => {
    //     console.log(paymentMethod);
    // }).catch(err => console.log(err));

  } catch (error) {
    console.log('Something broke : ', error);
    res.status(400).json('Something broke !');
  }
})

app.listen(port, () => {
  console.log(`Payment api at http://localhost:${port}`)
})
