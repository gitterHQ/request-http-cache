var GZippedRedisBackend = require('../lib/gzipped-redis-backend');
var assert = require('assert');
var keyGenerator = require('../lib/key-generator');

describe('gzipped-redis-backend', function() {

  describe('initialisation', function() {

  });

  describe('backend-interface', function() {
    var backend;

    beforeEach(function() {
      backend = new GZippedRedisBackend();
    });

    describe('vary headers', function() {

      it('should return vary headers', function(done) {
        var key = keyGenerator('https://api.github.com/', {}, null);

        backend.store(key, {
          url: 'https://api.github.com/',
          statusCode: 200,
          etag: 1234,
          expiry: Date.now(),
          headers: {
            'content-type': 'application/json',
            vary: 'accept'
          }
        }, function(err) {
          if(err) return done(err);

          backend.getVaryHeaders('https://api.github.com/', function(err, vary) {
            if (err) return done(err);
            assert.strictEqual(vary, 'accept');
            done();
          });
        });

      });


      it('should not return vary if they are missing', function(done) {

        backend.getVaryHeaders('https://_does_not_exist_/', function(err, vary) {
          if (err) return done(err);
          assert(!vary);
          done();
        });

      });

    });

    describe('update expiry headers', function() {

      it('should return update expiry', function(done) {
        var key = keyGenerator('https://api.github.com/', {}, null);

        backend.store(key, { url: 'https://api.github.com/', statusCode: 200, etag: 1234, expiry: Date.now() - 1000, headers: { 'Content-Type': 'application/json' } }, function(err) {
          if (err) return done(err);

          var newExpiry = Date.now() + 1000;
          backend.updateExpiry('https://api.github.com/', key, newExpiry, function() {
            if (err) return done(err);

            backend.getEtagExpiry(key, function(err, etagExpiry) {
              if (err) return done(err);
              assert(etagExpiry);
              assert.strictEqual(etagExpiry.expiry, newExpiry);
              done();
            });

          });

        });

      });

    });

    describe('store and retrieve', function() {

      it('should store cached content', function(done) {
        var key = keyGenerator('https://api.github.com/', {}, null);
        var expiry = Date.now();
        var body = "Hello There, how are you today?";

        backend.store(key, { url: 'https://api.github.com/', statusCode: 200, etag: 1234, expiry: expiry, headers: { 'Content-Type': 'application/json' }, body: body }, function(err) {
          if (err) return done(err);

          backend.getContent(key, function(err, result) {
            if (err) return done(err);
            assert(result);
            assert.strictEqual(result.url, 'https://api.github.com/');
            assert.strictEqual(result.statusCode, "200");
            assert.strictEqual(result.body, "Hello There, how are you today?");
            assert.deepEqual(result.headers, { 'Content-Type': 'application/json' });
            done();
          });
        });
      });

      it('should return the correct etag and expiry for cached content', function(done) {
        var key = keyGenerator('https://api.github.com/', {}, null);
        var expiry = Date.now();
        var body = "Hello There, how are you today?";

        backend.store(key, { url: 'https://api.github.com/', statusCode: 200, etag: '1234', expiry: expiry, headers: { 'Content-Type': 'application/json' }, body: body }, function(err) {
          if (err) return done(err);

          backend.getEtagExpiry(key, function(err, etagExpiry) {
            if (err) return done(err);

            assert.strictEqual(etagExpiry.url, 'https://api.github.com/');
            assert.strictEqual(etagExpiry.etag, '1234');
            assert.strictEqual(etagExpiry.expiry, expiry);
            done();
          });
        });
      });


      it('should return no etag for missing content', function(done) {
        var key = keyGenerator('https://_does_not_exist/', {}, null);

        backend.getEtagExpiry(key, function(err, etagExpiry) {
          if (err) return done(err);
          assert(!etagExpiry);
          done();
        });
      });

      it('should return no content for missing content', function(done) {
        var key = keyGenerator('https://_does_not_exist/', {}, null);

        backend.getContent(key, function(err, body) {
          if (err) return done(err);
          assert(!body);
          done();
        });
      });

    });

  });


});
