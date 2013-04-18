/// <reference path="../definitions/lodash.d.ts"/>
/// <reference path="../definitely-typed/jquery.d.ts"/>

declare var _ : Lodash;
import I = module('../interfaces');
// TODO: make Hammer at least a little typesafe
declare var Hammer : any;

/* The global state */
interface Global {
  feeds : {[_id: string]: I.ClFeed;};
  user : I.ClUser;
  // the #foo I current think it is. this should be one of "#add", "#view",
  // "#edit", "#read"
  oldHash : string;
  // Did I just change the hash? Or did the user?
  hashChangeWasMine : bool;
  // Keep track of the current feed in case they hit the back button.  You
  // should never read from this; its purpose is entirely for when they press
  // the back button. It should only be accessed by enterRead and exitRead.
  currentFeed : I.ClFeed;
}

var G : Global = {
  feeds: undefined,
  user: undefined,
  oldHash: "#_=_",
  hashChangeWasMine: true,
  currentFeed: undefined,
};


$(document).ready(function() {


  /********************************************************************
   * common functions
   ********************************************************************/

  var enterView : (callback ?: () => void) => void;
  var exitView : (callback ?: () => void) => void;

  var enterEdit : (callback ?: () => void) => void;
  var exitEdit : (callback ?: () => void) => void;

  var enterAdd : (callback ?: () => void) => void;
  var exitAdd : (callback ?: () => void) => void;

  var enterRead : (feed : I.ClFeed, callback ?: () => void) => void;
  var exitRead : (callback ?: () => void) => void;

  var changeHash : (hash : string) => void;

  /********************************************************************
   * implementation
   ********************************************************************/


  ///////////////////////////////////////////////////
  // misc utilities
  ///////////////////////////////////////////////////

  var changeHash = function(hash : string) : void {
    G.hashChangeWasMine = true;
    window.location.hash = hash;
  };

  ///////////////////////////////////////////////////
  // view feed
  ///////////////////////////////////////////////////

  // When you navigate to the subscriptionView page, you
  var enterView = function(callback ?: () => void) {
    callback = callback || () => undefined;
    changeHash("#view");
    $("#view").css('display', 'block');

    // after both these ajax requests, call callback
    var lastly = _.after(2, callback);

    // update the user
    $.ajax({
      type: 'get',
      url: "/who-am-i-where-am-i",
      data: {
      },
      success: function(data : string) {
        G.user = JSON.parse(data);
        lastly();
      }
    });

    // update all of their subscription and put them in the DOM
    // ENDGAME: remove this ajax query if you've already got the data
    $.ajax({
      type: 'get',
      url: "/gimmie-my-feeds",
      data: {
      },
      success: function(data : string) {
        // cool, now we have the feeds array. Add it to the DOM.
        G.feeds = {};
        var feedsArray : I.ClFeed[] = JSON.parse(data);
        for (var i = 0; i < feedsArray.length; i++) {
          var feed = feedsArray[i];
          G.feeds[feed._id] = feed;
        }

        for (var _id in G.feeds) {
          var feed : I.ClFeed = G.feeds[_id];
          var div = ($('<div>')
                     .addClass('subscription')
                     .attr('id', feed._id)
                     .text(feed.title))[0];
          // if they click on this div, they should try to go read it
          (function(){
            var _feed = feed;
            Hammer(div).on('tap', function(event) {
              exitView(function() {
                enterRead(_feed);
              });
            });
          })();
          $("#subscriptionList").append(div);
        }

        lastly();
      }
    });
  };

  var exitView = function(callback ?: Function) {
    callback = callback || function() { };
    $("#view").css('display', 'none');
    $("#subscriptionList").empty();
    callback();
  };

  // and make it so when they click on the buttons at the
  // bottom, they can actually
  Hammer($('#addSubscription')[0]).on('tap', function(event) {
    // turn the lights off on your way out
    exitView(enterAdd);
  });

  Hammer($('#editSubscription')[0]).on('tap', function(event) {
    exitView(function() {
      enterEdit();
    });
  });


  ///////////////////////////////////////////////////
  // add feed
  ///////////////////////////////////////////////////

  var alreadyHammerfiedAddButton = false;

  // submit the search, ultimately going back to the home page.
  // async.
  var addSubmit = function(callback ?: Function) {
    callback = callback || function() { };
    var siteUrl : string = $("#searchBox").val();
    $.ajax({
      type: 'post',
      url: "/add-feeds",
      data: {
        url: siteUrl
      },
      success: function(data) {
        // data is a JSON-encoded version of the feeds you added
        var feeds : I.ClFeed[] = JSON.parse(data);
        // a quick hack to make it obvious that I couldn't find anything.
        if (feeds.length === 0) {
          alert("No feeds found.");
        }
        exitAdd(enterView);
      }
    });
  };

  var enterAdd = function(callback ?: () => void) {
    callback = callback || function() { };
    changeHash("#add");
    $("#add").css('display', 'block');

    // for some reason, it only works to hammerfy button when they're visible
    // or something. Has to be put in this function
    if (!alreadyHammerfiedAddButton) {
      alreadyHammerfiedAddButton = true;
      Hammer($("#addButton")[0]).on('tap', function(event) {
        addSubmit();
      });
    }

    callback();
  };

  var exitAdd = function(callback ?: () => void) {
    callback = callback || function() { };
    $("#add").css('display', 'none');
    callback();
  };

  $("#searchBox").keydown(function(event) {
    // if they hit return, submit it
    if (event.keyCode === 13) {
      addSubmit();
      // make it so that the key doesn't actually have its effect
      return false;
    }
  });



  ///////////////////////////////////////////////////
  // edit/remove feeds
  ///////////////////////////////////////////////////

  var enterEdit = function(callback ?: () => void) {
    callback = callback || function() { };
    changeHash("#edit");
    $("#edit").css('display', 'block');


    // generate keepList's elements
    for (var _id in G.feeds) {
      (function(){
        var feed = G.feeds[_id];
        // each one will have a div with a checkbox and some text inside
        var div = $('<div>').addClass('keeper').attr('id', feed._id);
        var checkbox = $('<input>')
          .attr('type', 'checkbox')
          .click(function() {
            // it's bad if it's not checked
            div.toggleClass('bad', !checkbox.is(':checked'));
          })
          .prop('checked', true);
        div.append(checkbox).append(feed.title);
        $("#keepList").append(div);
      })();
    }
  };

  var exitEdit = function(callback ?: () => void) {
    callback = callback || function() { };
    $("#edit").css('display', 'none');
    $("#keepList").empty();

    callback();
  };

  Hammer($('#saveSubscription')[0]).on('tap', function(event) {
    // you need to get these out ahead of time, before exitEdit
    // removes them
    var bads = $(".keeper.bad");
    var badIds : string[] = _.map(bads, (e) => e.id);
    exitEdit(function() : void {
      $.ajax({
        type: 'delete',
        url: "/delete-these-feeds",
        data: {
          feedIds: badIds
        },
        success: function(data) {
          enterView();
        }
      });
    });
  });

  ///////////////////////////////////////////////////
  // read feed
  ///////////////////////////////////////////////////

  var enterRead = function(feed : I.ClFeed, callback ?: () => void) {
    callback = callback || function() { };
    $("#read").css('display', 'block');
    changeHash("#read");
    G.currentFeed = feed;

    // TODO: make it possible for them to leave this page! No button out.
    $.ajax({
      type: 'get',
      url: "/gimmie-some-items",
      data: {
        feedId: feed._id
      },
      success: function(data : string) {
        // now that you have the items, add them all to the DOM.
        var items : I.ClItem[] = JSON.parse(data);
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var div = $("<div>")
            .append($("<h3>")
                    .append($("<a>")
                            .attr('href', item.url)
                            .attr('target', '_blank')
                            .text(item.title)))
            .append($("<div>")
                    .html(item.description)
                    .addClass('itemDescription'))
            .addClass('itemContainer');
          // we prepend here because we want earliest at the very top
          $("#read").prepend(div);
        }
        $("#read").css('display', 'block');
        var back = $("<div>").addClass("button").text("back");
        Hammer(back[0]).on('tap', function(event) {
          exitRead(enterView);
        });
        $("#read").prepend(back)
        callback();
      }
    });
  };


  var exitRead = function(callback ?: () => void) : void {
    callback = callback || function() { };
    G.currentFeed = undefined;
    $("#read").css('display', 'none');
    $("#read").empty();
    callback();
  };


  ///////////////////////////////////////////////////
  // misc listeners
  ///////////////////////////////////////////////////

  window.onhashchange = function() {

    console.log("Hash changed from " + G.oldHash +
                " to " + window.location.hash);
    console.log(G.hashChangeWasMine);

    // if it wasn't mine (i.e. the user did it by hitting back), find out
    // where I was coming from and where I'm going to make make the swap
    if (!G.hashChangeWasMine) {
      var exit : (callback ?: () => void) => void = function() { };
      switch (G.oldHash) {
      case "#view":
        exit = exitView;
        break;
      case "#edit":
        exit = exitEdit;
        break;
      case "#add":
        exit = exitAdd;
        break;
      case "#read":
        exit = exitRead;
        break;
      }

      var enter : (callback ?: () => void) => void = function() { };
      switch (window.location.hash) {
      case "#view":
        enter = enterView;
        break;
      case "#edit":
        enter = enterEdit;
        break;
      case "#add":
        enter = enterAdd;
        break;
      case "#read":
        enter = (function(){
          var feed = G.currentFeed;
          return function(callback ?: () => void) : void {
            enterRead(feed);
          };
        })();
        break;
      }

      // out with the old, then in with the new
      exit(enter);

    }

    G.oldHash = window.location.hash;
    // regardless of if this was a change I made or not, next time,
    // make it obvious that it wasn't intentional.
    G.hashChangeWasMine = false;
  };


  ///////////////////////////////////////////////////
  // main
  ///////////////////////////////////////////////////

  enterView();

});
