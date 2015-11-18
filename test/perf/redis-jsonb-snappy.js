var speedy = require('speedy');

var RequestHttpCache = require('../..');
var request = require('request');

var httpRequestCache = new RequestHttpCache({
  backend: 'redis',
  compressor: require('request-http-cache-snappy-compressor'), 
  redisPrefix: 'hc:' + Date.now() + ":"
});


function makeRequest(token, callback) {
  httpRequestCache.extension({
    method: 'GET',
    url: 'https://api.github.com/user/repos?per_page=100',
    headers: {
      Authorization: 'token ' + token,
      'User-Agent': 'request-http-cache-test/1.0',
    },
    json: true
  }, callback, request);
}

makeRequest(process.env.GITHUB_TOKEN_1, function() {
  setTimeout(function() {
    speedy.run(function(done) {
      makeRequest(process.env.GITHUB_TOKEN_1, done);
    });
  }, 500);
});
