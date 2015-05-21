require('array.from');
var Promise = require('es6-promise');
var Immutable = require('immutable');
var fromJS = Immutable.fromJS;
var List = Immutable.List;
var Map = Immutable.Map;
var ev = require('event-emitter');
var keys = Object.keys || require('object-keys');

function getMessageData(message, id) {
  var pending = message.promise ? true : false;
  return {
    id: id,
    message: message,
    state: pending ? 'pending' : 'final'
  };
};

function makeHandlers(input) {
  var out = {};
  for (var key in input) {
    if (input.hasOwnProperty(key)) {
      out[key.toLowerCase()] = input[key];
    }
  }
  return out;
}

var Store = function(handlers) {
  this.data = this.getInitialState();
  this.messages = new List();
  this._handlers = makeHandlers(handlers);
  this._ev = new ev({});
};

Store.prototype.handleMessage = function handleMessage(_msg) {
  var oldData = this.data;
  this.data = getNextState(this.data, _msg);
  var message = getMessageData(_msg, this.messages.size);
  this.messages = this.messages.push(fromJS(message));
  if (_msg.promise) {
    this._bindPromise(message);
  }
  if (this.data !== oldData) {
    this._ev.emit('update', this.data);
  }
};

Store.prototype.on = function on(name, handler) {
  this._ev.on(name, handler);
};

Store.prototype.off = function off(name, handler) {
  this._ev.off(name, handler);
};

Store.prototype.getInitialState = function getInitialState() {
  return new Map();
}

Store.prototype._foldState = function _foldState(msgs, init) {
  return msgs.reduce(function(a, b) {
    return this._getNextState(a, b);
  }, init);
}

Store.prototype._getNextState = function _getNextState(state, msg) {
  if (!msg.type) {
    throw new Error('Message.type is required');
  }
  var verb = msg.type.toLowerCase();
  if (!this.handlers[verb]) {
    throw new Error('Unknown message type ' + verb +
      '. Please provide a valid message type.')
  }
  return this.handlers[verb](state, msg.payload);
};

Store.prototype._bindPromise = function _bindPromise(m) {
  var _this = this;
  m.message.promise.then(function() {
    // success
    _this._recalculate(_this.messages.setIn([m.id, 'state'], 'final'));
  }, function() {
    // failure
    _this._recalculate(_this.messages.remove(m.id));
  });
};

Store.prototype._recalculate = function _recalculate(messages) {
  var oldData = this.data;
  this.data = this._foldState(
    messages.toJS().map(function(d) {
      return d.message;
    }),
    this.getInitialState()
  );
  this.messages = messages;
  if (oldData !== this.data) {
    this._ev.emit('update', this.data);
  }
};

module.exports = Store;
