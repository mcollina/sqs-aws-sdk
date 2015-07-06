'use strict'

var test = require('tape')
var sqs = require('./')
var AWS = require('aws-sdk')
var series = require('fastseries')()

require('dotenv').load()

var awsOptions = {}

// override any .aws/credentials
if (process.env.AWS_ACCESS_KEY_ID) {
  awsOptions.accessKeyId = process.env.AWS_ACCESS_KEY_ID
  awsOptions.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  awsOptions.region = process.env.AWS_REGION
}

var sdk = new AWS.SQS(awsOptions)

test('clear queue', function (t) {
  t.plan(1)
  t.timeoutAfter(30000)

  var queue = sqs(sdk)
  var timer

  queue.pull(process.env.SQS_QUEUE, {
    wait: 0,
    WaitTimeSeconds: 0,
    MaxNumberOfMessages: 10
  }, function (message, done) {
    console.log('clearing', message)
    close()
    done()
  })

  close()

  function close () {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(function () {
      queue.stop(t.notOk.bind(t))
    }, 2000)
  }
})

test('push and pull', function (t) {
  t.plan(3)
  t.timeoutAfter(2000)

  var queue = sqs(sdk)
  var expected = {
    hello: 'world'
  }

  queue.push(process.env.SQS_QUEUE, expected, function (err) {
    t.error(err, 'no error')
  })

  queue.on('errorProcessing', console.log)

  queue.pull(process.env.SQS_QUEUE, function (message, done) {
    queue.stop(t.notOk.bind(t))
    t.deepEqual(message, expected, 'message matches')
    done()
  })
})

test('push and pull multiple times', function (t) {
  t.plan(5)
  t.timeoutAfter(30000)

  var queue = sqs(sdk)
  var expected = [{
    hello: 'world1'
  }, {
    hello: 'world2'
  }, {
    hello: 'world3'
  }]

  series(queue, function (msg, done) {
    this.push(process.env.SQS_QUEUE, msg, done)
  }, [].concat(expected), function (err) {
    t.error(err, 'no error')
  })

  queue.on('errorProcessing', console.log)

  queue.pull(process.env.SQS_QUEUE, {
    wait: 0,
    WaitTimeSeconds: 0
  }, function (message, done) {
    t.deepEqual(message, expected.shift(), 'message matches')

    if (expected.length === 0) {
      queue.stop(t.notOk.bind(t))
    }

    done()
  })
})
