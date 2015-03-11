'use strict';

var LRU = require("lru-cache");

function calculateLength(item) {
  // Pretty rough calculation
  if (item.size) {
    return item.size;
  }
  // Only do it one
  item.size = JSON.stringify(item).length;
  return item.size;
}

function InMemoryBackend(options) {
  if (!options) options = {};

  this.cache = LRU({
    max: options.max || 512 * 1024, // 512kb default
    length: calculateLength,
    maxAge: options.ttl * 1000
  });
}

InMemoryBackend.prototype = {

  /**
   * Returns the Vary headers for a given URL
   */
  getVaryHeaders: function(url, callback) {
    var varyHeaders = this.cache.get("v:" + url);
    callback(null, varyHeaders);
  },

  /**
   * Get the etag and expiry for a given URL
   */
  getEtagExpiry: function (key, callback) {
    var item = this.cache.get("c:" + key);
    if (!item) return callback();

    return callback(null, {
      url: item.url,            // Key is a hash, so URL will detect conflicts
      expiry: item.expiry,
      etag: item.etag
    });

  },

  getContent: function (key, callback) {
    var item = this.cache.get("c:" + key);
    return callback(null, item);
  },

  /* Store the content and save the vary headers for the URL */
  store: function(key, content, callback) {
    /* Save the content */
    this.cache.set("c:" + key, content);

    /* Save the vary headers for the URL */
    var url = content.url;
    var vary = content.headers && content.headers.vary || '';
    this.cache.set("v:" + url, vary);

    return callback();
  },

  updateExpiry: function(url, key, expiry, callback) {
    var item = this.cache.get("c:" + key);
    if (item) {
      item.expiry = expiry;
    }
    
    // Refresh the LRU for the Vary headers
    this.cache.get("v:" + url);

    return callback();
  }

};

module.exports = InMemoryBackend;
