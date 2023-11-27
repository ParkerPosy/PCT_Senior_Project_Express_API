// Use local environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const axios = require('axios');

const fast_food  = require('./fast-food.json');

// Create our MongoDB Connection
const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@locations.szvife1.mongodb.net/?retryWrites=true&w=majority`;

// Create our database schemas
const SearchResult = mongoose.model('searchResult', new mongoose.Schema({
  startDate: Date,
  endDate: Date,
  location: String,
}, {
  timestamps: true,
}));

const Locations = mongoose.model('locations', new mongoose.Schema({
  '_id': Number,
  locations: Array,
}, {
  timestamps: true,
  _id: false,
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

// Allow the app to communicate with specific origins
app.use(cors({
  origin: ['http://localhost:3000', 'https://www.funnearby.app'],
}));

// Add a request handler
app.use(bodyParser.json());

app.get('/fun-search', async (request, response) => {
  /////////////////////////////////////////////////////////////////
  // Save query data to database                                 //
  /////////////////////////////////////////////////////////////////

  const searchResult = new SearchResult({
    startDate: request.query.startDate,
    endDate: request.query.endDate,
    location: request.query.location,
  });
  const savedSearch = await searchResult.save();
  console.log(savedSearch.createdAt + ': Success Saving Query Data to MongoDB.');


  /////////////////////////////////////////////////////////////////
  // Delete any stored data that is more than 365 days old       //
  /////////////////////////////////////////////////////////////////

  const tooOldDate = new Date();
  const tooOldDay = tooOldDate.getDate() - 365;
  tooOldDate.setDate(tooOldDay);
  const deletedSearches = await SearchResult.deleteMany({ createdAt: { '$lt': tooOldDate } });
  console.log(`Deleted ${deletedSearches.deletedCount} old search results.`);


  /////////////////////////////////////////////////////////////////
  // Find the locations array and print the length               //
  /////////////////////////////////////////////////////////////////

  const locationsObject = await Locations.findById(1);
  console.log('There are currently ' + locationsObject.locations.length + ' unique locations stored.');


  /////////////////////////////////////////////////////////////////
  // Update the locations array with unique searched locations   //
  /////////////////////////////////////////////////////////////////

  const updatedLocations = await Locations.findByIdAndUpdate(1,
    { $addToSet: { 'locations': request.query.location } },
    { new: true, upsert: true, safe: true },
  );
  console.log(`Added ${updatedLocations.locations.length - locationsObject.locations.length} locations to locations set.`);


  /////////////////////////////////////////////////////////////////
  // use GoogleAPIs nearbysearch to get relevant data            //
  /////////////////////////////////////////////////////////////////
  try {
    let allResults = [];
    for (const type of ['bar', 'cafe', 'casino', 'museum', 'night_club', 'park', 'restaurant', 'tourist_attraction']) {
      const firstPageQuery = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json?' + new URLSearchParams({
        location: `${request.query.lat},${request.query.lng}`,
        // 16100 meters = ~10 miles
        radius: 16100,
        type: type,
        key: process.env.GOOGLE_API_KEY,
      }));

      allResults = [...allResults, ...firstPageQuery.data.results];

      let pagetoken = firstPageQuery.data.next_page_token ?? false;
      while (pagetoken) {
        const pageQuery = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json?' + new URLSearchParams({
          pagetoken,
          key: process.env.GOOGLE_API_KEY,
        }));
        allResults = [...allResults, ...pageQuery?.data?.results ?? []];
        pagetoken = pageQuery?.data?.next_page_token ?? false;
      }
    }

    allResults = allResults.filter(result => {
      return result.rating > 3 && result.user_ratings_total > 200 && !fast_food.filter((ff) => result.name.includes(ff)).length;
    });

    const promiseArray = allResults.map(result => {
      return axios.get('https://maps.googleapis.com/maps/api/place/details/json?' + new URLSearchParams({
        place_id: result.place_id,
        fields: 'name,place_id,vicinity,website,current_opening_hours,editorial_summary',
        key: process.env.GOOGLE_API_KEY,
      }));
    });
    let allResultsWithDetails = await Promise.all(promiseArray);
    allResultsWithDetails = allResultsWithDetails.map(result => result.data.result);

    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayIndexMap = Object.entries(dayIndex).reduce((acc, dayIndexArray) => ({ ...acc, [dayIndexArray[1]]: dayIndexArray[0] }), {});
    const startIndex = new Date(request.query.startDate).getDay();
    const endIndex = new Date(request.query.endDate).getDay() + 1;
    let days;
    if (startIndex > endIndex) {
      days = [...dayIndex.slice(startIndex, 7), ...dayIndex.slice(0, endIndex)];
    } else {
      days = dayIndex.slice(startIndex, endIndex);
    }
    days = days.map(day => dayIndexMap[day]);

    const getDaysArray = (start, end) => {
      for(var arr = [], dt = new Date(start); dt <= new Date(end); dt.setDate(dt.getDate() + 1)){
        arr.push(new Date(dt));
      }
      return arr;
    };

    const startDate = new Date(request.query.startDate);
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date(request.query.endDate);
    endDate.setDate(endDate.getDate() + 1);
    let responseData = getDaysArray(startDate, endDate);
    responseData = responseData.map((day) => ({
      date: day.toISOString().split('T')[0],
      events: [],
    }));
    for (const [i, dayI] of days.entries()) {
      const openPlaces = allResultsWithDetails.filter(result => {
        if (!result.current_opening_hours?.weekday_text?.[dayI]) {
          return false;
        }
        return result.current_opening_hours?.weekday_text[dayI].split(': ')[1] !== 'Closed';
      });
      responseData[i].events = openPlaces.map(place => {
        const firstTime = place.current_opening_hours?.weekday_text[dayI].split(': ')[1].split(', ')[0];
        const secondTime = place.current_opening_hours?.weekday_text[dayI].split(': ')[1].split(', ')[1];
        // startTime: place.current_opening_hours?.weekday_text[dayI].split(': ')[1].split('\u2009\u2013\u2009')[0],
        return {
          firstTime,
          secondTime,
          title: place.name,
          description: place.editorial_summary?.overview ?? 'No description provided.',
          address: place.vicinity,
          googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`,
          website: place.website,
        };
      });
    }

    response.send(responseData);
  } catch (e) {
    response.status(400).send(e);
    console.error(e);
  }
});

// Run the http version of the app on port 3500
httpServer.listen(3500, () => {
  console.log('HTTP Server Running');
});