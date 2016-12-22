## FHDA Pooled LDAP

Create and manage connections to an LDAP directory (using `ldapjs` under the hood), and backed by the robust `pool2`. Comes with conveniences like promisified functions, and shortcut functions for changing credentials and modifying existing entries. Used in Foothill-De Anza projects for identity management.

### Getting Started

Install using NPM

```shell
npm install --save https://github.com/fhda-ets/fhda-pooled-ldap.git#latest
```

Create a New Connection

```javascript
let PooledLdap = require('fhda-pooled-ldap');

let connection = PooledLdap.create(
	'ldaps://myad.school.edu',
	'DOMAIN\User',
	'sample-password');

connection.search('ou=People,dc=school,dc=edu', '(cn=someuser)')
	.then(results => {
     	// Do something
	});
```

For more API documents, open https://fhda-ets.github.io/fhda-pooled-ldap/ in a browser.

#### Advanced

##### Attach Logging

A dependency-free event buffer is built-in so that you can tap into log events emitted by the connection pool. Highly recommended for non-production debugging.

```javascript
PooledLdap.events.on('log', (message, metadata) => {
	Logger.debug(message, metadata);
  	// ... or do whatever you want with the debugging information
});
```

### Housekeeping

#### Run Tests

**Note:** You must create a file `tests/Configuration.js` before running tests because they will require your actual directory information and credentials.

```shell
npm test
```

#### Generate Fresh Documentation

```shell
npm run docs
```

Then open `docs/index.html` in a browser