# sqs-aws-sdk&nbsp;&nbsp;[![Build Status](https://travis-ci.org/mcollina/sqs-aws-sdk.png)](https://travis-ci.org/mcollina/sqs-aws-sdk)

A message queue using [Amazon Simple Queue
Service](http://docs.amazonwebservices.com/AWSSimpleQueueService/latest/APIReference/Welcome.html) using the AWS SDK.
This module has the same interface of [sqs](http://npm.im/sqs), but uses
the [AWS SDK](http://npm.im/aws-sdk) instead of a custom API wrapper.

## Install

```
npm install sqs-aws-sdk
```

## Usage

```js
var AWS = require('aws-sdk')

// see the AWS SQS in how to configure it
var sdk = new AWS.SQS()

var sqs = require('sqs-aws-sdk')

var queue = sqs(sdk)

// push some data to the test queue
queue.push('test', {
  some:'somedata'
})

// pull messages from the test queue
queue.pull('test', function(message, callback) {
  console.log('someone pushed', message)
  callback()  // we are done with this message - pull a new one
              // callbackling the callback will also delete the message
              // from the queue

  queue.stop() // stops the queue for receiving any other messages
})
```

## API

### sqs(sdk)


Create a queue instance

```js
var queue = sqs(sdk)
```

### queue.push(name, message, callback)

```js
queue.push(name, message)
```

Push a new message to the queue defined by name.

The queue needs to exits.


### queue.pull(name, [opts], onMessage)

Pull messages from the queue defined by name.

The pull flow is as follows:

1. A message is pulled and is passed to `onMessage(message, callback)`
2. You process the message
3. Call `callback` when you are done and the message will be deleted
   from the queue.
4. Goto 1

If for some reason the callback is not called amazon sqs will re-add the
message to the queue after 5 minutes.

The options include all the options accepted by the aws-sdk
[receiveMessage](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#receiveMessage-property), plus:

* `wait`: the number of seconds to wait between every loop round
* `workers`: the number of calls to be done to SQS in parallel
* `raw`: if you do not want the message to be parsed as JSON

## Fault tolerance

Both `pull` and `push` will retry multiple times if a network error
occurs or if amazon sqs is temporary unavailable.

## Acknowledgements

This project was kindly sponsored by [nearForm](http://nearform.com).
It was extracted from [aws-autoscaling-container](http://npm.im/aws-autoscaling-container).

[@mafintosh](http://github.com/mafintosh) for its awesome
[sqs](http://npm.im/sqs) module. Part of the doc was borrowed from that
module, and also for the API contract.

[@Nss](http://github.com) for its work on the nScale
[aws-autoscaling-container](http://npm.im/aws-autoscaling-container).

## License

MIT
