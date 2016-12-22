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
let Errors = require('./Errors');
let EventLogger = require('./EventLogger');
let Ldap = require('ldapjs');
let Pool = require('pool2');
let Promise = require('bluebird');
let OS = require('os');

/**
 * Sensible defaults for setting up the connection pool if none
 * are provided by the developer
 * @private
 */
let defaultPoolOptions = {
    idleTimeout: 60000 * 5,
    min: 0,
    max: OS.cpus().length,
    maxRequests: Infinity,
    requestTimeout: Infinity,
    syncTimeout: 30 * 1000
};

class PooledLdapConnection {

    /**
     * Create a new connection pool bound to the LDAP server described by the
     * provided URL.
     * @param {String} url ldap:// or ldaps:// URL to the target host
     * @param {String} bindDn DN or username of the user to perform an initial bind
     * @param {String} bindCredential Password for the initial bind
     * @param {Object} [tlsOptions=null] If using LDAPS, provide a standard Node.js tlsOptions object
     */
    constructor(url, bindDn, bindCredential, tlsOptions=null, poolOptions={}) {
        // Add parameter values to instance
        this.ldapUrl = url;
        this.ldapBindDn = bindDn;
        this.ldapBindCredential = bindCredential;
        this.ldapTlsOptions = tlsOptions;
        
        // Take the default pooling options, and apply any developer overrides
        let finalPoolOptions = Object.assign({}, defaultPoolOptions, poolOptions); 

        // Create, promisify, and configure an object pool for managing multiple client connections
        this.pool = Promise.promisifyAll(new Pool({

            // Pool behavior configuration
            idleTimeout: finalPoolOptions.idleTimeout,
            min: finalPoolOptions.min,
            max: finalPoolOptions.max,
            maxRequests: finalPoolOptions.maxRequests,
            requestTimeout: finalPoolOptions.requestTimeout,
            syncTimeout: finalPoolOptions.syncTimeout,

            acquire: function(callback) {
                // Create an LDAP client
                let client = Ldap.createClient({
                    url: url,
                    tlsOptions: tlsOptions
                });

                // Add configuration properties to client object
                client.config = {
                    url: url
                };

                // Attach an error handler to the client
                client.on('error', function(error) {
                    // Log
                    EventLogger.log(`Encountered a serious error on LDAP client for ${url}`, { error: error });

                    // Raise error up the stack to be dealt with
                    throw error;
                });

                // Attach an error handler to the client
                client.on('destroy', function() {
                    // Log
                    EventLogger.log(`Destroyed LDAP client connection ${url}`);
                });

                // Create an dispose function to take the LDAP connection out of the pool and disconnect it
                client.dispose = () => {
                    this.remove(client);
                };

                // Create an release function for putting the LDAP connection back into the pool
                client.release = () => {
                    EventLogger.log(`Releasing LDAP connection ${url} back to the connection pool`);
                    this.release(client);
                };

                // Bind using configured credential
                client.bind(
                    bindDn,
                    bindCredential,
                    error => {
                        EventLogger.log(`Created new LDAP connection ${url} for connection pool`);

                        // Notify pool that the newly connected client is ready
                        callback(error, client);
                    });

                // Create promisified 'add' function
                client.addAsync = Promise.promisify(client.add);

                // Create promisified 'bind' function
                client.bindAsync = Promise.promisify(client.bind);

                // Create promisified 'compare' function
                client.compareAsync = Promise.promisify(client.compare);

                // Create promisified 'del' function
                client.delAsync = Promise.promisify(client.del);

                // Create promisified 'exop' function
                client.exopAsync = Promise.promisify(client.exop);

                // Create promisified 'modify' function
                client.modifyAsync = Promise.promisify(client.modify);

                // Create promisified 'search' function
                client.searchAsync = Promise.promisify(client.search);
            },

            // Called when an LDAP client has become stale and should be removed from the pool
            dispose: function(ldapClient, callback) {                
                EventLogger.log(`Disposing of LDAP client connection ${ldapClient.config.url}`);

                // Destroy client
                ldapClient.destroy();
                callback();
            }

        }));
    }

    /**
     * Get an LDAP connection from the pool, and if necessary, creating a new
     * connection.
     * @returns {Promise} Resolved with a connection from the pool
     */
    acquire() {
        return this.pool.acquireAsync();
    }

    /**
     * Add an entry to the LDAP directory.
     * @param {String} dn Distinguished name for the new entry
     * @param {Object} attributes Key/values for the new attributes
     * @param {Control|Control[]} controls Optional LDAP controls to decorate the request
     * @returns {Promise} Resolved when add is complete
     */
    add(dn, attributes, controls) {
        return this
            .$performAsyncLdapOperation('addAsync', dn, attributes, controls)
            .tap(() => {
                EventLogger.log('Added new entry to LDAP', {
                    attributes: attributes,
                    controls: controls,
                    dn: dn,
                    url: this.ldapUrl
                });
            });
    }
    
