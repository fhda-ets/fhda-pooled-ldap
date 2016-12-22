'use strict';
let Config = require('./Configuration');
let Module = require('../src/Index');
let Should = require('should');

describe('Event logging', function() {

    it('should be able to report buffered log events', function() {
        Module.events.on('log', function(message, metadata) {
            console.log(`${new Date()} (fhda-pooled-ldap) ${message}`);
            (metadata) ? console.log(metadata) : null;
        });
        console.log('Added a listener for buffered events');
    });

});

describe('Pooled LDAP connection (Active Directory)', function() {

    // Create new instance of the pool
    let pool = Module.create(
        Config.activedirectory.url,
        Config.activedirectory.bindDn,
        Config.activedirectory.bindCredential,
        Config.activedirectory.tlsOptions);

    let client;

    it('Should get a connection from the pool', function() {
        return pool.acquire().then(pooledClient => {
            client = pooledClient;
            Should.equal(pool.getPoolStatistics().available, 7);
        });
    });

    it('Should return a connection back to the pool', function() {
        client.release();
        Should.equal(pool.getPoolStatistics().available, 8);
    });

    it('Ensure the test entry is deleted before running tests', function() {
        return pool.delete('cn=Test Group,ou=Banner,dc=adtest,dc=fhda,dc=edu')
            .catch(() => {
                console.log(`Warning: Test LDAP entry was not found in Active Directory`);
            });
    });

    it('Should be able to search the LDAP', function() {
        return pool.search('ou=Banner,dc=adtest,dc=fhda,dc=edu', '(objectClass=organizationalUnit)')
            .then(results => {
                Should.equal(results.length, 6);
            });
    });

    it('Should be able to search the LDAP (with limited attributes)', function() {
        return pool.search(
            'ou=Banner,dc=adtest,dc=fhda,dc=edu',
            '(objectClass=organizationalUnit)',
            ['ou', 'name'])
        .then(results => {
            Should.equal(results.length, 6);
        });
    });

    it('Should be able to create an entry', function() {
        return pool.add('cn=Test Group,ou=Banner,dc=adtest,dc=fhda,dc=edu', {
            objectClass: ['group', 'top'],
            cn: 'Test Group'
        });
    });

    it('Should be able to modify an entry by adding an attribute', function() {
        return pool.modifySimple(
            'cn=Test Group,ou=Banner,dc=adtest,dc=fhda,dc=edu',
            ['add', 'url', 'http://www.fhda.edu']);
    });

    it('Should be able to modify an entry by replacing an attribute', function() {
        return pool.modifySimple(
            'cn=Test Group,ou=Banner,dc=adtest,dc=fhda,dc=edu',
            ['replace', 'url', ['http://www.fhda.edu', 'http://www.deanza.edu']]);
    });

    it('Should be able to modify an entry by deleting an attribute', function() {
        return pool.modifySimple('cn=Test Group,ou=Banner,dc=adtest,dc=fhda,dc=edu',
            ['replace', 'url', []]);
    });

    it('Should be able to delete an entry', function() {
        return pool.delete('cn=Test Group,ou=Banner,dc=adtest,dc=fhda,dc=edu');
    });

    it('Credential change: test current credential to ensure it works', function() {
        return pool.testCredential(
            Config.activedirectory.testBindUser,
            Config.activedirectory.testBindCredential);
    });

    it('Credential change: change credential to a different password', function() {
        return pool.changeCredential(
            Config.activedirectory.testBindUser,
            '12345abc',
            Config.activedirectory.credentialAttribute,
            Config.activedirectory.credentialEncoding);
    });

    it('Credential change: test newly changed credential', function() {
        return pool.testCredential(
            Config.activedirectory.testBindUser,
            '12345abc');
    });

    it('Credential change: change account back to original configured credential', function() {
        return pool.changeCredential(
            Config.activedirectory.testBindUser,
            Config.activedirectory.testBindCredential,
            Config.activedirectory.credentialAttribute,
            Config.activedirectory.credentialEncoding);
    });

    it('Credential change: re-test original credential to ensure it still works', function() {
        return pool.testCredential(
            Config.activedirectory.testBindUser,
            Config.activedirectory.testBindCredential);
    });

    it('Check that the connection count decreased after discarding post credential check', function() {
        Should.equal(pool.getPoolStatistics().available, 8);
    });

    it('Should be able to shut down a connection pool', function() {
        // Override test timeout
        this.timeout(10000);

        return pool.shutdown();
    });

});

