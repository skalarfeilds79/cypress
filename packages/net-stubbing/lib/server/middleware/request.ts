import _ from 'lodash'
import { concatStream } from '@packages/network'
import url from 'url'

import type {
  RequestMiddleware,
} from '@packages/proxy'
import {
  CyHttpMessages,
  SERIALIZABLE_REQ_PROPS,
} from '../../types'
import { getRoutesForRequest, matchesRoutePreflight } from '../route-matching'
import {
  sendStaticResponse,
  setDefaultHeaders,
  mergeDeletedHeaders,
  mergeWithPreservedBuffers,
  getBodyEncoding,
} from '../util'
import { InterceptedRequest } from '../intercepted-request'

// do not use a debug namespace in this file - use the per-request `this.debug` instead
// available as cypress-verbose:proxy:http
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debug = null

export const SetMatchingRoutes: RequestMiddleware = async function () {
  if (matchesRoutePreflight(this.netStubbingState.routes, this.req)) {
    // send positive CORS preflight response
    return sendStaticResponse(this, {
      statusCode: 204,
      headers: {
        'access-control-max-age': '-1',
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': this.req.headers.origin || '*',
        'access-control-allow-methods': this.req.headers['access-control-request-method'] || '*',
        'access-control-allow-headers': this.req.headers['access-control-request-headers'] || '*',
      },
    })
  }

  this.req.matchingRoutes = [...getRoutesForRequest(this.netStubbingState.routes, this.req)]

  this.next()
}

/**
 * Called when a new request is received in the proxy layer.
 */
export const InterceptRequest: RequestMiddleware = async function () {
  if (!this.req.matchingRoutes?.length) {
    // not intercepted, carry on normally...
    return this.next()
  }

  const request = new InterceptedRequest({
    continueRequest: this.next,
    onError: this.onError,
    onResponse: (incomingRes, resStream) => {
      setDefaultHeaders(this.req, incomingRes)
      this.onResponse(incomingRes, resStream)
    },
    req: this.req,
    res: this.res,
    socket: this.socket,
    state: this.netStubbingState,
  })

  this.debug('cy.intercept: intercepting request')

  // attach requestId to the original req object for later use
  this.req.requestId = request.id

  this.netStubbingState.requests[request.id] = request

  const req = _.extend(_.pick(request.req, SERIALIZABLE_REQ_PROPS), {
    url: request.req.proxiedUrl,
  }) as CyHttpMessages.IncomingRequest

  request.res.once('finish', async () => {
    request.handleSubscriptions<CyHttpMessages.ResponseComplete>({
      eventName: 'after:response',
      data: request.includeBodyInAfterResponse ? {
        finalResBody: request.res.body!,
      } : {},
      mergeChanges: _.noop,
    })

    this.debug('cy.intercept: request/response finished, cleaning up')
    delete this.netStubbingState.requests[request.id]
  })

  const ensureBody = () => {
    return new Promise<void>((resolve) => {
      if (req.body) {
        return resolve()
      }

      const onClose = (): void => {
        req.body = ''

        return resolve()
      }

      // If the response has been destroyed we won't be able to get the body from the stream.
      if (request.res.destroyed) {
        onClose()
      }

      // Also listen the response close in case it happens while we are piping the request stream.
      request.res.once('close', onClose)

      request.req.pipe(concatStream((reqBody) => {
        req.body = reqBody
        request.res.off('close', onClose)
        resolve()
      }))
    })
  }

  await ensureBody()

  if (!_.isString(req.body) && !_.isBuffer(req.body)) {
    throw new Error('req.body must be a string or a Buffer')
  }

  const bodyEncoding = getBodyEncoding(req)
  const bodyIsBinary = bodyEncoding === 'binary'

  if (bodyIsBinary) {
    this.debug('cy.intercept: req.body contained non-utf8 characters, treating as binary content')
  }

  // leave the requests that send a binary buffer unchanged
  // but we can work with the "normal" string requests
  if (!bodyIsBinary) {
    req.body = req.body.toString('utf8')
  }

  request.req.body = req.body

  const mergeChanges = (before: CyHttpMessages.IncomingRequest, after: CyHttpMessages.IncomingRequest) => {
    if (before.headers['content-length'] === after.headers['content-length']) {
      // user did not purposely override content-length, let's set it
      after.headers['content-length'] = String(Buffer.from(after.body).byteLength)
    }

    // resolve and propagate any changes to the URL
    request.req.proxiedUrl = after.url = url.resolve(request.req.proxiedUrl, after.url)

    mergeWithPreservedBuffers(before, _.pick(after, SERIALIZABLE_REQ_PROPS))

    mergeDeletedHeaders(before, after)
  }

  const modifiedReq = await request.handleSubscriptions<CyHttpMessages.IncomingRequest>({
    eventName: 'before:request',
    data: req,
    mergeChanges,
  })

  mergeChanges(req, modifiedReq)
  // @ts-ignore
  mergeChanges(request.req, req)

  if (request.responseSent) {
    // request has been fulfilled with a response already, do not send the request outgoing
    // @see https://github.com/cypress-io/cypress/issues/15841
    return this.end()
  }

  return request.continueRequest()
}