    /**
     * Compare an entry in the LDAP with the given attribute and value
     * @param {String} dn Distinguished name for the new entry
     * @param {String} attribute Name of the attribute to compare
     * @param {any} value Value to be compared
     * @param {Control|Control[]} controls Optional LDAP controls to decorate the request
     * @returns {Promise} Resolved with result of the comparison
     */
    compare(dn, attribute, value, controls) {
        return this.$performAsyncLdapOperation('compareAsync', dn, attribute, value, controls);
    }
    
    /**
     * Change the password credential on an existing account in the LDAP directory.
     * @param {String} dn Distinguished name for the existing account
     * @param {String} credential New credential to assign
     * @param {String} [attributeName=userPassword] Optionally, specify the name of the password attribute in the directory (for example, Active Directory requires password writes on the unicodePwd attribute)
     * @param {String} [encodingType=null] Optionally, specify special encoding that the LDAP may require (for example 'msad' for Active Directory)
     * @returns {Promise} Resolved when the change is complete
     */
    changeCredential(dn, credential, attributeName='userPassword', encodingType=null) {
        return this.modifySimple(
            dn,
            ['replace', attributeName, this.encodeCredential(credential, encodingType)]);
    }

    /**
     * Utilty function to take a named operation and one or more attributes
     * expressed as an object, and convert it into an Ldapjs.Change object prior
     * to executing an LDAP entry modification.
     * @param {String} operation Type of modification: add|replace|delete
     * @param {Object} attributes Key/values for the new attributes
     * @returns {Change}
     * @private
     */
    createLdapChange(operation, attributes) {
        return new Ldap.Change({
            operation: operation,
            modification: attributes
        });
    }

    /**
     * Delete an existing entry from the LDAP directory.
     * @param {String} dn Distinguished name for the existing entry
     * @param {Control|Control[]} controls Optional LDAP controls to decorate the request
     * @returns {Promise} Resolved when the delete is complete
     */
    delete(dn, controls) {
        return this
            .$performAsyncLdapOperation('delAsync', dn, controls)
            .tap(() => {
                EventLogger.log('Deleted entry from LDAP', {
                    controls: controls,
                    dn: dn,
                    url: this.ldapUrl
                });
            });
    }

    /**
     * Given a plain credential, perform a specical encoding process to
     * prepare the credential to be added to the directory. Defaults to
     * doing nothing and passes the credential back as it was received.
     *
     * Most LDAPs will not require anything special. As a peculiar example,
     * Microsoft AD requires a new credential to be UTF16LE encoded and
     * surrounded in double quotes. You can request this encoding to be
     * applied by specifying 'msad' for the encodingType parameter.
     * @param {String} credential New credential to encode
     * @param {String|Function} [encodingType=null] Identifier of an alternate encoding to apply, or a function if you want to provide your own
     * @example <caption>Encode a password for Active Directory</caption>
     * encodeCredential('newpw', 'msad')
     * @returns {String} Encoded credential, or nothing if there was no encoding specified
     */
    encodeCredential(credential, encodingType=null) {
        if(!(encodingType)) {
            return credential;
        }
        else if(encodingType === 'msad') {
            return new Buffer(`"${credential}"`, 'utf16le');
        }
        else if(typeof encodingType === 'function') {
            return encodingType(credential);
        }
    }

    /**
     * Get the latest statistics from the pool regarding available and used
     * connections. See [pool2 documentation](https://github.com/myndzi/pool2)
     * for more information on what this returns.
     * @returns {Object}
     */
    getPoolStatistics() {
        return this.pool.stats();
    }

