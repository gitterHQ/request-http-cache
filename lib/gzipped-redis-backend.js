/*jshint globalstrict:true, trailing:false, unused:true, node:true */
'use strict';

var zlib = require('zlib');
var fs = require('fs');
var _ = require('lodash');
var Schema = require('protobuf').Schema;

var EXPIRY_HASH_KEY = "ex";
var ETAG_HASH_KEY = "et";
var CONTENT_HASH_KEY = "c";
var DEFAULT_TTL = 86400;

var schema = new Schema(fs.readFileSync(__dirname + '/http-cache-message.desc'));
var HttpCacheMessage = schema['gitter.http.cache.HttpCacheMessage'];

function GZippedRedisBackend(options) {
  if (!options) options = {};

  var redisPort = options.redis && options.redis.port || 6379;
  var redisHost = options.redis && options.redis.host || '127.0.0.1';
  var redisOptions = _.extend({ }, options.redis && options.redis.options, { return_buffers: true });
  this.redisClient = options.redisClient || require('redis').createClient(redisPort, redisHost, redisOptions);

  this.ttl = options.ttl || DEFAULT_TTL;
}

GZippedRedisBackend.prototype = {
  getKey: function(url, token) {
    var key;
    if (token) {
      key = new Buffer(url + ":" + token, 'utf8').toString('base64');
    } else {
      key = new Buffer(url, 'utf8').toString('base64');
    }

    return 'hc:' + key;
  },

  getEtagExpiry: function (key, callback) {
    this.redisClient.hmget(key, EXPIRY_HASH_KEY, ETAG_HASH_KEY, function(err, result) {
      if (err) return callback(err);
      if (!result || (!result[0] && !result[1])) return callback();

      var expiry, etag;
      if (result[0]) {
        expiry = parseInt(result[0].toString('utf8'), 10);
        if (isNaN(expiry)) expiry = null;
      }

      if (result[1]) {
        etag = result[1].toString('utf8');
      }

      return callback(null, {
        expiry: expiry,
        etag: etag
      });

    });
  },

  getContent: function (key, callback) {
    this.redisClient.hmget(key, CONTENT_HASH_KEY, function(err, result) {
      if (err) return callback(err);
      if (!result || !result[0]) return callback();

      var proto;

      try {
        proto = HttpCacheMessage.parse(result[0]);
      } catch (err) {
        return callback(err);
      }

      /* Convert the headers back */
      proto.headers = proto.headers.reduce(function(memo, header) {
        memo[header.name] = header.value;
        return memo;
      }, {});

      if (proto.bodyCompressed) {
        zlib.gunzip(proto.bodyCompressed, function(err, body) {
          if (err) return callback(err);
          proto.body = body.toString('utf8');
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
    var self = this;

    if (!body) {
      /* Non gzip version */
      var proto;

      try {
        proto = HttpCacheMessage.serialize({
          statusCode: statusCode,
          headers: Object.keys(headers).map(function(name) {
            return { name: name, value: headers[name] };
          }),
          bodyCompressed: null
        });
      } catch(e) {
        return callback(err);
      }

      var multi = self.redisClient.multi();

      multi.hmset(key, EXPIRY_HASH_KEY, expiry, ETAG_HASH_KEY, etag, CONTENT_HASH_KEY, proto);
      multi.expire(key, self.ttl);
      multi.exec(callback);

      return;
    }

    /* TODO: handle this better */
    if (!Buffer.isBuffer(body) && typeof body === 'object') {
      body = JSON.stringify(body);
    }

    // TODO: Add compression via { level: 2 } for Node 0.12 and io.js
    /* Gzip the body */
    zlib.gzip(body, function(err, compressed) {
      if (err) return callback(err);

      var proto;
      try {
        proto = HttpCacheMessage.serialize({
          statusCode: statusCode,
          bodyCompressed: compressed,
          headers: Object.keys(headers).map(function(name) {
            return { name: name, value: headers[name] };
          })
        });

      } catch(err) {
        return callback(err);
      }

      var multi = self.redisClient.multi();
      multi.hmset(key, EXPIRY_HASH_KEY, expiry, ETAG_HASH_KEY, etag, CONTENT_HASH_KEY, proto);
      multi.expire(key, self.ttl);
      multi.exec(callback);
    });

  },

  updateExpiry: function(key, expiry, callback) {
    /* TODO: check that the key hasn't just been removed */
    var multi = this.redisClient.multi();
    multi.hmset(key, EXPIRY_HASH_KEY, expiry);
    multi.expire(key, this.ttl);
    multi.exec(callback);
  }

};


module.exports = GZippedRedisBackend;
