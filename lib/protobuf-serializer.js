'use strict';
var fs = require('fs');
var Schema = require('protobuf').Schema;
var debug = require('debug')('http-cache:protobuf');
var schema = new Schema(fs.readFileSync(__dirname + '/http-cache-message.desc'));
var HttpCacheMessage = schema['gitter.http.cache.HttpCacheMessage'];

function ProtobufSerializer() {
}

ProtobufSerializer.prototype = {
  serialize: function(statusCode, bodyCompressed, headers) {
    debug("serialize started");
    var result = HttpCacheMessage.serialize({
      statusCode: statusCode,
      bodyCompressed: bodyCompressed,
      headers: Object.keys(headers).map(function(name) {
        return { name: name, value: headers[name] };
      })
    });

    debug("serialize finished");
    return result;
  },

  deserialize: function(buffer) {
    debug("deserialize started");
    var proto = HttpCacheMessage.parse(buffer);

    /* Convert the headers back */
    proto.headers = proto.headers.reduce(function(memo, header) {
      memo[header.name] = header.value;
      return memo;
    }, { });

    debug("deserialize finished");
    return proto;
  },
};

module.exports = ProtobufSerializer;
