'use strict'

var debug = require('debug')('sqs')
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
  wait: 2000,
  workers: 1,
  maxErrors: 42
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

  this._workers = 0

  EE.call(this)
  this.on('workerEnded', function () {
    if (--this._workers === 0) {
      this.stopped = true
      this.emit('end')
    }
    debug('workerEnded', this._workers)
  })
}

inherits(SQS, EE)

SQS.prototype._getQueueUrl = function (queue, done, errors) {
  var queueUrl = this._nameCache.get(queue)
  var that = this

  errors = errors === undefined ? 0 : errors

  if (queueUrl) {
    debug('cached queue url', queueUrl)
    // non-standard callback, we handle the errors
    // internally
    return done(queueUrl)
  }

  this.sdk.getQueueUrl({
    QueueName: queue
  }, function (err, result) {
    if (err) {
      if (++errors > 42) {
        return that.emit('error', err)
      } else {
        debug('error, retry', err)
        return setTimeout(function () {
          that._getQueueUrl(queue, done, errors)
        }, 1000)
      }
    }

    debug('fetched queue url', result.QueueUrl)

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
  var workers = opts.workers
  var maxErrors = opts.maxErrors
  var errors = 0

  delete opts.raw
  delete opts.wait
  delete opts.workers
  delete opts.maxErrors

  this._getQueueUrl(queue, function (queueUrl) {
    opts.QueueUrl = queueUrl

    for (var i = 0; i < workers; i++) {
      that._workers++
      receiveMessages()
    }
  })

  function receiveMessages () {
    debug('receiveMessages')
    that.sdk.receiveMessage(opts, onMessages)
  }

  function onMessages (err, results) {
    if (err) {
      return errorAndRetry(err)
    }

    errors = 0
    parallel(that, processMessage, results.Messages || [], scheduleReceive)
  }

  function scheduleReceive () {
    if (that.stopping) {
      that.emit('workerEnded')
      return
    }

    debug('scheduling receive in', wait)

    setTimeout(receiveMessages, wait)
  }

  function deleteMessage (done) {
    debug('deleting message')
    that.sdk.deleteMessage({
      QueueUrl: opts.QueueUrl,
      ReceiptHandle: this.ReceiptHandle
    }, done)
  }

  function processMessage (message, done) {
    debug('processing message')
    processFall.call(message, function (err) {
      if (err) {
        // the message is not deleted log it
        that.emit('errorProcessing', err)
      }

      debug('message processed', err)

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

  function errorAndRetry (err) {
    if (!err) {
      return false
    }

    errors++

    if (errors === maxErrors) {
      that.emit('error', err)
    } else {
      debug('error, retry', err)
      scheduleReceive()
    }

    return true
  }
}

SQS.prototype.push = function (queue, msg, done, errors) {
  var that = this
  errors = errors === undefined ? 0 : errors
  this._getQueueUrl(queue, function (queueUrl) {
    that.sdk.sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(msg)
    }, function (err) {
      if (err) {
        errors++

        if (errors > 42) {
          if (done) {
            done(err)
          } else {
            that.emit('error', err)
          }
        } else {
          setTimeout(function () {
            that.push(queue, msg, done, errors)
          }, defaults.wait)
        }
      } else {
        done()
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
