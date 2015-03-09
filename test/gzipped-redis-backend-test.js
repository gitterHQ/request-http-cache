var GZippedRedisBackend = require('../lib/gzipped-redis-backend');
var assert = require('assert');

describe('gzipped-redis-backend', function() {

  describe('initialisation', function() {

  });

  describe('backend-interface', function() {
    var backend;

    beforeEach(function() {
      backend = new GZippedRedisBackend();
    });

    describe('getKey', function() {
      it('should handle urls without tokens', function() {
        var key = backend.getKey('https://api.github.com/', null);
        assert(key);
      });

      it('should handle urls with tokens', function() {
        var key = backend.getKey('https://api.github.com/', 'token1');
        var key2 = backend.getKey('https://api.github.com/', null);
        assert(key);
        assert.notEqual(key, key2);
      });

      it('should test falseyness', function() {
        var key = backend.getKey('https://api.github.com/', 'null');
        var key2 = backend.getKey('https://api.github.com/', null);
        assert(key);
        assert.notEqual(key, key2);
      });
    });

    describe('store and retrieve', function() {

      it('should store cached content', function(done) {
        var key = backend.getKey('https://api.github.com/', 'token1');
        var expiry = Date.now();
        var body = "Hello There, how are you today?";

        backend.store(key, { statusCode: 200, etag: 1234, expiry: expiry, headers: { 'Content-Type': 'application/json' }, body: body }, function(err) {
          if (err) return done(err);

          backend.getContent(key, function(err, result) {
            if (err) return done(err);
            assert(result);
            assert.strictEqual(result.statusCode, "200");
            assert.strictEqual(result.body, "Hello There, how are you today?");
            assert.deepEqual(result.headers, { 'Content-Type': 'application/json' });
            done();
          });
        });
      });

      it('should return the correct etag and expiry for cached content', function(done) {
        var key = backend.getKey('https://api.github.com/', 'token1');
        var expiry = Date.now();
        var body = "Hello There, how are you today?";

        backend.store(key, { statusCode: 200, etag: '1234', expiry: expiry, headers: { 'Content-Type': 'application/json' }, body: body }, function(err) {
          if (err) return done(err);

          backend.getEtagExpiry(key, function(err, etagExpiry) {
            if (err) return done(err);

            assert.strictEqual(etagExpiry.etag, '1234');
            assert.strictEqual(etagExpiry.expiry, expiry);
            done();
          });
        });
      });


      it('should return no etag for missing content', function(done) {
        var key = backend.getKey('https://_does_not_exist/', 'token1');

        backend.getEtagExpiry(key, function(err, etagExpiry) {
          if (err) return done(err);
          assert(!etagExpiry);
          done();
        });
      });

      it('should return no content for missing content', function(done) {
        var key = backend.getKey('https://_does_not_exist/', 'token1');

        backend.getContent(key, function(err, body) {
          if (err) return done(err);
          assert(!body);
          done();
        });
      });
      
    });

  });


});
