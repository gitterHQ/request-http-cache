/*jshint globalstrict:true, trailing:false, unused:true, node:true */
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
  getKey: function(url, token) {
    return JSON.stringify([url, token || null]);
  },

  getEtagExpiry: function (key, callback) {
    var item = this.cache.get(key);
    if (!item) return callback();

    return callback(null, {
      expiry: item.expiry,
      etag: item.etag
    });

  },

  getContent: function (key, callback) {
    var item = this.cache.get(key);

    return callback(null, item);
  },

  store: function(key, content, callback) {
    this.cache.set(key, content);
    return callback();
  },

  updateExpiry: function(key, expiry, callback) {
    var item = this.cache.get(key);
    if (item) {
      item.expiry = expiry;
    }
    return callback();
  }

};

module.exports = InMemoryBackend;
