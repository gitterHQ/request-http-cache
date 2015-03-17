'use strict';

/** Just a mocked out copy of https://github.com/sivy/node-statsd */
function nullFn() {}

module.exports = ['timing', 'increment', 'decrement',
'histogram', 'gauge', 'set', 'unique']
  .reduce(function(memo, key) {
    memo[key] = nullFn;
    return memo;
  }, {});
