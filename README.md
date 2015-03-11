# request-http-cache

[![Build Status](https://travis-ci.org/gitterHQ/request-http-cache.svg?branch=master)](https://travis-ci.org/gitterHQ/request-http-cache) [![Coverage Status](https://coveralls.io/repos/gitterHQ/request-http-cache/badge.svg)](https://coveralls.io/r/gitterHQ/request-http-cache)

A request "middleware" for caching HTTP responses in-memory or in Redis. Specifically built for
Gitter's communications with GitHub.

```
npm install request-http-cache
```

## About

This module is intended for use with [request-extensible](https://github.com/suprememoocow/request-extensible).

It is designed to honor the HTTP caching semantics used by the GitHub API and use
Conditional Requests, using ETags, for stale responses while correctly handling Vary headers.

## Using

### Using with an in-memory Backend

```javascript
var requestExt = require('request-extensible');
var RequestHttpCache = require('request-http-cache');

var httpRequestCache = new RequestHttpCache({
  max: 1024*1024 // Maximum cache size (1mb) defaults to 512Kb
});

var request = requestExt({
  extensions: [
    httpRequestCache.extension
  ]
});

// Now use request as you would request/request
request({ url: 'https://api.github.com/users/suprememoocow' }, function(err, response, body) {

});
```

### Using with a Redis Backend

When using with a Redis backend, it's highly recommended to use `maxmemory` and
`maxmemory-policy` configurations to ensure that the Redis memory usage doesn't
grow out of control.

```javascript
var requestExt = require('request-extensible');
var RequestHttpCache = require('request-http-cache');

var httpRequestCache = new RequestHttpCache({
  backend: 'redis',
  redis: {
    host: "localhost",
    port: 6379
  },
  redisClient: redisClient, // Or you can pass in your Redis client
  ttl: 86400                // Maximum cached response time
});

var request = requestExt({
  extensions: [
    httpRequestCache.extension
  ]
});

// Now use request as you would request/request
request({ url: 'https://api.github.com/users/suprememoocow' }, function(err, response, body) {

});

```

# Licence
```
License
The MIT License (MIT)

Copyright (c) 2015, Troupe Technology Limited

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
