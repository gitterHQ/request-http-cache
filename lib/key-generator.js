'use strict';

var crypto = require('crypto');
var debug = require('debug')('http-cache:keys');

function generateKeyHash(headers, varyHeader) {
  debug("generateKeyHash %j %s", headers, varyHeader);
  if (!varyHeader) return { };

  var varySplit = varyHeader.toLowerCase().split(/,\s*/);
  if (!varySplit.length) return { };

  var lcHeaders;
  if (headers) {
    lcHeaders = Object.keys(headers).reduce(function(memo, key) {
      memo[String(key).toLowerCase()] = headers[key];
      return memo;
    }, {});
  } else {
    lcHeaders = {};
  }

  varySplit.sort(); // Always keep the list in alphabetical order

  return varySplit.reduce(function(memo, vary) {
      memo[vary] = lcHeaders[vary] || '';
      return memo;
    }, {});
}

function hashKeyString(s) {
  var shasum = crypto.createHash('sha1');
  shasum.update(s);
  return shasum.digest('hex');
}

module.exports = function(url, headers, varyHeader) {
  var hash = generateKeyHash(headers, varyHeader);
  return "" + hashKeyString(JSON.stringify(hash)) + ":" + url;
};
