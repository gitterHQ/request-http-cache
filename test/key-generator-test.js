var assert = require('assert');
var keyGenerator = require('../lib/key-generator');

describe('key-generator', function() {
  it('should generate keys for URLS without vary headers', function() {
    var k1 = keyGenerator('https://api.github.com/v1', null, null);
    var k2 = keyGenerator('https://api.github.com/v1', null, null);
    assert(k1);
    assert(k2);
    assert.strictEqual(k1, k2);

    var k3 = keyGenerator('https://api.github.com/v2', null, null);
    var k4 = keyGenerator('https://api.github.com/v2', null, null);
    assert(k3);
    assert(k4);
    assert.strictEqual(k3, k4);

    assert.notEqual(k1, k3);
  });

  it('should generate keys for URLS with vary headers with all headers set', function() {
    var k1 = keyGenerator('https://api.github.com/v1', { accept: 'application/json' }, 'Accept');
    var k2 = keyGenerator('https://api.github.com/v1', { accept: 'application/json' }, 'Accept');
    assert(k1);
    assert(k2);
    assert.strictEqual(k1, k2);

    var k3 = keyGenerator('https://api.github.com/v1', { accept: 'text/plain' }, 'Accept');
    var k4 = keyGenerator('https://api.github.com/v1', { accept: 'text/plain' }, 'Accept');
    assert(k3);
    assert(k4);
    assert.strictEqual(k3, k4);

    assert.notEqual(k1, k3);
  });

  it('should generate keys for URLS with vary headers with mutliple varies', function() {
    var k1 = keyGenerator('https://api.github.com/v1', { accept: 'application/json', authorization: 'x' }, 'Accept,Authorization');
    var k2 = keyGenerator('https://api.github.com/v1', { accept: 'application/json', authorization: 'x' }, 'Accept,Authorization');
    assert(k1);
    assert(k2);
    assert.strictEqual(k1, k2);

    // No auth header
    var k3 = keyGenerator('https://api.github.com/v1', { accept: 'application/json' }, 'Accept, Authorization');
    var k4 = keyGenerator('https://api.github.com/v1', { accept: 'application/json' }, 'Accept,Authorization');
    assert(k3);
    assert(k4);
    assert.strictEqual(k3, k4);

    assert.notEqual(k1, k3);
  });

  it('should handle empty-ish vary strings', function() {
    var k1 = keyGenerator('https://api.github.com/v1', { accept: 'application/json' }, ',');
    var k2 = keyGenerator('https://api.github.com/v1', { accept: 'text/plain' }, ',');
    assert(k1);
    assert(k2);
    assert.strictEqual(k1, k2);
  });

  it('should handle case insensitivity of request headers ', function() {
    var k1 = keyGenerator('https://api.github.com/v1', { accePT: 'application/json', authorization: 'x' }, 'aCCept,AuthorizaTIon');
    var k2 = keyGenerator('https://api.github.com/v1', { accept: 'application/json', AUthorizatioN: 'x' }, 'AccePT,authorizatioN');
    assert(k1);
    assert(k2);
    assert.strictEqual(k1, k2);

    // No auth header
    var k3 = keyGenerator('https://api.github.com/v1', { accept: 'application/json1' }, 'Accept, Authorization');
    var k4 = keyGenerator('https://api.github.com/v1', { aCCept: 'application/json1' }, 'Accept, Authorization');
    assert(k3);
    assert(k4);
    assert.strictEqual(k3, k4);

    assert.notEqual(k1, k3);
  });

  it('should treat missing fields and empty fields equally', function() {
    var k1 = keyGenerator('https://api.github.com/v1', { }, 'aCCept,AuthorizaTIon');
    var k2 = keyGenerator('https://api.github.com/v1', { accept: '' }, 'AccePT,authorizatioN');
    assert(k1);
    assert(k2);
    assert.strictEqual(k1, k2);
  });


});