describe('Pooled LDAP connection (Luminis LP4)', function() {

    // Create new instance of the pool
    let pool = Module.create(
        Config.luminis.url,
        Config.luminis.bindDn,
        Config.luminis.bindCredential);

    let client;

    let dnTestEntry = 'ou=Test OU,o=fhda.edu,o=cp';

    it('Should get a connection from the pool', function() {
        return pool.acquire().then(pooledClient => {
            client = pooledClient;
            Should.equal(pool.getPoolStatistics().available, 7);
        });
    });

    it('Should return a connection back to the pool', function() {
        client.release();
        Should.equal(pool.getPoolStatistics().available, 8);
    });

    it('Ensure the test entry is deleted before running tests', function() {
        return pool.delete(dnTestEntry)
            .catch(() => {
                console.log(`Warning: Test LDAP entry was not found in Luminis`);
            });
    });

    it('Should be able to search the LDAP', function() {
        return pool.search('ou=People,o=fhda.edu,o=cp', '(pdsLoginId=10716429)')
            .then(results => {
                Should.equal(results.length, 1);
            });
    });

    it('Should be able to search the LDAP (with limited attributes)', function() {
        return pool.search(
            'ou=People,o=fhda.edu,o=cp',
            '(pdsLoginId=10716429)',
            ['pdsRole'])
        .then(results => {
            Should.equal(results.length, 1);
        });
    });

    it('Should be able to create an entry', function() {
        return pool.add(dnTestEntry, {
            objectClass: ['extensibleObject', 'top'],
            cn: 'Test Group'
        });
    });

    it('Should be able to modify an entry by adding an attribute', function() {
        return pool.modifySimple(
            dnTestEntry,
            ['add', 'url', 'http://www.fhda.edu']);
    });

    it('Should be able to modify an entry by replacing an attribute', function() {
        return pool.modifySimple(
            dnTestEntry,
            ['replace', 'url', ['http://www.fhda.edu', 'http://www.deanza.edu']]);
    });

    it('Should be able to modify an entry by deleting an attribute', function() {
        return pool.modifySimple(dnTestEntry,
            ['replace', 'url', []]);
    });

    it('Should be able to delete an entry', function() {
        return pool.delete(dnTestEntry);
    });

    it.skip('Credential change: test current credential to ensure it works', function() {
        return pool.testCredential(
            Config.luminis.testBindUser,
            Config.luminis.testBindCredential);
    });

    it('Credential change: change credential to a different password', function() {
        return pool.changeCredential(
            Config.luminis.testBindUser,
            '12345abc',
            Config.luminis.credentialAttribute);
    });

    it('Credential change: test newly changed credential', function() {
        return pool.testCredential(
            Config.luminis.testBindUser,
            '12345abc');
    });

    it('Credential change: change account back to original configured credential', function() {
        return pool.changeCredential(
            Config.luminis.testBindUser,
            Config.luminis.testBindCredential,
            Config.luminis.credentialAttribute);
    });

    it('Credential change: re-test original credential to ensure it still works', function() {
        return pool.testCredential(
            Config.luminis.testBindUser,
            Config.luminis.testBindCredential);
    });

    it('Check that the connection count decreased after discarding post credential check', function() {
        Should.equal(pool.getPoolStatistics().available, 8);
    });

    it('Should be able to shut down a connection pool', function() {
        // Override test timeout
        this.timeout(20000);

        return pool.shutdown();
    });

});
