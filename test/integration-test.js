var RequestHttpCache = require('..');
var request = require('request');
var assert = require('assert');
var mockStats = require('./mock-stats');

describe('integration-test', function() {

  var httpRequestCache;

  before(function() {
    stats = mockStats();

    httpRequestCache = new RequestHttpCache({
      backend: 'redis',
      redisPrefix: 'hc:' + Date.now() + ":",
      stats: stats
    });
  });

  it('should return different values for different people', function(done) {
    function makeRequest(token, user, hit, callback) {
      stats.reset();

      httpRequestCache.extension({
        method: 'GET',
        url: 'https://api.github.com/user',
        headers: {
          Authorization: 'token ' + token,
          'User-Agent': 'request-http-cache-test/1.0',
        },
        json: true
      }, function(err, response, body) {
        if (err) return done(err);
        if (response.statusCode !== 200) return done(new Error('HTTP ' + response.statusCode + ': ' + JSON.stringify(body)));

        if (hit) {
          assert.strictEqual(stats.incs.hit, 1);
        } else {
          assert(!stats.incs.hit);
        }

        assert.strictEqual(body.login, user);
        callback();
      }, request);
    }

    makeRequest(process.env.GITHUB_TOKEN_1, 'gitterawesome', false, function() {
      makeRequest(process.env.GITHUB_TOKEN_2, 'gittertestbot', false, function() {
        makeRequest(process.env.GITHUB_TOKEN_1, 'gitterawesome', true, function() {
          makeRequest(process.env.GITHUB_TOKEN_2, 'gittertestbot', true, function() {
            done();
          });
        });
      });
    });

  });


});
