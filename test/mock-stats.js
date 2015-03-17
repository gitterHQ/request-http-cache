'use strict';

module.exports = function() {

  var stats = ['timing', 'decrement',
  'histogram', 'gauge', 'set', 'unique']
    .reduce(function(memo, key) {
      memo[key] = function() {};
      return memo;
    }, {});


  stats.increment = function(k) {
    if (Array.isArray(k)) {
      k.forEach(function(i) { stats.increment(i); });
      return;
    }

    if (!this.incs[k]) {
      this.incs[k] = 1;
    } else {
      this.incs[k]++;
    }
  };


  stats.reset = function() {
    stats.incs = {};
  };

  stats.incs = {};


  return stats;

};
