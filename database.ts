/// <reference path="./definitely-typed/express.d.ts"/>
/// <reference path="./definitely-typed/node.d.ts"/>
/// <reference path="./typescript-node-definitions/mongodb.d.ts"/>
/// <reference path="./definitions/lodash.d.ts"/>

/* This file handles anything that touches the database: creating new feeds,
   adding them to database, getting stuff from the database, etc.
 */

/********************************************************************
 * exported functions
 ********************************************************************/

/* Given a url like "http://xkcd.com/rss.xml", adds the the feed to the server
   (if it's not already there) and updates all of its elements and if callback
   is given, calls it. */
declare var updateFeed : (url : string, callback ?: Function) => void;

/* Given a url like "http://xkcd.com/", adds the entries to the server */
declare var addBySiteUrl : (url : string, callback ?: Function) => void;

/* Gets the salt of the current facebookId, or generates one if it doesn't
   exist */
declare var getSalt : (facebookId : string,
                       callback : (err : any, salt ?: string) => void) => void;

/* Start the actual server (boot up the database and set the timeout on
   updating the database */
declare var start : (callback ?: Function) => void;


/********************************************************************
 * imports
 ********************************************************************/

import f = module('foo');
import util = module('utilities');

var FeedParser = require('feedparser');
var jsdom = require('jsdom');
var request = require('request');
var _ : Lodash = require('./static/lodash.js');
import mongo = module('mongodb');
require('source-map-support').install();


/********************************************************************
 * interfaces
 ********************************************************************/

/* Items and feeds stored in the database */
interface DbFeed {
  title : string;
  description : string;
  url : string;
  _id : mongo.ObjectID;
}

interface DbItem {
  title : string;
  description : string;
  url : string;
  date : number;
  feedId : mongo.ObjectID;
  _id : mongo.ObjectID;
}

interface DbSalt {
  facebookId: string;
  salt: string;
}

/* When you get an item via FeedParser (Fp), it's different then when you store
   it in the database. Thus, it's useful to have these distinctions. */
interface FpFeed {
  description : string;
  title : string;
  link : string;
}

interface FpItem {
  title : string;
  description : string;
  link : string;
  date : Date;
}

/* Data structure to hold global info. */
interface Glob {
  isUpdating : bool;
}

interface Constants {
  UPDATE_INTERVAL : number;
}

interface Db {
  items : mongo.Collection;
  feeds : mongo.Collection;
  users : mongo.Collection;
  salts : mongo.Collection;
}

/********************************************************************
 * variable declarations
 ********************************************************************/

var glob : Glob = {isUpdating: false};

var c : Constants = {
  // how often, in MS, I attempt an update
  UPDATE_INTERVAL: 100 * 1000
};

var db : Db = {
  items : undefined,
  feeds : undefined,
  users : undefined,
  salts : undefined
};

/********************************************************************
 * actual code
 ********************************************************************/

/* Given a pre-existing feed, update all of its items */
var updateItems = function(feed : DbFeed, callback ?: Function) {
  console.log("update items: " + util.sify(feed.url));
  if (!callback) callback = util.throwIt;

  request(feed.url)
    .pipe(new FeedParser({}))
    .on('error', callback)
    .on('end', callback)
    .on('article', function(fpItem : FpItem) {
      // If they didn't put a date, shame on them.
      // Give it the current date.
      if (!fpItem.date) {
        fpItem.date = new Date();
      }

      // try to find exact match in the database
      db.items.find(
        {url: fpItem.link, date: fpItem.date.getTime()}).toArray(
          function(err, a) {
            util.throwIt(err);

            var dbItem : DbItem = {
              title: fpItem.title,
              description: fpItem.description,
              url: fpItem.link,
              date: fpItem.date.getTime(),
              feedId: feed._id,
              _id: new mongo.ObjectID()
            }

            if (a.length === 0) {
              // otherwise, make a DbItem and insert it into the db
              console.log("inserting db item: " + util.sify(dbItem.url));
              db.items.insert(dbItem, {safe : true}, util.throwIt);
            } else if (a.length === 1) {
              console.log("db item already there: " + util.sify(fpItem.link));
            } else {
              console.log("removing db item: " + util.sify(dbItem.url));
              db.items.remove(dbItem, function(err) {
                util.throwIt(err);
                console.log("inserting db item: " + util.sify(dbItem.url));
                db.items.insert(dbItem, {safe: true}, util.throwIt);
              });
            }
          });
    });
};

/* Given a url like "http://xkcd.com/rss.xml", adds the the feed to the server
   (if it's not already there) and updates all of its elements and if callback
   is given, calls it. */
