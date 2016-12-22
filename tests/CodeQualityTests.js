'use strict';
var Lint = require('mocha-eslint');

// Execute ESLint to check code quality and look for common problems
Lint([
    'src/**/*.js'
], {
    // Increase default timeout to allow lint checks to complete
    timeout: 10000
});
