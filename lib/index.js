'use strict';

var _ = require('lodash');
var debug = require('debug')('http-cache:cache');
var RedisBackend = require('./redis-backend');
var InMemoryBackend = require('./inmemory-backend');
var keyGenerator = require('./key-generator');
var Wreck = require('wreck');
var mockStats = require('./mock-stats');

function getBackend(options) {
  if (options.backend === 'redis') {
    return new RedisBackend(options);
  }

  return new InMemoryBackend(options);
}

function HttpCache(options) {
  if (!options) options = {};
  this.stats = options.stats || mockStats;
  this.backend = options.backend && typeof options.backend === 'object' ? options.backend : getBackend(options);
  this.extension = this.extensionMethod.bind(this);
}

HttpCache.prototype = {
  extensionMethod: function(options, callback, next) {
    var method = options.method ? options.method.toUpperCase() : 'GET'; /* default is GET */
    /* Only for GET */
    if (method !== 'GET' || options.disableCache) {
      return next(options, callback);
    }

    this._fetchWithCache(options, callback, next);
  },

  _fetchWithCache: function(options, callback, next) {
    var self = this;
    var requestStartTime = Date.now();

    var requestUrl = options.uri || options.url;

    this.backend.getVaryHeaders(requestUrl, function(err, varyHeaders) {
      if (err) {
        /* WARN */
        debug('http.cache error looking up headers: ' + err, { exception: err});
        self.stats.increment('backend.error');
      }

      /* Vary headers of '' means that we know there are no vary headers */
      if (!err && (varyHeaders || varyHeaders === '')) {
        debug('vary headers available: ' + varyHeaders);
        return self._cacheLookup(requestUrl, varyHeaders, options, requestStartTime, callback, next);
      }

      /** We don't have vary headers, proceed with a full request */
      return self._makeRequest(requestUrl, options, null, null, requestStartTime, callback, next);
    });
  },

  /**
   * Proceed with a cache lookup, given a request and a set of Vary headers
   */
  _cacheLookup: function(requestUrl, varyHeaders, options, requestStartTime, callback, next) {
    var self = this;
    var key = keyGenerator(requestUrl, options.headers, varyHeaders);
    debug('cache lookup key is: ' + key);

    this.backend.getEtagExpiry(key, function(err, etagExpiry) {
      if (err) {
        /* WARN */
        debug('http.cache error: ' + err, { exception: err});
        self.stats.increment('backend.error');
        /* Continue with the request regardless */
      }

      // The key is hash, so beware of duplicates
      if (etagExpiry && requestUrl !== etagExpiry.url) {
        // Duplicate key, ignore
        etagExpiry = null;
      }

      if (etagExpiry) {
        var fresh = etagExpiry.expiry && etagExpiry.expiry >= Date.now();

        /**
         * If the content is fresh, return it immediately without hitting the endpoint
         */
        if (fresh) {
          return self._getContent(requestUrl, key, function(err2, cachedContent) {
            /* No need to report error as _getContent does it */

            if (err2 || !cachedContent) return self._makeRequest(requestUrl, options, key, null, requestStartTime, callback, next);

            return self._doSuccessCallback(options, cachedContent, function(err, _response, _body) {
              if (err) {
                /* WARN */
                debug('Error parsing cache content: ' + err, { exception: err });

                /* Make the request again */
                return self._makeRequest(requestUrl, options, key, null, requestStartTime, callback, next);
              }

              self.stats.increment(['hit', 'hit.fresh']);

              if (cachedContent.backendResponseTime) {
                var responseTime = Date.now() - requestStartTime;
                self.stats.timing('response.time.saved',  cachedContent.backendResponseTime - responseTime);
              }

              return callback(null, _response, _body);
            });
          });
        }
      }

      return self._makeRequest(requestUrl, options, key, etagExpiry, requestStartTime, callback, next);
    });
  },

  /**
   * Make an HTTP request to the underlying request object
   */
  _makeRequest: function(requestUrl, options, key, etagExpiry, requestStartTime, callback, next) {
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

          return self._getContent(requestUrl, key, function(_err, cachedContent) {
            /* No need to report error as _getContent does it */

            if (_err || !cachedContent) return callback(err, response, body); // Unable to lookup content

            return self._doSuccessCallback(options, cachedContent, function(_err, _response, _body) {
              if (_err) {
                /* TODO: delete the bad content ... */
                debug('Error parsing cache content: ' + _err, { exception: _err });
                /* Return with the original error, response, body */
                return callback(err, response, body);
              }

              self.stats.increment('hit.failback');

              if (cachedContent.backendResponseTime) {
                var responseTime = Date.now() - requestStartTime;
                self.stats.timing('response.time.saved',  cachedContent.backendResponseTime - responseTime);
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

        return self._getContent(requestUrl, key, function(err, cachedContent) {
          /* No need to report error as _getContent does it */

          /* Corrupted data - reissue the request without the cache */
          if (err || !cachedContent) return self._makeRequest(requestUrl, originalOptions, key, null, requestStartTime, callback, next);

          return self._doSuccessCallback(options, cachedContent, function(err, _response, _body) {
            if (err) {
              /* WARN */
              debug('Error parsing cache content: ' + err, { exception: err });
              return self._makeRequest(requestUrl, originalOptions, key, null, requestStartTime, callback, next);
            }

            if (response.headers['cache-control']) {
              var cacheHeader = Wreck.parseCacheControl(response.headers['cache-control']);
              var expiry = Date.now();
              if (cacheHeader && cacheHeader['max-age']) {
                expiry += cacheHeader['max-age'] * 1000;
              }

              debug('Updating expiry');
              /* Safe to use key here as we cannot get this far without key being set */
              self.backend.updateExpiry(requestUrl, key, expiry, function(err) {
                if (err) {
                  debug('Unable to update expiry for content: ' + err, { exception: err });
                }
              });
            }

            self.stats.increment(['hit', 'hit.cond']);

            if (cachedContent.backendResponseTime) {
              var responseTime = Date.now() - requestStartTime;
              self.stats.timing('response.time.saved',  cachedContent.backendResponseTime - responseTime);
            }

            return callback(null, _response, _body);
          });
        });
      }

      self.stats.increment('miss');

      if (response.headers) {
        var responseEtag = response.headers.etag;

        if (response.headers['cache-control']) {
          var cacheHeader = Wreck.parseCacheControl(response.headers['cache-control']);
          var expiry = Date.now();
          if (cacheHeader && cacheHeader['max-age']) {
            expiry += cacheHeader['max-age'] * 1000;
          }

          if (responseEtag && response.statusCode === 200) {
            /* Store the cache response async */
            self._storeResponse(requestUrl, options.headers, response, expiry, responseEtag, body, requestStartTime, function(err) {
              if (err) {
                /* WARN */
                debug('http.cache cache storage failure: ' + err, { exception: err});
                self.stats.increment('backend.error');
              }
            });
          }
        }
      }

      callback(null, response, body);
    });

  },

  /**
   * Fetch the content from the backend and confirm that the URL matches
   */
  _getContent: function(url, key, callback) {
    var self = this;
    if (!key) return callback();

    this.backend.getContent(key, function(err, cachedContent) {
      if (err) {
        /* WARN */
        debug('Error looking up content: ' + err, { exception: err });
        self.stats.increment('backend.error');
      }

      /* Corrupted data - reissue the request without the cache */
      if (err || !cachedContent) return callback();

      /* Confirm that the URL for the cached content matches */
      if (cachedContent.url !== url) {
        debug('Cache hashing collision: ' + url + ", vs " + cachedContent.url);
        return callback();
      }

      return callback(null, cachedContent);
    });
  },

  _storeResponse: function(requestUrl, requestHeaders, response, expiry, etag, body, requestStartTime, callback) {
    var vary = response.headers.vary;
    var backendResponseTime = Date.now() - requestStartTime;
    /* Regenerate the key using the new vary header */
    var key = keyGenerator(requestUrl, requestHeaders, vary);

    this.backend.store(key, {
        url: requestUrl,
        statusCode: response.statusCode,
        etag: etag,
        expiry: expiry,
        headers: response.headers,
        body: body,
        backendResponseTime: backendResponseTime
      }, callback);
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
        this.stats.increment('json.parse.error');
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
  Redis: RedisBackend
};
