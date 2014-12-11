document.addEventListener('DOMContentLoaded', function () {
  document.title =
      chrome.i18n.getMessage("rss_subscription_default_title");
      i18nReplace('rss_subscription_feed_preview');
      i18nReplaceImpl('feedUrl', 'rss_subscription_feed_link', '');
      
    $('#save').click(function() {validateAndSaveFeeds(true);});
    
    chrome.bookmarks.getTree(function(topNode) {
      var folders = getAllBookmarkFolders(topNode[0].children);
      //add folders to the options drop down
      populateParentFolders(folders);
      //add a feed id to the possiable new entry
      $('.feed .id:first').val(getUniqueFeedId());
    });
  
  main();
});

// Copyright (c) 2010 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Grab the querystring, removing question mark at the front and splitting on
// the ampersand.
var queryString = location.search.substring(1).split("&");

// The feed URL is the first component and always present.
var feedUrl = decodeURIComponent(queryString[0]);

// We allow synchronous requests for testing. This component is only present
// if true.
var synchronousRequest = queryString[1] == "synchronous";

// The XMLHttpRequest object that tries to load and parse the feed, and (if
// testing) also the style sheet and the frame js.
var req;

// Depending on whether this is run from a test or from the extension, this
// will either be a link to the css file within the extension or contain the
// contents of the style sheet, fetched through XmlHttpRequest.
var styleSheet = "";

// Depending on whether this is run from a test or from the extension, this
// will either be a link to the js file within the extension or contain the
// contents of the style sheet, fetched through XmlHttpRequest.
var frameScript = "";

// What to show when we cannot parse the feed name.
var unknownName = chrome.i18n.getMessage("rss_subscription_unknown_feed_name");

// A list of feed readers, populated by localStorage if available, otherwise
// hard coded.
var feedReaderList;

// Navigates to the reader of the user's choice (for subscribing to the feed).
function navigate() 
{
	
}

/**
* The main function. fetches the feed data.
*/
function main() {

  // Now fetch the data.
  req = new XMLHttpRequest();
  if (synchronousRequest) {
    // Tests that load the html page directly through a file:// url don't have
    // access to the js and css from the frame so we must load them first and
    // inject them into the src for the iframe.
    req.open("GET", "style.css", false);
    req.send(null);

    styleSheet = "<style>" + req.responseText + "</style>";

    req.open("GET", "scripts/iframe.js", false);
    req.send(null);

    frameScript = "<script>" + req.responseText +
                    "<" + "/script>";
  } else {
    // Normal loading just requires links to the css and the js file.
    styleSheet = "<link rel='stylesheet' type='text/css' href='" +
                    chrome.extension.getURL("styles/style.css") + "'>";
    frameScript = "<script src='" + chrome.extension.getURL("scripts/iframe.js") +
                    "'></" + "script>";
  }

  feedUrl = decodeURIComponent(feedUrl);
  setFeedUrl(feedUrl);
  req.onload = handleResponse;
  req.onerror = handleError;
  // Not everyone sets the mime type correctly, which causes handleResponse
  // to fail to XML parse the response text from the server. By forcing
  // it to text/xml we avoid this.
  req.overrideMimeType('text/xml');
  req.open("GET", feedUrl, !synchronousRequest);
  req.send(null);

  document.getElementById('feedUrl').href = 'view-source:' + feedUrl;
}

// Sets the title for the feed.
function setFeedTitle(title) {
  $('.name')[0].value = title;
}

//sets the feeds site url or if not contained in the feed then the http prefix
function setFeedSiteUrl(doc)
{
    var siteUrl;
    //try to find the feeds site url
    if($(doc).find('link[rel=alternate]:first').length > 0)
        siteUrl = $(doc).find('link[rel=alternate]:first');
    else if($(doc).find('link:first').length > 0)
        siteUrl = $(doc).find('link:first');
    //if a node was found then get the url
    if(siteUrl !== undefined)
    {
        if(siteUrl.attr('href') !== undefined)
            siteUrl = siteUrl.attr('href');
        else
            siteUrl = siteUrl.text();
    }else
        siteUrl = 'http://';

    //set the site url input field  
    $('.siteUrl')[0].value = siteUrl;
}

//sets the feeds url
function setFeedUrl(feedUrl)
{
	$('.feedUrl')[0].value = feedUrl;
}

// Handles errors during the XMLHttpRequest.
function handleError() {
  handleFeedParsingFailed(
      chrome.i18n.getMessage("rss_subscription_error_fetching"));
}

// Handles feed parsing errors.
function handleFeedParsingFailed(error) {
  setFeedTitle(unknownName);

  // The tests always expect an IFRAME, so add one showing the error.
  var html = "<body><span id=\"error\" class=\"item_desc\">" + error +
               "</span></body>";

  var error_frame = createFrame('error', html);
  var itemsTag = document.getElementById('items');
  itemsTag.appendChild(error_frame);
}

function createFrame(frame_id, html) {
  frame = document.createElement('iframe');
  frame.id = frame_id;
  frame.src = "data:text/html;charset=utf-8,<html>" + styleSheet + html +
                "</html>";
  frame.scrolling = "auto";
  frame.frameBorder = "0";
  frame.marginWidth = "0";
  return frame;
}

function embedAsIframe(rssText) {
  var itemsTag = document.getElementById('items');

  // TODO(aa): Add base URL tag
  iframe = createFrame('rss', styleSheet + frameScript);
  itemsTag.appendChild(iframe);

  iframe.onload = function() {
    iframe.contentWindow.postMessage(rssText, "*");
  }
}

// Handles parsing the feed data we got back from XMLHttpRequest.
function handleResponse() {
  // Uncomment these three lines to see what the feed data looks like.
  // var itemsTag = document.getElementById('items');
  // itemsTag.textContent = req.responseText;
  // return;

  var doc = req.responseXML;
  if (!doc) {
    // If the XMLHttpRequest object fails to parse the feed we make an attempt
    // ourselves, because sometimes feeds have html/script code appended below a
    // valid feed, which makes the feed invalid as a whole even though it is
    // still parsable.
    var domParser = new DOMParser();
    doc = domParser.parseFromString(req.responseText, "text/xml");
    if (!doc) {
      handleFeedParsingFailed(
          chrome.i18n.getMessage("rss_subscription_not_valid_feed"));
      return;
    }
  }

  // We must find at least one 'entry' or 'item' element before proceeding.
  var entries = doc.getElementsByTagName('entry');
  if (entries.length == 0)
    entries = doc.getElementsByTagName('item');
  if (entries.length == 0) {
    handleFeedParsingFailed(
        chrome.i18n.getMessage("rss_subscription_no_entries"))
    return;
  }

  // Figure out what the title of the whole feed is.
  var title = doc.getElementsByTagName('title')[0];
  if (title)
    setFeedTitle(title.textContent);
  else
    setFeedTitle(unknownName);
	
   setFeedSiteUrl(doc);

  // Add an IFRAME with the html contents.
  embedAsIframe(req.responseText);
}
