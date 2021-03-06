'use strict';

/* global MockEventTarget */

(function(exports) {
  /**
   * This is an reimplementation of DOMRequest in JavaScript,
   * usable as a mock for tests.
   *
   * See https://developer.mozilla.org/en-US/docs/Web/API/DOMRequest
   * and http://dxr.mozilla.org/mozilla-central/source/dom/base/DOMRequest.h
   * for the simulated real APIs.
   *
   * There are two additional methods (fireSuccess() and fireError()) for
   * explicitly invoking success/error in test script.
   *
   * @class MockDOMRequest
   * @requires MockEventTarget
   *
   */
  var MockDOMRequest = function MockDOMRequest() {
    this._promise = null;
  };

  MockDOMRequest.prototype = new MockEventTarget();

  /**
   * The operation's result.
   * @memberof MockDOMRequest.prototype
   * @type {Mixed}
   */
  MockDOMRequest.prototype.result = undefined;

  /**
   * Error information, if any.
   * @type {Mixed}
   */
  MockDOMRequest.prototype.error = undefined;

  /**
   * A callback handler called when the operation represented by the
   * DOMRequest is completed.
   * @memberof MockDOMRequest.prototype
   * @type {Function}
   */
  MockDOMRequest.prototype.onsuccess = null;

  /**
   * A callback handler that gets called when an error occurs while processing
   * the operation.
   * @memberof MockDOMRequest.prototype
   * @type {Function}
   */
  MockDOMRequest.prototype.onerror = null;

  /**
   * A string indicating whether or not the operation is finished running.
   * Its value is either "done" or "pending".
   * @memberof MockDOMRequest.prototype
   * @type {String}
   */
  MockDOMRequest.prototype.readyState = 'pending';

  /**
   * Fire success event with result given.
   * @memberof MockDOMRequest.prototype
   * @param  {Mixed} result The result.
   */
  MockDOMRequest.prototype.fireSuccess = function(result) {
    if (this.readyState === 'done') {
      throw 'The DOMRequest instance has already fired.';
    }
    this.readyState = 'done';
    this.result = result;

    // Fake event that only implements two properties.
    // I am not interested in writing MockDOMEvent :-/
    var evt = {
      type: 'success'
    };

    this.dispatchEvent(evt);

    // Remove callbacks since we will never file them again.
    this._captureCallbacks = [];
    this._bubbleCallbacks = [];

    this._getInternalPromise().resolve(result);
  };

  /**
   * Fire error event with error given.
   * @memberof MockDOMRequest.prototype
   * @param  {Mixed} error The error.
   */
  MockDOMRequest.prototype.fireError = function(error) {
    if (this.readyState === 'done') {
      throw 'The DOMRequest instance has already fired.';
    }
    this.readyState = 'done';
    this.error = error;

    // Fake event that only implements two properties.
    // I am not interested in writing MockDOMEvent :-/
    var evt = {
      type: 'error'
    };

    this.dispatchEvent(evt);

    // Remove callbacks since we will never file them again.
    this._captureCallbacks = [];
    this._bubbleCallbacks = [];

    this._getInternalPromise().reject(error);
  };

  /**
   * The then-able interface of DOMRequest. See bug 839838 for real impl.
   * @returns {Mixed} A Promise instance returned by the then() method.
   */
  MockDOMRequest.prototype.then = function(fulfillCallback, rejectCallback) {
    return this._getInternalPromise().then(fulfillCallback, rejectCallback);
  };

  /**
   * Get the internal promise instance. Internal only.
   * Create the instance when being required for the first time.
   * @returns {Mixed} A Promise instance.
   */
  MockDOMRequest.prototype._getInternalPromise = function() {
    if (this._promise) {
      return this._promise;
    }

    var oResolve, oReject;
    var p = this._promise = new Promise(function(resolve, reject) {
      oResolve = resolve;
      oReject = reject;
    });

    p.resolve = oResolve;
    p.reject = oReject;

    return p;
  };

  exports.MockDOMRequest = MockDOMRequest;
}(window));
