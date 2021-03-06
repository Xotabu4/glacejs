"use strict";
/**
 * Contains hacks for test run.
 *
 * @module
 */

var Mocha = require("mocha");
var Pending = require("mocha/lib/pending");

var logger = require("./logger");
/**
 * Patches original `Mocha.Runner.prototype.uncaught` in order to skip
 * exceptions from proxy server `res.send()`.
 *
 * @function
 */
module.exports.suppressUncaught = () => {
    Mocha.Runner.prototype.uncaught = function (err) {
        logger.error("UNCAUGHT EXCEPTION", err);
        return;
    };
};
/**
 * Mocha runner.
 *
 * @type {Runner}
 */
var _mochaRunner;
(grep => {
    Mocha.Runner.prototype.grep = function() {
        _mochaRunner = this;
        return grep.apply(this, arguments);
    };
})(Mocha.Runner.prototype.grep);
/**
 * Gets mocha runner.
 *
 * @function
 */
module.exports.getRunner = () => _mochaRunner;

/**
 * Patches mocha runner to allow multiple independent `after`-calls.
 */
Mocha.Runner.prototype.hook = function (name, fn) {
  var suite = this.suite;
  var hooks = suite['_' + name];
  var self = this;

  function next (i) {
    var hook = hooks[i];
    if (!hook) {
      return fn();
    }
    self.currentRunnable = hook;

    hook.ctx.currentTest = self.test;

    self.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.on('error', function (err) {
        self.failHook(hook, err);
      });
    }

    hook.run(function (err) {
      var testError = hook.error();
      if (testError) {
        self.fail(self.test, testError);
      }
      if (err) {
        if (err instanceof Pending) {
          if (name === 'beforeEach' || name === 'afterEach') {
            self.test.pending = true;
          } else {
            utils.forEach(suite.tests, function (test) {
              test.pending = true;
            });
            // a pending hook won't be executed twice.
            hook.pending = true;
          }
        } else {
          self.failHook(hook, err);
          // stop executing hooks, notify callee of hook err
          if (!name.startsWith("after")) return fn(err);
        }
      }
      self.emit('hook end', hook);
      delete hook.ctx.currentTest;
      next(++i);
    });
  }

  Mocha.Runner.immediately(function () {
    next(0);
  });
};