/*jshint globalstrict:true, trailing:false, unused:true, node:true */
'use strict';

var _ = require('lodash');
var debug = require('debug')('http-cache');
var GZippedRedisBackend = require('./gzipped-redis-backend');
var InMemoryBackend = require('./inmemory-backend');
var Wreck = require('wreck');
var url = require('url');

function getBackend(options) {
  if (options.backend === 'redis') {
    return new GZippedRedisBackend(options);
  }

  return new InMemoryBackend(options);
}

function HttpCache(options) {
  if (!options) options = {};
  this.backend = options.backend && typeof options.backend === 'object' ? options.backend : getBackend(options);
  this.extension = this.extensionMethod.bind(this);
}

HttpCache.prototype = {
  extensionMethod: function(options, callback, next) {
    var self = this;
    var method = options.method ? options.method.toUpperCase() : 'GET'; /* default is GET */

    /* Only for GET */
    if (method !== 'GET' || options.disableCache) {
      return next(options, callback);
    }

    var requestUrl = options.uri || options.url;
    var accessToken = this._getAccessToken(options);

    var key = this.backend.getKey(requestUrl, accessToken);
    this.backend.getEtagExpiry(key, function(err, etagExpiry) {
      if (err) {
        /* WARN */
        debug('http.cache error: ' + err, { exception: err});
        /* Continue with the request regardless */
      }

      if (etagExpiry) {
        var fresh = etagExpiry.expiry && etagExpiry.expiry >= Date.now();

        /**
         * If the content is fresh, return it immediately without hitting the endpoint
         */
        if (fresh) {
          return self.backend.getContent(key, function(err2, cachedContent) {
            if (err2) {
              /* WARN */
              debug('Error looking up cache content: ' + err2, { exception: err2 });
            }

            if (err2 || !cachedContent) return self._makeRequest(requestUrl, accessToken, options, key, null, callback, next);

            return self._doSuccessCallback(options, cachedContent, function(err, _response, _body) {
              if (err) {
                /* WARN */
                debug('Error parsing cache content: ' + err, { exception: err });

                /* Make the request again */
                return self._makeRequest(requestUrl, accessToken, options, key, null, callback, next);
              }

              return callback(null, _response, _body);
            });
          });
        }
      }

      return self._makeRequest(requestUrl, accessToken, options, key, etagExpiry, callback, next);
    });

  },

  /**
   * Find the access token in the request options
   */
  _getAccessToken: function(options) {
    var accessToken;
    if (options.headers) {
      var authHeader = options.headers.Authorization || options.headers.authorization;

      if (authHeader) {
        var match = authHeader.match(/^token (.*)$/i);
        if (match) {
          accessToken = match[1];
        }
      }
    }

    if (!accessToken) {
      var requestUrl = options.uri || options.url;
      var parsed = url.parse(requestUrl, true);
      accessToken = parsed.query.access_token;
    }

    return accessToken;
  },

  /**
   * Make an HTTP request to the underlying request object
   */
  _makeRequest: function(requestUrl, accessToken, options, key, etagExpiry, callback, next) {
    var self = this;
    var etag = etagExpiry && etagExpiry.etag;
    var originalOptions = options;

    /* If we have an etag, always use it */
    if (etag) {
      /* Clone the options so not to modify the original */
      options = _.extend({}, options);
      options.headers = _.extend({}, options.headers, {
        'If-None-Match': etag
      });
    }

    next(options, function(err, response, body) {
      if (err || (response.statusCode >= 500 && response.statusCode < 600)) {
        if (etagExpiry) {
          /* WARN */
          debug('http.cache upstream failure. Using cached response: ' + err, { exception: err});

          return self.backend.getContent(key, function(_err, cachedContent) {
            if (_err) {
              debug('Error looking up cache content: ' + _err, { exception: _err });
            }

            if (_err || !cachedContent) return callback(err, response, body); // Unable to lookup content

            return self._doSuccessCallback(options, cachedContent, function(_err, _response, _body) {
              if (_err) {
                /* TODO: delete the bad content ... */
                debug('Error parsing cache content: ' + _err, { exception: _err });
                /* Return with the original error, response, body */
                return callback(err, response, body);
              }

              return callback(null, _response, _body);
            });
          });
        } else {
          return callback(err, response, body);
        }

        return;
      }

      if (etag && response.statusCode === 304) {
        debug('Conditional request success. Attempting to use cached content');

        return self.backend.getContent(key, function(err, cachedContent) {
          if (err) {
            /* WARN */
            debug('Error looking up content: ' + err, { exception: err });
          }

          /* Corrupted data - reissue the request without the cache */
          if (err || !cachedContent) return self._makeRequest(requestUrl, accessToken, originalOptions, key, null, callback, next);

          return self._doSuccessCallback(options, cachedContent, function(err, _response, _body) {
            if (err) {
              /* WARN */
              debug('Error parsing cache content: ' + err, { exception: err });
              return self._makeRequest(requestUrl, accessToken, originalOptions, key, null, callback, next);
            }

            if (response.headers['cache-control']) {
              var cacheHeader = Wreck.parseCacheControl(response.headers['cache-control']);
              var expiry = Date.now();
              if (cacheHeader && cacheHeader['max-age']) {
                expiry += cacheHeader['max-age'] * 1000;
              }

              debug('Updating expiry');
              self.backend.updateExpiry(key, expiry, function(err) {
                if (err) {
                  debug('Unable to update expiry for content: ' + err, { exception: err });
                }
              });
            }

            return callback(null, _response, _body);
          });
        });
      }

      var responseEtag = response.headers.etag;

      if (response.headers['cache-control']) {
        var cacheHeader = Wreck.parseCacheControl(response.headers['cache-control']);
        var expiry = Date.now();
        if (cacheHeader && cacheHeader['max-age']) {
          expiry += cacheHeader['max-age'] * 1000;
        }

        if (responseEtag && response.statusCode === 200) {
          /* Store the cache response async */
          self.backend.store(key, { statusCode: response.statusCode, etag: responseEtag, expiry: expiry, headers: response.headers, body: body }, function(err) {
            if (err) {
              /* WARN */
              debug('http.cache cache storage failure: ' + err, { exception: err});
            }
          });
        }
      }

      callback(null, response, body);
    });

  },

  /**
   * Converts the cachedContent into a request style callback
   */
  _doSuccessCallback: function(options, cachedContent, callback) {
    var response = {
      statusCode: parseInt(cachedContent.statusCode, 10),
      headers: cachedContent.headers
    };

    if (options.json) {
      /* Use the cached response */
      try {
        var parsed = JSON.parse(cachedContent.body);
        return callback(null, response, parsed);
      } catch(e) {
        return callback(e);
      }
    }

    /* Use the cached response */
    return callback(null, response, cachedContent.body);
  }
};


module.exports = HttpCache;
module.exports.backends = {
  InMemory: InMemoryBackend,
  GZippedRedis: GZippedRedisBackend
};
