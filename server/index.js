const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 1337;
const db = require('../database/index.js');
const dummyData = require('../database/dummydata.js');
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Uncomment funciton below for dropping all tables from database
// db.dropAllTables();

app.use(express.static(path.resolve(__dirname, '../client/dist')));

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/restaurants', (req, res) => {
  if (req.query.restaurantId) {
    db.findInfoForOneRestaurant(req.query.restaurantId)
      .then(results => res.send(results))
      .catch(error => {
        console.log('error getting info for one restaurants', error);
        res.send('failed for one restaurant');
      });  
  } else {
    db.findInfoForAllRestaurants()
      .then(restaurants => res.send(restaurants))
      .catch(error => {
        console.log('error getting info for all restaurants', error);
        res.send('failed for info on all restaurants');
      });  
  }
});

app.post('/dummydata', (req, res) => {
  dummyData.addRestaurants()
    .then(() => dummyData.addCustomers())
    .then(() => dummyData.addToQueue())
    .then(() => {
      // console.log('Added dummy data to database');
      res.sendStatus(200);
    })
    .catch(error => {
      console.log('error posting dummydata', error);
      res.send('could not add dummydata');
    });
});

app.post('/queues', (req, res) => {

  if (!req.body.name || !req.body.mobile || !req.body.restaurantId
      || !req.body.size) {
    res.status(400).send('Bad Request');
  } else {
    const result = {
      name: req.body.name,
      mobile: req.body.mobile
    };

    if (req.body.email) {
      result.email = req.body.email;
    }
  
    db.addToQueue(req.body)
      .then(response => {
        if (response === 'Closed') {
          res.send('Restaurant has closed the queue');
        } else {
          result.queueId = response.dataValues.id;
          result.size = response.dataValues.size;
          result.position = response.dataValues.position;
          res.send(result);
        }
      })
      .catch(error => res.status(418).send('Request Failed'));
  }
  
});

app.patch('/restaurants', (req, res) => {
  if (req.query.status && (req.query.status !== 'Open' || req.query.status !== 'Closed')) {
    res.status(400).send('Bad Request');
  } else {
    db.updateRestaurantStatus(req.query)
      .then(result => res.send(`Status for restaurant with id ${req.query.restaurantId} is now ${req.query.status}`))
      .catch(err => res.status(418).send('Update for restaurant status failed'));
  }
});

app.get('/queues', (req, res) => {
  if (req.query.customerId) {
    var results = {
      customer: {}
    };
    db.getCustomerInfo(req.query.customerId)
      .then(partialResults => {
        results.customer = partialResults.customer;
        results.position = partialResults.position;
        results.size = partialResults.size;
        return db.getQueueInfo(partialResults.restaurantId, partialResults.customerId, partialResults.position);
      })
      .then(partialResults => {
        results['groups_in_front_count'] = partialResults.count;
        results['groups_in_front_details'] = partialResults.rows;
        res.send(results);
      })
      .catch(err => {
        res.status(418).send('Unknown Error - Check customerId');
      });
  } else {
    res.status(400).send('Bad request');
  }
});

app.listen(port, () => {
  console.log(`(>^.^)> Server now listening on ${port}!`);
});