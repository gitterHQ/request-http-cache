var RequestHttpCache = require('..');
var request = require('request');
var assert = require('assert');

describe('integration-test', function() {

  var httpRequestCache;

  before(function() {
    httpRequestCache = new RequestHttpCache({
      backend: 'redis',
      redisPrefix: 'hc:' + Date.now() + ":"
    });
  });

  it('should return different values for different people', function(done) {
    function makeRequest(token, user, callback) {
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

        assert.strictEqual(body.login, user);
        callback();
      }, request);
    }

    makeRequest(process.env.GITHUB_TOKEN_1, 'gitterawesome', function() {
      makeRequest(process.env.GITHUB_TOKEN_2, 'gittertestbot', function() {
        makeRequest(process.env.GITHUB_TOKEN_1, 'gitterawesome', function() {
          makeRequest(process.env.GITHUB_TOKEN_2, 'gittertestbot', function() {
            done();
          });
        });
      });
    });

  });


});