    /**
     * Utility function to try and identify if an error object returned by 
     * Ldapjs when a credential bind indicates that the password itself
     * was incorrect. First checks for code 49, and if that does not work then
     * looks for known error messages from certain directory types.
     * @param {Error} error The error that was thrown
     */
    isCredentialFailedError(error) {
        // Did the LDAP return the standard code 49 for invalid credentials?
        if(error.code === 49) {
            return true;
        }
        // If not, try to examine the error message for more clues
        else if(error.lde_message) {
            // Does the message resemble Sun ONE?
            if(error.lde_message === 'Invalid Credentials') {
                return true;
            }
            // Does the message resemble Active Directory?
            else if(error.lde_message.indexOf('DSID-0C0903D9')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Perform a modification on an existing entry in the LDAP directory.
     * @param {String} dn Distinguished name for the existing entry
     * @param {Change|Change[]} changes One or more Ldapjs change objects defining which attributes are changed
     * @param {Control|Control[]} controls Optional LDAP controls to decorate the request
     * @returns {Promise} Resolved when the modification is complete
     */
    modify(dn, changes, controls) {
        return this
            .$performAsyncLdapOperation('modifyAsync', dn, changes, controls)
            .tap(() => {
                EventLogger.log('Modified existing entry in LDAP', {
                    changes: changes,
                    controls: controls,
                    dn: dn,
                    url: this.ldapUrl
                });
            });
    }

    /**
     * Different method of making a modification on an existing entry in the
     * LDAP directory by allowing the specifying of operations and attribute
     * name/value pairs as function args. This promotes very high readability
     * of the function call, and automates much of the low-level object creation
     * required by Ldapjs.
     * @param {String} dn Distinguished name for the existing entry
     * @param {...String} operations Specify operations in 3-argument pairs: the operation, attribute name, and the value
     * @example
     * modifySimple(
     *     'cn=something,dc=somehost,dc=somedomain',
     *      'replace, 'displayName', 'John Doe')
     * @returns {Promise} Resolved when the modification is complete
     */
    modifySimple(dn, ...operations) {
        // Convert change requests into Ldapjs Change objects
        let changes = operations.map(operation => {
            return this.createLdapChange(operation[0], {
                [operation[1]]: operation[2]
            });
        });

        // Execute LDAP modification
        return this.modify(dn, changes);
    }

    /**
     * Search the LDAP directory for one or more entries based on the criteria
     * provided in the function arguments.
     * @param {String} baseDn The entry where the search should begin
     * @param {String} filter Attribute filter expression to limit results
     * @param {String[]} [attributes=[]] Array of attributes to return (defaults to all)
     * @param {String} [scope='one'] Search scope expressed as base|one|sub 
     * @example
     * search('ou=People,dc=somehost,dc=somedomain', '(cn=someid)')
     * @returns {Promise} Resolved with array of entries found
     */
    search(baseDn, filter, attributes=[], scope='one') {
        // Convert function args into object
        let searchOptions = {
            attributes: attributes,
            filter: filter,
            scope: scope
        };

        return new Promise((resolve, reject) => {
            return this.withConnection(client => {
                return client.searchAsync(baseDn, searchOptions).then(searchResult => {
                    let results = [];

                    // Attach event handler for capturing errors
                    searchResult.once('error', reject);

                    // Attach event handler for results
                    searchResult.on('searchEntry', entry => results.push(entry.object));

                    // Attach event handler for search completion
                    searchResult.once('end', () => resolve(results));
                })
                .catch(reject);
            });
        });
    }

    /**
     * Shutdown this connection pool and cleanup all open connections.
     * @returns {Promise} Resolved when the pool has disposed all of its resources
     */
    shutdown() {
        return this.pool.endAsync();
    }

    /**
     * Utility function to QA a credential by attempting to
     * perform a simple bind. The LDAP connection is always disposed
     * after binding because it is less complicated to get a new one from
     * the pool than constantly rebinding connections.
     * @param {String} dn Distinguished name for the account to test
     * @param {String} credential Credential/secret for the named account
     * @throws {Errors.CredentialValidationFailed} If the error returned from the directory appears to indicate credential failed
     * @returns {Promise} Resolved with `true` if the authentication passed, or rejected if not
     */
    testCredential(dn, credential) {
        let parent = this;

        return this.withConnection(client => {
            return client.bindAsync(dn, credential)
                .then(() => {
                    EventLogger.log(`Successfully validated credential for ${dn}`);
                    return Promise.resolve(true);
                })
                .catch(error => {
                    if(this.isCredentialFailedError(error)) {
                        EventLogger.log(`Credential for ${dn} failed to validate`, [error, {
                            url: parent.ldapUrl
                        }]);

                        return Promise.reject(new Errors.CredentialValidationFailed());
                    }
                    return Promise.reject(error);
                });
        }, true);
    }

    /**
     * Utility function to automatically acquire a connection from the pool,
     * execute a custom callback, and then ensure the connection is
     * returned back to the pool (or optionally removed from the pool through disposal)
     * @param {Boolean} [dispose=false] If true, the connection should be disposed instead of returned back to the pool
     * @returns {Promise} Resolved when entire operation is complete
     */
    withConnection(callback, dispose=false) {
        let clientInstance;

        return this.acquire().then(client => {
            // Retain reference to client for cleanup
            clientInstance = client;

            // Execute developer callback
            return callback(client);
        })
        .finally(() => {
            if(dispose) {
                // If requested, mark the connection for disposal
                clientInstance.dispose();
            }
            else {
                // Release the client back into the pool
                EventLogger.log(`withConnection(...) Releasing LDAP connection`);
                clientInstance.release();
            }
        });
    }

    /**
     * Private function to automatically acquire a connection from the pool,
     * execute a named function with the provided arguments, and then ensure the
     * connection is returned back to the pool. This exists primarily to
     * keep the other class functions adds, mods, etc. clean and tidy.
     * @returns {Promise}
     * @private
     */
    $performAsyncLdapOperation(functionName, ...args) {
        return this.withConnection(client => {
            // Drop any undefined elements
            let filteredArgs = args.filter(arg => arg !== undefined);

            // Execute named client function
            return client[functionName].apply(client, filteredArgs);
        });
    }

}

module.exports = PooledLdapConnection;