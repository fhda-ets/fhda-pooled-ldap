/**
 * Copyright (c) 2016, Foothill-De Anza Community College District
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation and/or
 * other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 * may be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
 * OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';
let EventEmitter = require('events');

/**
 * Tiny utility class to provide generic, subscriber-style logging services for
 * packages designed to be imported into other application projects.
 * <br/><br/>
 * Rather than include a massive logging dependency in package.json, this allows
 * a developer to selectively listen for important package events at the
 * application-level, and log them if desired. Because there will be a difference
 * in time between when a package is loaded and firing events, and
 * when an application is actually ready to listen for those events, an internal
 * circular buffer of up to 100 events is kept. When, and if, a listener is added 
 * by the application then the buffer is drained and bypassed.
 * <br/><br/>
 * Loosely inspired by how Java dependencies reference the sl4j API as a generic
 * logging interface, but never actually reference an entire logging library.
 * 
 * @class EventLogger
 * @extends {EventEmitter}
 */
class EventLogger extends EventEmitter {

    constructor() {
        super();

        // Create an internal buffer for events
        this.eventBuffer = [];

        // Watch for when new listeners are added
        this.on('newListener', (eventName, listenerFn) => {
            // Did the developer add a log listener?
            // Are any events waiting?
            if(eventName === 'log' && this.eventBuffer.length > 0) {
                // Empty the buffer from oldest to newest and re-emit each event 
                // to the registered listeners
                for(let item = this.eventBuffer.shift(); item; item = this.eventBuffer.shift()) {
                    // Dispatch event to listener
                    listenerFn(...item);
                }
            }
        });

        // Map original emit function with an alternate name
        this._emit = this.emit;

        // Override emit with an different implementation
        this.emit = (eventName, ...args) => {
            if(eventName === 'log') {
                // If we already have listeners, then emit the event as expected
                if(this.listenerCount(eventName) > 0) {
                    return this._emit(eventName, ...args);
                }

                // Does the buffer need to be capped?
                if(this.eventBuffer.length > 99) {
                    // Remove the oldest element
                    this.eventBuffer.shift();
                }
                
                // Add event to the end of the buffer
                return this.eventBuffer.push(args);   
            }
            return this._emit(eventName, ...args);
        };
    }

    get bufferSize() {
        return this.eventBuffer.length;
    }

    /**
     * Helper function to emit a log event
     * @param {String} message The log message
     * @param {Object} metadata Related metadata (if any)
     */
    log(message, metadata) {
        this._emit('log', message, metadata);
    }

}

module.exports = new EventLogger();