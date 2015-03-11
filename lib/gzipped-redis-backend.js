'use strict';

var zlib = require('zlib');
var fs = require('fs');
var _ = require('lodash');
var Schema = require('protobuf').Schema;

var VARY_PREFIX = "hc:v:";
var CONTENT_PREFIX = "hc:c:";

var EXPIRY_HASH_KEY = "ex";
var ETAG_HASH_KEY = "et";
var CONTENT_HASH_KEY = "c";
var URL_KEY = "u";
var DEFAULT_TTL = 86400;

var schema = new Schema(fs.readFileSync(__dirname + '/http-cache-message.desc'));
var HttpCacheMessage = schema['gitter.http.cache.HttpCacheMessage'];

function bufferToString(buffer) {
  if (typeof buffer === 'string') return buffer;

  return buffer.toString('utf8');
}

function GZippedRedisBackend(options) {
  if (!options) options = {};

  var redisPort = options.redis && options.redis.port || 6379;
  var redisHost = options.redis && options.redis.host || '127.0.0.1';
  var redisOptions = _.extend({ }, options.redis && options.redis.options, { return_buffers: true });
  this.redisClient = options.redisClient || require('redis').createClient(redisPort, redisHost, redisOptions);

  this.ttl = options.ttl || DEFAULT_TTL;
}

GZippedRedisBackend.prototype = {
  /**
   * Returns the Vary headers for a given URL
   */
  getVaryHeaders: function(url, callback) {
    this.redisClient.get(VARY_PREFIX + url, callback);
  },

  getEtagExpiry: function (key, callback) {
    this.redisClient.hmget(CONTENT_PREFIX + key, EXPIRY_HASH_KEY, ETAG_HASH_KEY, URL_KEY, function(err, result) {
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
    this.redisClient.hmget(CONTENT_PREFIX + key, CONTENT_HASH_KEY, URL_KEY, function(err, result) {
      if (err) return callback(err);
      if (!result || !result[0]) return callback();

      var proto;

      try {
        proto = HttpCacheMessage.parse(result[0]);
      } catch (err) {
        return callback(err);
      }

      proto.url = bufferToString(result[1]); // Add the URL in as a hash collision check


      /* Convert the headers back */
      proto.headers = proto.headers.reduce(function(memo, header) {
        memo[header.name] = header.value;
        return memo;
      }, { });

      if (proto.bodyCompressed) {
        zlib.gunzip(proto.bodyCompressed, function(err, body) {
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
    var self = this;

    if (!body) {
      return this._persist(url, key, statusCode, null, headers, expiry, etag, callback);
    }

    /* TODO: handle this better */
    if (!Buffer.isBuffer(body) && typeof body === 'object') {
      body = JSON.stringify(body);
    }

    // TODO: Add compression via { level: 2 } for Node 0.12 and io.js
    /* Gzip the body */
    zlib.gzip(body, function(err, compressed) {
      if (err) return callback(err);

      self._persist(url, key, statusCode, compressed, headers, expiry, etag, callback);
    });

  },

  updateExpiry: function(url, key, expiry, callback) {
    /* TODO: check that the key hasn't just been removed */
    var multi = this.redisClient.multi();
    multi.hmset(CONTENT_PREFIX + key, EXPIRY_HASH_KEY, expiry);
    multi.expire(CONTENT_PREFIX + key, this.ttl);
    multi.expire(VARY_PREFIX + url, this.ttl);
    multi.exec(callback);
  },

  _persist: function(url, key, statusCode, bodyCompressed, headers, expiry, etag, callback) {
    var vary = headers && headers.vary || '';

    var proto;
    try {
      proto = HttpCacheMessage.serialize({
        statusCode: statusCode,
        bodyCompressed: bodyCompressed,
        headers: Object.keys(headers).map(function(name) {
          return { name: name, value: headers[name] };
        })
      });

    } catch(err) {
      return callback(err);
    }

    var multi = this.redisClient.multi();
    // Update the content
    multi.hmset(CONTENT_PREFIX + key, EXPIRY_HASH_KEY, expiry, ETAG_HASH_KEY, etag, CONTENT_HASH_KEY, proto, URL_KEY, url);
    multi.expire(CONTENT_PREFIX + key, this.ttl);

    // Update the vary headers
    multi.set(VARY_PREFIX + url, vary);
    multi.expire(VARY_PREFIX + url, this.ttl);
    multi.exec(callback);
  }

};


module.exports = GZippedRedisBackend;
