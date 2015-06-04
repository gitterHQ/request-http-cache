'use strict';
var JSONB = require('json-buffer');

function JSONBSerializer() {
}

JSONBSerializer.prototype = {
  serialize: function(statusCode, bodyCompressed, headers) {
    var str = JSONB.stringify({
      statusCode: statusCode,
      bodyCompressed: bodyCompressed,
      headers: headers
    });

    return new Buffer(str, 'utf8');
  },

  deserialize: function(buffer) {
    return JSONB.parse(buffer.toString('utf8'));
  },
};

module.exports = JSONBSerializer;
