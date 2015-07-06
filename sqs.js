'use strict'

var EE = require('events').EventEmitter
var inherits = require('util').inherits
var xtend = require('xtend')
var assert = require('assert')
var fastfall = require('fastfall')
var fastparallel = require('fastparallel')
var LRU = require('lru-cache')
var defaults = {
  MaxNumberOfMessages: 1,
  VisibilityTimeout: 60 * 5,  // number of seconds before the message goes back to the queue
  WaitTimeSeconds: 20,
  wait: 2000
}

function SQS (sdk) {
  if (!(this instanceof SQS)) {
    return new SQS(sdk)
  }

  assert(sdk, 'missing AWS SQS object')

  this.sdk = sdk

  this.stopping = false
  this.stopped = false
  this._nameCache = new LRU({
    max: 500,
    maxAge: 1000 * 60 * 60
  })
}

inherits(SQS, EE)

SQS.prototype._getQueueUrl = function (queue, done) {
  var queueUrl = this._nameCache.get(queue)
  var that = this

  if (queueUrl) {
    // non-standard callback, we handle the errors
    // internally
    return done(queueUrl)
  }

  this.sdk.getQueueUrl({
    QueueName: queue
  }, function (err, result) {
    if (err) {
      return that.emit('error', err)
    }

    return done(result.QueueUrl)
  })
}

SQS.prototype.pull = function (queue, opts, func) {
  var that = this

  if (typeof opts === 'function') {
    func = opts
    opts = null
  }

  assert(queue, 'missing Queue')
  assert(func, 'missing worker function')

  opts = xtend(defaults, opts)

  var parallel = fastparallel()

  var processFall = fastfall([
    parseJson,
    func,
    deleteMessage
  ])

  var raw = opts.raw
  var wait = opts.wait

  delete opts.raw
  delete opts.wait

  this._getQueueUrl(queue, function (queueUrl) {
    opts.QueueUrl = queueUrl
    receiveMessages()
  })

  function receiveMessages () {
    console.log('receiveMessages')
    that.sdk.receiveMessage(opts, onMessages)
  }

  function onMessages (err, results) {
    if (err) {
      return that.emit('error', err)
    }

    parallel(that, processMessage, results.Messages || [], scheduleReceive)
  }

  function scheduleReceive () {
    if (that.stopping) {
      that.stopped = true
      that.emit('end')
      return
    }

    setTimeout(receiveMessages, wait)
  }

  function deleteMessage (done) {
    return that.sdk.deleteMessage({
      QueueUrl: opts.QueueUrl,
      ReceiptHandle: this.ReceiptHandle
    }, done)
  }

  function processMessage (message, done) {
    processFall.call(message, function (err) {
      if (err) {
        // do not delete the message
        that.emit('errorProcessing', err)
      }

      done()
    })
  }

  function parseJson (done) {
    var body

    try {
      body = raw ? this.Body : JSON.parse(this.Body)
    } catch (err) {
      return done(err)
    }

    done(null, body)
  }
}

SQS.prototype.push = function (queue, msg, done) {
  var that = this
  this._getQueueUrl(queue, function (queueUrl) {
    that.sdk.sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(msg)
    }, done || function (err) {
      if (err) {
        that.emit('error', err)
      }
    })
  })
}

SQS.prototype.stop = function (done) {
  done = done || noop

  if (this.stopped) {
    return done()
  }

  this.on('end', done)
  this.on('error', done)

  this.stopping = true
}

function noop () {}

module.exports = SQS
