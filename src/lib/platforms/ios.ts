import { v4 as uuid } from 'uuid'

import {
  Bridge,
  BridgeSendBotEventParams,
  BridgeSendClientEventParams,
  BridgeSendEventParams,
  EventEmitterCallback,
} from '../../types'
import { camelCaseToSnakeCase, snakeCaseToCamelCase } from '../case'
import { EVENT_TYPE, HANDLER, RESPONSE_TIMEOUT, WEB_COMMAND_TYPE_RPC } from '../constants'
import ExtendedEventEmitter from '../eventEmitter'
import log from '../logger'

class IosBridge implements Bridge {
  private readonly eventEmitter: ExtendedEventEmitter
  private readonly hasCommunicationObject: boolean
  logsEnabled: boolean
  isRenameParamsEnabled: boolean

  constructor() {
    this.hasCommunicationObject =
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.express &&
      !!window.webkit.messageHandlers.express.postMessage
    this.eventEmitter = new ExtendedEventEmitter()
    this.logsEnabled = false
    this.isRenameParamsEnabled = true

    if (!this.hasCommunicationObject) {
      log('No method "express.postMessage", cannot send message to iOS')
      return
    }

    // Expect json data as string
    window.handleIosEvent = ({
                               ref,
                               data,
                               files,
                             }: {
      readonly ref: string
      readonly data: {
        readonly type: string
      }
      readonly files: any
    }): void => {
      if (this.logsEnabled)
        console.log(
          'Bridge ~ Incoming event',
          JSON.stringify(
            {
              ref,
              data,
              files,
            },
            null,
            2
          )
        )

      const { type, ...payload } = data

      const emitterType = ref || EVENT_TYPE.RECEIVE

      const eventFiles = this.isRenameParamsEnabled ?
        files?.map((file: any) => snakeCaseToCamelCase(file)) : files

      const event = {
        ref,
        type,
        payload: this.isRenameParamsEnabled ? snakeCaseToCamelCase(payload) : payload,
        files: eventFiles,
      }

      this.eventEmitter.emit(emitterType, event)
    }
  }

  /**
   * Set callback function to handle events without **ref**
   * (notifications for example).
   *
   * ```js
   * bridge.onRecieve(({ type, handler, payload }) => {
   *   // Handle event data
   *   console.log('event', type, handler, payload)
   * })
   * ```
   * @param callback - Callback function.
   */
  onReceive(callback: EventEmitterCallback) {
    this.eventEmitter.on(EVENT_TYPE.RECEIVE, callback)
  }

  protected sendEvent({
                        handler,
                        method,
                        params,
                        files,
                        timeout = RESPONSE_TIMEOUT,
                        guaranteed_delivery_required = false,
                      }: BridgeSendEventParams) {
    if (!this.hasCommunicationObject) return Promise.reject()

    const ref = uuid() // UUID to detect express response.
    const eventProps = {
      ref,
      type: WEB_COMMAND_TYPE_RPC,
      method,
      handler,
      payload: this.isRenameParamsEnabled ? camelCaseToSnakeCase(params) : params,
      guaranteed_delivery_required,
    }

    const eventFiles = this.isRenameParamsEnabled ?
      files?.map((file: any) => camelCaseToSnakeCase(file)) : files

    const event = files ? { ...eventProps, files: eventFiles } : eventProps

    if (this.logsEnabled) console.log('Bridge ~ Outgoing event', JSON.stringify(event, null, '  '))

    window.webkit.messageHandlers.express.postMessage(event)

    return this.eventEmitter.onceWithTimeout(ref, timeout)
  }

  /**
   * Send event and wait response from express client.
   *
   * ```js
   * bridge
   *   .sendBotEvent(
   *     {
   *       method: 'get_weather',
   *       params: {
   *         city: 'Moscow',
   *       },
   *       files: []
   *     }
   *   )
   *   .then(data => {
   *     // Handle response
   *     console.log('response', data)
   *   })
   * ```
   * @param method - Event type.
   * @param params
   * @param files
   * @param timeout - Timeout in ms.
   * @param guaranteed_delivery_required - boolean.
   */
  sendBotEvent({
                 method,
                 params,
                 files,
                 timeout = RESPONSE_TIMEOUT,
                 guaranteed_delivery_required,
               }: BridgeSendBotEventParams) {
    return this.sendEvent({ handler: HANDLER.BOTX, method, params, files, timeout, guaranteed_delivery_required })
  }

  /**
   * Send event and wait response from express client.
   *
   * ```js
   * bridge
   *   .sendClientEvent(
   *     {
   *       type: 'get_weather',
   *       handler: 'express',
   *       payload: {
   *         city: 'Moscow',
   *       },
   *     }
   *   )
   *   .then(data => {
   *     // Handle response
   *     console.log('response', data)
   *   })
   * ```
   * @param method - Event type.
   * @param params
   * @param timeout - Timeout in ms.
   */
  sendClientEvent({ method, params, timeout = RESPONSE_TIMEOUT }: BridgeSendClientEventParams) {
    return this.sendEvent({ handler: HANDLER.EXPRESS, method, params, timeout })
  }

  /**
   * Enabling logs.
   *
   * ```js
   * bridge
   *   .enableLogs()
   * ```
   */
  enableLogs() {
    this.logsEnabled = true
  }

  /**
   * Disabling logs.
   *
   * ```js
   * bridge
   *   .disableLogs()
   * ```
   */
  disableLogs() {
    this.logsEnabled = false
  }

  /**
   * Enabling renaming event params from camelCase to snake_case and vice versa
   * ```js
   * bridge
   *    .enableRenameParams()
   * ```
   */
  enableRenameParams() {
    this.isRenameParamsEnabled = true
    console.log('Bridge ~ Enabled renaming event params from camelCase to snake_case and vice versa')
  }

  /**
   * Enabling renaming event params from camelCase to snake_case and vice versa
   * ```js
   * bridge
   *    .disableRenameParams()
   * ```
   */
  disableRenameParams() {
    this.isRenameParamsEnabled = false
    console.log('Bridge ~ Disabled renaming event params from camelCase to snake_case and vice versa')
  }
}

export default IosBridge
