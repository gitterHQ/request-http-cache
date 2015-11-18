'use strict';

var _ = require('lodash');

var DEFAULT_PREFIX = "hc:";
var VARY_PREFIX = "v:";
var CONTENT_PREFIX = "c:";

var EXPIRY_HASH_KEY = "ex";
var ETAG_HASH_KEY = "et";
var CONTENT_HASH_KEY = "c";
var RESPONSE_TIME_KEY = "rt";
var URL_KEY = "u";
var DEFAULT_TTL = 86400;

var JSONBSerializer = require('./jsonb-serializer');
var NullCompressor = require('./null-compressor');

function bufferToString(buffer) {
  if (!buffer) return null;
  if (typeof buffer === 'string') return buffer;

  return buffer.toString('utf8');
}

function RedisBackend(options) {
  if (!options) options = {};

  this.varyPrefix = (options.redisPrefix || DEFAULT_PREFIX) + VARY_PREFIX;
  this.contentPrefix = (options.redisPrefix || DEFAULT_PREFIX) + CONTENT_PREFIX;

  var redisPort = options.redis && options.redis.port || 6379;
  var redisHost = options.redis && options.redis.host || '127.0.0.1';
  var redisOptions = _.extend({ }, options.redis && options.redis.options, { return_buffers: true });
  this.redisClient = options.redisClient || require('redis').createClient(redisPort, redisHost, redisOptions);

  this.ttl = options.ttl || DEFAULT_TTL;

  this.serializer = options.serializer && new options.serializer() || new JSONBSerializer();
  this.compressor = options.compressor && new options.compressor() || new NullCompressor();
}

RedisBackend.prototype = {
  /**
   * Returns the Vary headers for a given URL
   */
  getVaryHeaders: function(url, callback) {
    this.redisClient.get(this.varyPrefix + url, function(err, vary) {
      if (err) return callback(err);
      return callback(null, bufferToString(vary));
    });
  },

  getEtagExpiry: function (key, callback) {
    this.redisClient.hmget(this.contentPrefix + key, EXPIRY_HASH_KEY, ETAG_HASH_KEY, URL_KEY, function(err, result) {
      if (err) return callback(err);
      if (!result || !result[2] || (!result[0] && !result[1])) return callback();

      var expiry, etag;
      if (result[0]) {
        expiry = parseInt(bufferToString(result[0]), 10);
        if (isNaN(expiry)) expiry = null;
      }

      if (result[1]) {
        etag = bufferToString(result[1]);
      }

      return callback(null, {
        url: bufferToString(result[2]), // Add the URL in as a hash collision check
        expiry: expiry,
        etag: etag
      });

    });
  },

  getContent: function (key, callback) {
    var self = this;
    this.redisClient.hmget(this.contentPrefix + key, CONTENT_HASH_KEY, URL_KEY, RESPONSE_TIME_KEY, function(err, result) {
      if (err) return callback(err);
      if (!result || !result[0]) return callback();

      var proto;

      try {
        proto = self.serializer.deserialize(result[0]);
      } catch (err) {
        return callback(err);
      }

      proto.url = bufferToString(result[1]); // Add the URL in as a hash collision check
      var responseTime = parseInt(bufferToString(result[2]), 10);
      proto.backendResponseTime = responseTime || 0;


      if (proto.bodyCompressed) {
        self.compressor.decompress(proto.bodyCompressed, function(err, body) {
          if (err) return callback(err);

          proto.body = bufferToString(body);
          return callback(null, proto);
        });
      } else {
        return callback(null, proto);
      }

    });
  },

  store: function(key, content, callback) {
    var statusCode = content.statusCode;
    var etag = content.etag;
    var expiry = content.expiry;
    var headers = content.headers;
    var body = content.body;
    var url = content.url;
    var backendResponseTime = content.backendResponseTime;
    var self = this;

    if (!body) {
      return this._persist(url, key, statusCode, null, headers, expiry, etag, backendResponseTime, callback);
    }

    /* TODO: handle this better */
    if (!Buffer.isBuffer(body) && typeof body === 'object' && body !== null) {
      body = JSON.stringify(body);
    }

    this.compressor.compress(body, function(err, compressed) {
      if (err) return callback(err);
      self._persist(url, key, statusCode, compressed, headers, expiry, etag, backendResponseTime, callback);
    });

  },

  updateExpiry: function(url, key, expiry, callback) {
    /* TODO: check that the key hasn't just been removed */
    var multi = this.redisClient.multi();
    multi.hmset(this.contentPrefix + key, EXPIRY_HASH_KEY, expiry);
    multi.expire(this.contentPrefix + key, this.ttl);
    multi.expire(this.varyPrefix + url, this.ttl);
    multi.exec(callback);
  },

  _persist: function(url, key, statusCode, bodyCompressed, headers, expiry, etag, backendResponseTime, callback) {
    var vary = headers && headers.vary || '';

    var proto;
    try {
      proto = this.serializer.serialize(statusCode, bodyCompressed, headers);
    } catch(err) {
      return callback(err);
    }

    var multi = this.redisClient.multi();
    // Update the content
    multi.hmset(this.contentPrefix + key, EXPIRY_HASH_KEY, expiry, ETAG_HASH_KEY, etag, CONTENT_HASH_KEY, proto, URL_KEY, url, RESPONSE_TIME_KEY, backendResponseTime);
    multi.expire(this.contentPrefix + key, this.ttl);

    // Update the vary headers
    multi.set(this.varyPrefix + url, vary);
    multi.expire(this.varyPrefix + url, this.ttl);
    multi.exec(callback);
  }

};


module.exports = RedisBackend;
