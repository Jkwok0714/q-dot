const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 1337;
const db = require('../database/index.js');
const dummyData = require('../database/dummydata.js');
const bodyParser = require('body-parser');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const passport = require('./login.js');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

//checks if session already exists, if it does, adds req.session to req object
app.use(session({
  store: new RedisStore({
    host: process.env.REDISURL || '104.237.154.8',
    port: process.env.REDISPORT || 6379
  }),
  secret: process.env.SESSIONSECRET || 'nyancat',
  cookie: {
    maxAge: 18000000
  },
  name: 'qsessionid',
  resave: false
}));

//these middlewares initialise passport and adds req.user to req object if user has aleady been authenticated
app.use(passport.initialize());
app.use(passport.session());

// app.use((req, res, next) => {
//   res.set('Access-Control-Allow-Origin', '*');
//   res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
//   res.set('Access-Control-Allow-Headers', 'Origin, Content-Type, Authorization, X-Auth-Token');
//   next();
// });

//this is to check if manager is logged in, before using static middleware. MUST always be above express.static!
app.get('/manager', (req, res, next) => {

  if (req.user) {
    console.log('logged in');
    next();
  } else {
    res.redirect('/managerlogin');
  }
});

app.use(express.static(path.resolve(__dirname, '../client/dist')));

//this shows how you can get queue information from the cookie of a customer who has already queue up
app.use((req, res, next) => {
  if (req.session.queueInfo) {
    console.log(req.session.queueInfo);
  }
  next();
});

app.get('/', (req, res) => {
  res.redirect('/customer');
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
  db.Queue.drop()
    .then(() => db.Customer.drop())
    .then(() => db.Restaurant.drop())
    .then(() => db.Manager.drop())
    .then(() => db.Restaurant.sync({force: true}))
    .then(() => db.Customer.sync({force: true}))
    .then(() => db.Queue.sync({force: true}))
    .then(() => db.Manager.sync({force: true}))
    .then(() => dummyData.addRestaurants())
    .then(() => dummyData.addToQueue())
    .then(() => dummyData.addManager())
    .then(() => {
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
    db.addToQueue(req.body)
      .then(response => {
        console.log('here with response after addng to queue', response);
        const result = {
          name: db.nameFormatter(req.body.name),
          mobile: req.body.mobile
        };
        if (req.body.email) {
          result.email = req.body.email;
        }
        result.queueId = response.queueId;
        result.size = response.size;
        result.position = response.position;
        result.queueInFrontCount = response.queueCount;
        result.wait = response.wait;
        result.queueInFrontList = response.queueList;
        req.session.queueInfo = result;
        res.send(result);
      })
      .catch(err => {
        if (err.message.includes('closed')) {
          res.send(err.message);
        } else if (err.message.includes('added')) {
          res.send(err.message);
        } else {
          console.log('error during post for queue', err);
          res.status(418).send('Request Failed');
        }
      });
  }
});

app.patch('/restaurants', (req, res) => {
  if (req.query.status && (req.query.status === 'Open' || req.query.status === 'Closed')) {
    db.updateRestaurantStatus(req.query)
      .then(result => res.send(`Status for restaurant with id ${req.query.restaurantId} is now ${req.query.status}`))
      .catch(err => res.status(418).send('Update for restaurant status failed'));
  } else {
    res.status(400).send('Bad Request');
  }
});

app.get('/queues', (req, res) => {
  if (req.query.queueId) {
    var results = {};
    db.getCustomerInfo(req.query.queueId)
      .then(partialResults => {
        results.name = partialResults.customer.name;
        results.mobile = partialResults.customer.mobile;
        results.email = partialResults.customer.email;
        results.queueId = partialResults.id;
        results.size = partialResults.size;
        results.position = partialResults.position;
        results.wait = partialResults.wait;
        return db.getQueueInfo(partialResults.restaurantId, partialResults.customerId, partialResults.position);
      })
      .then(partialResults => {
        results.queueInFrontCount = partialResults.count;
        results.queueInFrontList = partialResults.rows;
        res.send(results);
      })
      .catch(err => {
        res.status(418).send('Unknown Error - Check customerId');
      });
  } else {
    res.status(400).send('Bad request');
  }
});


app.put('/queues', (req, res) => {
  if (!req.query.queueId) {
    res.status(400).send('Bad Request');
  } else {
    db.removeFromQueue(req.query.queueId)
      .then(result => res.send(result))
      .catch(err => {
        if (err.message.includes('removed')) {
          res.send(err.message);
        } else {
          console.log('error when removing from queue', err);
          res.status(418).send('Request Failed');
        }
      });
  }
});

app.post('/managerlogin', passport.authenticate('local'), (req, res) => {
  res.send('/manager');
});


app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/managerlogin');
});

var server = require('http').Server(app);
var io = require('socket.io')(server);

server.listen(port, () => {
  console.log(`(>^.^)> Server now listening on ${port}!`);
});

// socket io cant use express listen
// app.listen(port, () => {
//   console.log(`(>^.^)> Server now listening on ${port}!`);
// });

let queueMap = {};

io.on('connection', (socket) => {
  console.log(`${socket.id} connected`);

  socket.on('disconnect', () => {
    console.log(`${socket.id} disconnected`);
  });

  //manager event
  socket.on('manager report', (restaurantId) => {
    console.log(`restaurantId: ${restaurantId} manager reporting with socket id: ${socket.id}`);
  });

  socket.on('noti customer', (queueId) => {
    if (queueMap[queueId]) {
      io.to(queueMap[queueId]).emit('noti', 'your table is ready!');
    }
  });

  //customer event
  socket.on('customer report', (queueId) => {
    console.log(`queueId: ${queueId} customer reporting with socket id: ${socket.id}`);
    queueMap[queueId] = socket.id;
  });
});

