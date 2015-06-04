'use strict';

var snappy = require('snappy');

function SnappyCompressor() {
}

SnappyCompressor.prototype = {
  compress: function(buffer, callback) {
    snappy.compress(buffer, callback);
  },

  decompress: function(buffer, callback) {
    snappy.uncompress(buffer, { }, callback);
  }
};

module.exports = SnappyCompressor;
