var RequestHttpCache = require('..');
var request = require('request');
var TEST_ENDPOINT = 'https://api.github.com';
var nock = require('nock');
var assert = require('assert');
var sinon = require('sinon');

describe('request-http-cache', function() {
  var scope;

  beforeEach(function() {
    scope = nock(TEST_ENDPOINT);
  });

  afterEach(function() {
    scope.done();
  });

  describe('obtaining access tokens', function() {
    it('should extract the accessToken from the auth header', function() {
      var httpRequestCache = new RequestHttpCache();

      var accessToken = httpRequestCache._getAccessToken({
        url: 'https://gitter.im',
        headers: {
          'authorization': 'token 1234'
        }
      });

      assert.strictEqual(accessToken, '1234');
    });

    it('should extract the accessToken from the query string', function() {
      var httpRequestCache = new RequestHttpCache();

      var accessToken = httpRequestCache._getAccessToken({
        url: 'https://gitter.im?access_token=3456',
        headers: {
          'authorization': ''
        }
      });

      assert.strictEqual(accessToken, '3456');
    });

  });

  describe('non-GET methods', function() {

    it('should not intercept non-get methods', function(done) {
      scope.post('/post')
           .reply(200, "POSTED");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.getKey = function() {
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

    describe('it should handle total misses', function(done) {
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
      var err, path, response, body, responseBody, headers;
      var backend;

      beforeEach(function(done) {
        var mockBackend = new RequestHttpCache.backends.InMemory();
        var k = mockBackend.getKey('https://api.github.com' + path, null);

        mockBackend.store(k, {
          statusCode: 200,
          etag: '1234',
          expiry: Date.now() + 1000,
          headers: {
            'content-type': 'application/json'
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
        assert.strictEqual(response.headers['content-type'], 'application/json');
        assert.deepEqual(body, "{\"hello\":\"cached\"}");
      });
    });

    describe('it should handle etag hits', function() {
      var httpRequestCache;
      var err, path, response, body, responseBody, headers, updateExpirySpy;
      var backend;

      beforeEach(function(done) {
        scope.get(path)
            .matchHeader('if-none-match', '1234')
            .reply(304, null, { 'cache-control': 'private, max-age=60, s-maxage=60' } );

        var mockBackend = new RequestHttpCache.backends.InMemory();
        var k = mockBackend.getKey('https://api.github.com' + path, null);
        updateExpirySpy = sinon.spy(mockBackend, "updateExpiry");

        mockBackend.store(k, {
          statusCode: 200,
          etag: '1234',
          expiry: Date.now() - 1000,
          headers: {
            'content-type': 'application/json'
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
        assert.strictEqual(response.headers['content-type'], 'application/json');
        assert(updateExpirySpy.calledOnce);
        assert.deepEqual(body, "{\"hello\":\"cached\"}");
      });
    });

    describe('it should handle etag missed', function() {

      var httpRequestCache;
      var err, path, response, body, responseBody, headers;
      var backend;

      beforeEach(function(done) {
        scope.get(path)
             .matchHeader('if-none-match', '1234')
             .reply(200, JSON.stringify({ hello: 'missed' }), { 'Content-Type': 'application/json' });

        var mockBackend = new RequestHttpCache.backends.InMemory();
        var k = mockBackend.getKey('https://api.github.com' + path, null);

        mockBackend.store(k, {
          statusCode: 200,
          etag: '1234',
          expiry: Date.now() - 1000,
          headers: {
            'content-type': 'application/json'
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
        assert.strictEqual(response.headers['content-type'], 'application/json');
        assert.deepEqual(body, "{\"hello\":\"missed\"}");
      });

    });
  });

  describe('backend failures', function() {

    it('should handle backend failures for obtaining the etag', function(done) {
      var httpRequestCache;
      var err, path, response, body, responseBody, headers;
      var backend;

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
      var err, path, response, body, responseBody, headers;
      var backend;

      scope.get('/error2.1')
           .reply(200, "NOT CACHED");

      var mockBackend = new RequestHttpCache.backends.InMemory();
      mockBackend.getContent = sinon.spy(function(key, callback) {
        setTimeout(function() {
          callback(new Error('Failure'));
        }, 1);
      });


      var k = mockBackend.getKey('https://api.github.com/error2.1', null);

      mockBackend.store(k, {
        statusCode: 200,
        etag: '1234',
        expiry: Date.now() + 1000,
        headers: {
          'content-type': 'application/json'
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
      var err, path, response, body, responseBody, headers;
      var backend;

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


      var k = mockBackend.getKey('https://api.github.com/error2', null);

      mockBackend.store(k, {
        statusCode: 200,
        etag: '1234',
        expiry: Date.now() - 1000,
        headers: {
          'content-type': 'application/json'
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
      var err, path, response, body, responseBody, headers;
      var backend;

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
      var err, path, response, body, responseBody, headers;
      var backend;

      scope.get('/parseError')
           .reply(200, JSON.stringify({ hello: 'fetched '}), { headers: { 'Content-Type': 'application/json '}});

      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = mockBackend.getKey('https://api.github.com/parseError', null);
      var getContentSpy = sinon.spy(mockBackend, "getContent");

      mockBackend.store(k, {
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() + 1000,
        headers: {
          'content-type': 'application/json'
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
      var err, path, response, body, responseBody, headers;
      var backend;

      scope.get('/unavailable')
           .reply(500);

      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = mockBackend.getKey('https://api.github.com/unavailable', null);
      var getContentSpy = sinon.spy(mockBackend, "getContent");

      mockBackend.store(k, {
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() - 1000, // Expired
        headers: {
          'content-type': 'text/plain'
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
      var err, path, response, body, responseBody, headers;
      var backend;

      scope.get('/unavailable2')
           .reply(500);

      var mockBackend = new RequestHttpCache.backends.InMemory();
      var k = mockBackend.getKey('https://api.github.com/unavailable2', null);
      mockBackend.getContent = sinon.spy(function(key, callback) {
        callback(new Error());
      });

      mockBackend.store(k, {
        statusCode: 200,
        etag: '2345',
        expiry: Date.now() - 1000, // Expired
        headers: {
          'content-type': 'text/plain'
        },
        body: "OLD CONTENT"
      }, function() {});

      httpRequestCache = new RequestHttpCache({
        backend: mockBackend
      });

      httpRequestCache.extension({
         url: 'https://api.github.com/unavailable2'
        }, function(err, response, body) {
          assert(!err);
          assert.equal(response.statusCode, 500);
          assert(mockBackend.getContent.calledOnce);
          done();
        }, request);
    });

  });


});