export var updateFeed = function(url : string, callback ?: Function) {
  if (!callback)
    callback = util.throwIt;

  if (url.indexOf("http://") === -1) {
    url = "http://" + url;
  }
  // replace "//" with "/"
  url = url.replace(/\/\//g, "/");
  url = url.replace("http:/", "http://");
  console.log("update feed: " +  util.sify(url));

  db.feeds.find({url: url}).toArray(function(err, feeds : DbFeed[]) {
    if (err) return callback(err);

    // should never have duplicates
    util.assert(feeds.length <= 1, "duplicate feeds: " + util.sify(url));

    if (feeds.length === 0) {
      console.log("creating db feed: " + util.sify(url));
      request(url)
        .pipe(new FeedParser({}))
        .on('error', callback)
        .on('meta', function(feed : FpFeed) {

          var dbFeed : DbFeed = {
            title: feed.title,
            description: feed.description,
            url: url,
            _id: new mongo.ObjectID()
          };

          db.feeds.insert(dbFeed, function(err) {
            if (err) throw err;
            updateItems(dbFeed, callback);
          });
        });
    } else {
      updateItems(feeds[0], callback);
    }
  });
};


/* Given a url like "http://xkcd.com/", adds the entries to the
   server */
export var addBySiteUrl = function(url : string, callback ?: Function) : void {

  if (!callback) {
    callback = util.throwIt;
  }

  // if it ends with a "/", strip it off
  if (url.charAt(url.length-1) == "/") {
    url = url.substring(0, url.length-1);
  }

  // download the webpage
  request({url: url}, function(err, response, body) {
    if (err) return callback(err);
    // parse the html into a dom
    jsdom.env({
      html: body,
      scripts: ['static/jquery-1.9.1.js']
    }, function (err, window) {
      if (err) return callback(err);
      // get out the url of the rss
      var $ = window.jQuery;
      // TODO: insert all of the values
      var rssUrl : string = $("link[type='application/rss+xml']")[0].href;
      // if it doesn't start with "http://", prepend the url to the rssUrl
      if (rssUrl.indexOf("http://") != 0) {
        rssUrl = url + "/" + rssUrl;
      }
      updateFeed(rssUrl, callback);
    });
  });
};


var updateEverything = function() : void {

  /* Primitive locking to avoid race conditions (what if two threads detect
     that they should download the webpage, download it, and put both into
     the database?) If I'm already updating, just skip for now and wait
     around until next time */
  if (glob.isUpdating) {
    console.log("\n*********** " + "update already running; skipping update"
                + " ***********\n\n");
    return;
  }
  console.log("\n*********** " + "starting update" + " ***********\n\n");
  glob.isUpdating = true;

  // get all the feeds, and then look them up
  db.feeds.find({}).toArray(function(err, dbFeeds : DbFeed[]) {
    if (err) {
      glob.isUpdating = false;
      throw err;
    }

    var releaseIfFinished = _.after(dbFeeds.length, function() {
      console.log("\n*********** done updating! ***********\n\n");
      glob.isUpdating = false;
    });

    // count how many feeds have been updated. When this reaches
    // dbFeeds.length, we know we're done, so release the lock
    // on glob.isUpdating
    for (var i = 0; i < dbFeeds.length; i++) {
      updateItems(dbFeeds[i], function(err) {
        releaseIfFinished();
        util.throwIt(err);
      });
    }
  });
};


/* Give me a random salt. */
var generateSalt : () => string = (function() {
  // closure this inside there so we don't have to reinitialize every time
  var s = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return function() : string {
    var range = _.range(s.length);
    var indices = _.map(range, function() { return _.random(s.length) });
    var chars = _.at(s, indices);
    return _.reduce(chars, function(x, y) { return x+y });
  };
})();

/* What is the salt for this user? */
export var getSalt = function(facebookId : string,
                              callback : (err : any, salt ?: string) => any)
                            : void {
   db.salts.find({facebookId: facebookId}).toArray(function(err, a : DbSalt[]) {
     if (err) return callback(err);
     util.assert(a.length <= 1,
                 "more than one salt per facebookId: " + util.sify(a));
     // if you already have the salt, just return it.
     if (a.length == 1) return callback(null, a[0].salt);

     // if you don't already have it, create it, insert it,
     // and call the callback on it
     var newEntry : DbSalt = {
       facebookId: facebookId,
       salt: generateSalt()
     };
     db.salts.insert(newEntry, function(err) {
       callback(err, newEntry.salt);
     });
   });
};


/* The function to start it all */
export var start = function(callback ?: Function) : void {
  if (!callback) callback = util.throwIt;
  var client = new mongo.Db('testDb',
                            new mongo.Server('localhost', 27017),{w:1});

  client.open(function(err) {
    if (err) return callback(err);

    // when you're done, call this function
    var after = _.after(_.size(db), function() {
      setInterval(updateEverything, c.UPDATE_INTERVAL);
      callback(null);
    });

    // add all the collections to the server
    var keys : string[] = _.keys(db);
    for (var i : number = 0; i < keys.length; i++) {
      (function() {
        var key = keys[i];
        client.collection(key, function(err, collection) {
          util.throwIt(err);
          db[key] = collection;
          after();
        });
      })();
    }
  });
};
