'use strict';

function NullCompressor() {
}

NullCompressor.prototype = {
  compress: function(buffer, callback) {
    callback(null, buffer);
  },

  decompress: function(buffer, callback) {
    callback(null, buffer);
  }
};

module.exports = NullCompressor;
