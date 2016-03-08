var RequestHttpCache = require('..');
var request = require('request');
var TEST_ENDPOINT = 'https://api.github.com';
var nock = require('nock');
var assert = require('assert');
var sinon = require('sinon');
var keyGenerator = require('../lib/key-generator');

var MIME_JSON = "application/json";
var MIME_TEXT = "text/plain";

describe('request-http-cache', function() {
  var scope;

  beforeEach(function() {
    scope = nock(TEST_ENDPOINT);
  });

  afterEach(function() {
    scope.done();
  });

  describe('non-GET methods', function() {

    it('should not intercept non-get methods', function(done) {
      scope.post('/post')
           .reply(200, "POSTED");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.getEtagExpiry = function() {
        assert(false, 'Caching should be bypassed for non-GET operations');
      };

      var httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
          method: 'POST',
          url: 'https://api.github.com/post'
        }, function(err, response, body) {
          assert(!err);
          assert.equal(response.statusCode, 200);
          assert.strictEqual(body, "POSTED");
          done();
        }, request);
    });
  });

  describe('normal operation', function() {

    describe('it should handle total misses', function() {
      var httpRequestCache;
      var err, path, response, body, responseBody, statusCode, headers;
      var backend;

      beforeEach(function(done) {
        httpRequestCache = new RequestHttpCache();

        scope.get(path)
             .reply(statusCode, responseBody, headers);

        httpRequestCache.extension({
           url: 'https://api.github.com' + path,
           backend: backend
          }, function(_err, _response, _body) {
          err = _err;
          response = _response;
          body = _body;
          done();
         }, request);

      });

      describe('when the response does not include cache headers', function() {
        before(function() {
          path = '/miss';
          statusCode = 200;
          responseBody = JSON.stringify({ hello: 'there' });
          headers = { };
        });

        it('should return a response', function() {
          assert(!err);
          assert.strictEqual(response.statusCode, statusCode);
          assert.deepEqual(body, responseBody);
        });

      });

      describe('when the response does include cache headers', function() {
        before(function() {
          path = '/miss2';
          statusCode = 200;
          responseBody = JSON.stringify({ hello: 'there' });
          headers = { etag: '1234', 'cache-control': 'private, max-age=60' };
        });

        it('should return a response', function() {
          assert(!err);
          assert.strictEqual(response.statusCode, statusCode);
          assert.deepEqual(body, responseBody);
        });

      });

    });

    describe('it should handle total hits', function() {
      var httpRequestCache;
      var err, path, response, body;

      beforeEach(function(done) {
        var mockBackend = new RequestHttpCache.backends.InMemory();
        var k = keyGenerator('https://api.github.com' + path, {}, null);

        mockBackend.store(k, {
          url: 'https://api.github.com' + path,
          statusCode: 200,
          etag: '1234',
          expiry: Date.now() + 1000,
          headers: {
            'content-type': MIME_JSON
          },
          body: JSON.stringify({ hello: 'cached' })
        }, function() {});

        httpRequestCache = new RequestHttpCache({
          backend: mockBackend
        });

        httpRequestCache.extension({
           url: 'https://api.github.com' + path
          }, function(_err, _response, _body) {
          err = _err;
          response = _response;
          body = _body;
          done();
         }, request);

      });


      before(function() {
        path = '/hit1';
      });

      it('should return a response', function() {
        assert(!err);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], MIME_JSON);
        assert.deepEqual(body, "{\"hello\":\"cached\"}");
      });
    });

    describe('it should handle etag hits', function() {
      var httpRequestCache;
      var err, path, response, body;

      beforeEach(function(done) {
        scope.get(path)
            .matchHeader('if-none-match', '1234')
            .reply(304, null, { 'cache-control': 'private, max-age=60, s-maxage=60' } );

        var mockBackend = new RequestHttpCache.backends.InMemory();
        var k = keyGenerator('https://api.github.com' + path, {}, null);

        updateExpirySpy = sinon.spy(mockBackend, "updateExpiry");

        mockBackend.store(k, {
          url: 'https://api.github.com' + path,
          statusCode: 200,
          etag: '1234',
          expiry: Date.now() - 1000,
          headers: {
            'content-type': MIME_JSON
          },
          body: JSON.stringify({ hello: 'cached' })
        }, function() {});

        httpRequestCache = new RequestHttpCache({
          backend: mockBackend
        });

        httpRequestCache.extension({
           url: 'https://api.github.com' + path
          }, function(_err, _response, _body) {
          err = _err;
          response = _response;
          body = _body;
          done();
         }, request);

      });

      before(function() {
        path = '/hit2';
      });

      it('should return a response', function() {
        assert(!err);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], MIME_JSON);
        assert(updateExpirySpy.calledOnce);
        assert.deepEqual(body, "{\"hello\":\"cached\"}");
      });
    });

    describe('it should handle etag missed', function() {

      var httpRequestCache;
      var err, path, response, body;

      beforeEach(function(done) {
        scope.get(path)
             .matchHeader('if-none-match', '1234')
             .reply(200, JSON.stringify({ hello: 'missed' }), { 'Content-Type': MIME_JSON });

        var mockBackend = new RequestHttpCache.backends.InMemory();
        var k = keyGenerator('https://api.github.com' + path, {}, null);

        mockBackend.store(k, {
          url: 'https://api.github.com' + path,
          statusCode: 200,
          etag: '1234',
          expiry: Date.now() - 1000,
          headers: {
            'content-type': MIME_JSON
          },
          body: JSON.stringify({ hello: 'cached' })
        }, function() {});

        httpRequestCache = new RequestHttpCache({
          backend: mockBackend
        });

        httpRequestCache.extension({
           url: 'https://api.github.com' + path
          }, function(_err, _response, _body) {
          err = _err;
          response = _response;
          body = _body;
          done();
         }, request);

      });

      before(function() {
        path = '/hit2';
      });

      it('should return a response', function() {
        assert(!err);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], MIME_JSON);
        assert.deepEqual(body, "{\"hello\":\"missed\"}");
      });

    });

    describe('it should handle json initial requests', function() {

        describe('when subsequent request is json', function() {
            var httpRequestCache;
            var err, path, response, body;

            beforeEach(function(done) {
              var mockBackend = new RequestHttpCache.backends.InMemory();
              var k = keyGenerator('https://api.github.com' + path, {}, null);

              mockBackend.store(k, {
                url: 'https://api.github.com' + path,
                statusCode: 200,
                etag: '1234',
                expiry: Date.now() + 1000,
                headers: {
                  'content-type': MIME_JSON
                },
                body: { hello: 'cached' } // JSON data
              }, function() {});

              httpRequestCache = new RequestHttpCache({
                backend: mockBackend
              });

              httpRequestCache.extension({
                 url: 'https://api.github.com' + path,
                 json: true
                }, function(_err, _response, _body) {
                err = _err;
                response = _response;
                body = _body;
                done();
               }, request);

            });


            before(function() {
              path = '/hit1';
            });

            it('should return cached response', function() {
              assert(!err);
              assert.strictEqual(response.statusCode, 200);
              assert.strictEqual(response.headers['content-type'], MIME_JSON);
              assert.deepEqual(body, { hello: 'cached' });
            });
        });

        describe('when subsequent request is not json', function() {
            var httpRequestCache;
            var err, path, response, body;

            beforeEach(function(done) {
              var mockBackend = new RequestHttpCache.backends.InMemory();
              var k = keyGenerator('https://api.github.com' + path, {}, null);

              mockBackend.store(k, {
                url: 'https://api.github.com' + path,
                statusCode: 200,
                etag: '1234',
                expiry: Date.now() + 1000,
                headers: {
                  'content-type': MIME_JSON
                },
                body: { hello: 'cached' } // JSON data
              }, function() {});

              httpRequestCache = new RequestHttpCache({
                backend: mockBackend
              });

              httpRequestCache.extension({
                 url: 'https://api.github.com' + path,
                 json: false
                }, function(_err, _response, _body) {
                err = _err;
                response = _response;
                body = _body;
                done();
               }, request);

            });


            before(function() {
              path = '/hit1';
            });

            it('should return cached response', function() {
              assert(!err);
              assert.strictEqual(response.statusCode, 200);
              assert.strictEqual(response.headers['content-type'], MIME_JSON);
              assert.deepEqual(body, "{\"hello\":\"cached\"}");
            });
        });
    });
  });

  describe('backend failures', function() {

    it('should handle backend failures for obtaining the etag', function(done) {
      var httpRequestCache;

      scope.get('/error1')
           .reply(200, "OK");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.getEtagExpiry = function(key, callback) {
        setTimeout(function() {
          callback(new Error('Failure'));
        }, 1);
      };


      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
         url: 'https://api.github.com/error1'
        }, function(err, response, body) {
          assert(!err);
          assert.equal(response.statusCode, 200);
          assert.strictEqual(body, "OK");
          done();
        }, request);
    });

    it('should handle errors retrieving the content from the cache on fresh access', function(done) {
      var httpRequestCache;

      scope.get('/error2.1')
           .reply(200, "NOT CACHED");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.getContent = sinon.spy(function(key, callback) {
        setTimeout(function() {
          callback(new Error('Failure'));
        }, 1);
      });

      var k = keyGenerator('https://api.github.com/error2.1', {}, null);

      mockBackend.store(k, {
        url: 'https://api.github.com/error2.1',
        statusCode: 200,
        etag: '1234',
        expiry: Date.now() + 1000,
        headers: {
          'content-type': MIME_JSON
        },
        body: JSON.stringify({ hello: 'cached' })
      }, function() {});


      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
        method: 'gET', // Weird deliberately
         url: 'https://api.github.com/error2.1'
        }, function(err, response, body) {
          assert(!err);
          assert(mockBackend.getContent.calledOnce);
          assert.equal(response.statusCode, 200);
          assert.strictEqual(body, "NOT CACHED");
          done();
        }, request);
    });


    it('should handle errors retrieving the content from the cache on non-fresh access', function(done) {
      var httpRequestCache;

      scope.get('/error2')
           .matchHeader('if-none-match', '1234')
           .reply(304);

      scope.get('/error2')
           .reply(200, "NOT CACHED");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.getContent = sinon.spy(function(key, callback) {
        setTimeout(function() {
          callback(new Error('Failure'));
        }, 1);
      });


      var k = keyGenerator('https://api.github.com/error2');

      mockBackend.store(k, {
        url: 'https://api.github.com/error2',
        statusCode: 200,
        etag: '1234',
        expiry: Date.now() - 1000,
        headers: {
          'content-type': MIME_JSON
        },
        body: JSON.stringify({ hello: 'cached' })
      }, function() {});


      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
        method: 'gET', // Weird deliberately
         url: 'https://api.github.com/error2'
        }, function(err, response, body) {
          assert(!err);
          assert(mockBackend.getContent.calledOnce);
          assert.equal(response.statusCode, 200);
          assert.strictEqual(body, "NOT CACHED");
          done();
        }, request);
    });

    it('should handle errors updating the cache', function(done) {
      var httpRequestCache;

      scope.get('/error3')
           .reply(200, "NOT CACHED2");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.store = function(key, content, callback) {
        setTimeout(function() {
          callback(new Error('Failure'));
        }, 1);
      };

      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
         url: 'https://api.github.com/error3'
        }, function(err, response, body) {
          assert(!err);
          assert.equal(response.statusCode, 200);
          assert.strictEqual(body, "NOT CACHED2");
          done();
        }, request);
    });

    it('should handle JSON parsing problems', function(done) {
      var httpRequestCache;

      scope.get('/parseError')
           .reply(200, JSON.stringify({ hello: 'fetched '}), { headers: { 'Content-Type': MIME_JSON }});

      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = keyGenerator('https://api.github.com/parseError', { }, null);
      var getContentSpy = sinon.spy(mockBackend, "getContent");

      mockBackend.store(k, {
        url: 'https://api.github.com/parseError',
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() + 1000,
        headers: {
          'content-type': MIME_JSON
        },
        body: "BROKEN JSON"
      }, function() {});

      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
         url: 'https://api.github.com/parseError',
         json: true
        }, function(err, response, body) {
          assert(!err);
          assert.equal(response.statusCode, 200);
          assert.deepEqual(body, { hello: 'fetched '});
          assert(getContentSpy.calledOnce);
          done();
        }, request);
    });

    it('should return non-fresh content when the service is unavailable', function(done) {
      var httpRequestCache;

      scope.get('/unavailable')
           .reply(500);

      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = keyGenerator('https://api.github.com/unavailable', {}, null);
      var getContentSpy = sinon.spy(mockBackend, "getContent");

      mockBackend.store(k, {
        url: 'https://api.github.com/unavailable',
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() - 1000, // Expired
        headers: {
          'content-type': MIME_TEXT
        },
        body: "OLD CONTENT"
      }, function() {});

      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
         url: 'https://api.github.com/unavailable'
        }, function(err, response, body) {
          assert(!err);
          assert.equal(response.statusCode, 200);
          assert.strictEqual(body, "OLD CONTENT");
          assert(getContentSpy.calledOnce);
          done();
        }, request);
    });

    it('should return the original error on failure if the backend has an error', function(done) {
      var httpRequestCache;

      scope.get('/unavailable2')
           .reply(500);

      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = keyGenerator('https://api.github.com/unavailable2', {}, null);
      mockBackend.getContent = sinon.spy(function(key, callback) {
        callback(new Error());
      });

      mockBackend.store(k, {
        url: 'https://api.github.com/unavailable2',
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() - 1000, // Expired
        headers: {
          'content-type': MIME_TEXT
        },
        body: "OLD CONTENT"
      }, function() {});

      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
         url: 'https://api.github.com/unavailable2'
        }, function(err, response) {
          assert(!err);
          assert.equal(response.statusCode, 500);
          assert(mockBackend.getContent.calledOnce);
          done();
        }, request);
    });

  });

  describe('handle vary', function() {
    it('should cache according to vary headers', function(done) {
      httpRequestCache = new RequestHttpCache({
      });

      var jsonBody = JSON.stringify({ hello: 'there' });
      var textBody = "Hello There";
      var calls = 0;
      var jsonRequest = 0;
      var textRequest = 0;

      var mockRequest = function(options, callback) {
        assert.strictEqual(options.url, 'https://api.github.com/vary1');
        calls++;
        if (options.headers.accept == MIME_JSON) {
          jsonRequest++;
          return callback(null, {
            statusCode: 200,
            headers: {
              etag: '1234',
              vary: 'Accept',
              'content-type': MIME_JSON,
              'cache-control': 'private, max-age=60'
            }
          }, jsonBody);
        } else if(options.headers.accept == MIME_TEXT) {
          textRequest++;
          return callback(null, {
            statusCode: 200,
            headers: {
              etag: '4567',
              vary: 'Accept',
              'content-type': MIME_TEXT,
              'cache-control': 'private, max-age=60'
            }
          }, textBody);
        } else {
          callback(new Error('Unknown request'));
        }
      };

      // Plain-text
      httpRequestCache.extension({
        url: 'https://api.github.com/vary1',
        headers: {
          'accept': MIME_TEXT
        }
      }, function(err, response, body) {
         if (err) return done(err);
         assert.strictEqual(calls, 1);
         assert.strictEqual(jsonRequest, 0);
         assert.strictEqual(textRequest, 1);

         assert.equal(response.statusCode, 200);
         assert.equal(body, "Hello There");

         // JSON
         httpRequestCache.extension({
           url: 'https://api.github.com/vary1',
           headers: {
             'accept': MIME_JSON
           }
         }, function(err, response, body) {
            if (err) return done(err);

            assert.strictEqual(calls, 2);
            assert.strictEqual(jsonRequest, 1);
            assert.strictEqual(textRequest, 1);

            assert.equal(response.statusCode, 200);
            assert.equal(body, jsonBody);

            // Plain-text, cached
            httpRequestCache.extension({
              url: 'https://api.github.com/vary1',
              headers: {
                'accept': MIME_TEXT
              }
            }, function(err, response, body) {
               if (err) return done(err);

               assert.strictEqual(calls, 2);
               assert.strictEqual(jsonRequest, 1);
               assert.strictEqual(textRequest, 1);

               assert.equal(response.statusCode, 200);
               assert.equal(body, textBody);

               // JSON, cached
               httpRequestCache.extension({
                 url: 'https://api.github.com/vary1',
                 headers: {
                   'accept': MIME_JSON
                 }
               }, function(err, response, body) {
                  if (err) return done(err);

                  assert.strictEqual(calls, 2);
                  assert.strictEqual(jsonRequest, 1);
                  assert.strictEqual(textRequest, 1);

                  assert.equal(response.statusCode, 200);
                  assert.equal(body, jsonBody);

                  done();
               }, mockRequest);

            }, mockRequest);

         }, mockRequest);

      }, mockRequest);

    });

  });

  describe('hash collisions', function() {
    it('should treat hash collisions as cache missed', function(done) {
      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = keyGenerator('https://api.github.com/xxxx', {}, null);
      var calls = 0;
      mockBackend.store(k, {
        url: 'https://api.github.com/yyyyy', // <-- NB
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() + 1000, // Not expired
        headers: {
          'content-type': MIME_TEXT
        },
        body: "WRONG"
      }, function() {});

      var httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });


      var mockRequest = function(options, callback) {
        assert.strictEqual(options.url, 'https://api.github.com/xxxx');
        calls++;
        callback(null, { statusCode: 200 }, "hello");
      };

      httpRequestCache.extension({ url: 'https://api.github.com/xxxx' }, function(err, response, body) {
        if (err) return done(err);
        assert.strictEqual(body, "hello");
        assert.strictEqual(calls, 1);
        done();
      }, mockRequest);

    });

    it('should treat hash collisions as cache missed during content fetch', function(done) {
      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = keyGenerator('https://api.github.com/xxxx', {}, null);
      var calls = 0;
      mockBackend.store(k, {
        url: 'https://api.github.com/xxxx', // <-- NB
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() + 1000, // Not expired
        headers: {
          'content-type': MIME_TEXT
        },
        body: "WRONG"
      }, function() {});

      mockBackend.getEtagExpiry = function(key, callback) {
        mockBackend.store(k, {
          url: 'https://api.github.com/yyyy', // <-- NB
          statusCode: 200,
          etag: '2345',
          expiry: Date.now() + 1000, // Not expired
          headers: {
            'content-type': MIME_TEXT
          },
          body: "WRONG"
        }, function() {});
  
        return callback(null, {
          url: 'https://api.github.com/xxxx', // <-- NB
          etag: '2345',
          expiry: Date.now() + 1000, // Not expired
        });
      };

      var httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      var mockRequest = function(options, callback) {
        assert.strictEqual(options.url, 'https://api.github.com/xxxx');
        calls++;
        callback(null, { statusCode: 200 }, "hello");
      };

      httpRequestCache.extension({ url: 'https://api.github.com/xxxx' }, function(err, response, body) {
        if (err) return done(err);
        assert.strictEqual(body, "hello");
        assert.strictEqual(calls, 1);
        done();
      }, mockRequest);

    });

  });

  describe('backend errors', function() {
    var mockBackend, httpRequestCache, mockRequest, calls;

    beforeEach(function() {
      calls = 0;
      mockBackend = new RequestHttpCache.backends.InMemory();
      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });
      mockRequest = function(options, callback) {
        calls++;
        callback(null, { statusCode: 200 }, "hello");
      };
    });

    it('should deal with getVaryHeaders errors', function(done) {
      mockBackend.getVaryHeaders = function(url, callback) {
        assert.strictEqual(url, 'https://api.github.com/x');
        callback(new Error('fail'));
      };

      httpRequestCache.extension({ url: 'https://api.github.com/x' }, function(err, response, body) {
        assert.strictEqual(body, "hello");
        assert.strictEqual(calls, 1);
        done();
      }, mockRequest);

    });

    it('should deal with getEtagExpiry errors', function(done) {
      var k = keyGenerator('https://api.github.com/x', {}, null);

      mockBackend.getEtagExpiry = function(key, callback) {
        assert.strictEqual(key, k);
        callback(new Error('fail'));
      };

      mockBackend.store(k, {
        url: 'https://api.github.com/x', // <-- NB
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() - 1000, // Expired
        body: "WRONG"
      }, function() {});

      httpRequestCache.extension({ url: 'https://api.github.com/x' }, function(err, response, body) {
        assert.strictEqual(body, "hello");
        assert.strictEqual(calls, 1);
        done();
      }, mockRequest);

    });


  });


});
