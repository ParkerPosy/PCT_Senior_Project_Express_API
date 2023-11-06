// Use local environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
// const https = require('https');

// SSL
// const key  = fs.readFileSync('sslcert/selfsigned.key', 'utf8');
// const cert = fs.readFileSync('sslcert/selfsigned.crt', 'utf8');

const mock_data  = require('./mock-data.json');

// Create our MongoDB Connection
const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@locations.szvife1.mongodb.net/?retryWrites=true&w=majority`;

// Create our database schema
const SearchResult = mongoose.model('searchResult', new mongoose.Schema({
  startDate: Date,
  endDate: Date,
  location: String,
}, {
  timestamps: true,
}));

// Options are to supress deprecation warnings
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on('connected', () => {
  console.log('Successfully Connected to MongoDB');
});

mongoose.connection.on('error', (error) => {
  console.error('Error:', error);
});

// Create our app
const app = express();
const httpServer = http.createServer(app);
// const httpsServer = https.createServer({ key, cert }, app);

// Allow the app to work while both are running on localhost
app.use(cors({
  origin: 'http://localhost:3000',
}));

// Add a request handler
app.use(bodyParser.json());

app.get('/fun-search', (request, response) => {
  console.log(request.query.startDate);
  console.log(request.query.endDate);
  console.log(request.query.location);

  const searchResult = new SearchResult({
    startDate: request.query.startDate,
    endDate: request.query.endDate,
    location: request.query.location,
  });

  searchResult.save()
    .then(data => {
      console.log('Success Saving to MongoDB');
      // console.log(data);
      // response.send('Success Sending');
    }).catch(error => {
      console.error('Error sending: ', error);
    });

  setTimeout(() => {
    response.send(mock_data);
  }, 3000);
});

// Create a GET request route path
// Returns all database entries
// app.get('/all-expenses', (_, response) => {
//   SearchResult.find({})
//     .then(data => {
//       response.send(data);
//     }).catch(error => {
//       console.error(error);
//     });
// });

// Create a POST request route path
// Creates an entry
// app.post('/send-expense', (request, response) => {
//   const SearchResult = new SearchResult({
//     startDate: request.body.startDate,
//     endDate: request.body.endDate,
//     location: request.body.location,
//   });
//   SearchResult.save()
//     .then(data => {
//       console.log('Success Sending');
//       // console.log(data);
//       response.send('Success Sending');
//     }).catch(error => {
//       console.error('Error sending: ', error);
//     });
// });

// Create a DELETE request route path
// Deletes an entry by ID
// app.delete('/delete-expense', (request, response) => {
//   SearchResult.findByIdAndRemove(request.body.id)
//     .then(data => {
//       console.log('Deleted Expense');
//       // console.log(data);
//       response.send('Deleted Expense');
//     }).catch(error => {
//       console.error('Error deleting: ', error);
//     });
// });

// Create a PUT request route path
// Modifies/Updates an entry
// app.put('/update-expense', (request, response) => {
//   SearchResult.findByIdAndUpdate(request.body.id, {
//     cost: request.body.cost,
//     type: request.body.type,
//   }).then(data => {
//     console.log('Updated Expense');
//     // console.log(data);
//     response.send('Updated Expense');
//   }).catch(error => {
//     console.error('Error Updating: ', error);
//   });
// });

// Run the http version of the app on port 3500
httpServer.listen(3500, () => {
  console.log('HTTP Server Running');
});
// Run the https version of the app on port 443
// httpsServer.listen(443, () => {
//   console.log('HTTPS Server Running');
// });