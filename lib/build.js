#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    spawn = require('child_process').spawn,
    Mocha = require('mocha');

/**
 * After build
 *
 * @param {Object} options
 * @api private
 */

function afterBuild(options) {
  var folder = options.debug ? 'Debug' : 'Release';
  var target = path.join(__dirname, '..', 'build', folder, 'binding.node');
  var install = path.join(__dirname, '..', 'bin', options.bin, 'binding.node');

  fs.mkdir(path.join(__dirname, '..', 'bin', options.bin), function (err) {
    if (err && err.code !== 'EEXIST') {
      console.error(err.message);
      process.exit(1);
    }

    fs.stat(target, function (err) {
      if (err) {
        console.error('Build succeeded but target not found');
        process.exit(1);
      }

      fs.rename(target, install, function (err) {
        if (err) {
          console.error(err.message);
          process.exit(1);
        }

        console.log('Installed in `' + install + '`');
      });
    });
  });
}

/**
 * Build
 *
 * @param {Object} options
 * @api private
 */

function build(options) {
  var bin = options.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp';
  var proc = spawn(bin, ['rebuild'].concat(options.args), {
    customFds: [0, 1, 2]
  });

  proc.on('exit', function(code) {
    if (code) {
      if (code === 127) {
        console.error([
          'node-gyp not found! Please upgrade your install of npm!',
          'You need at least 1.1.5 (I think) and preferably 1.1.30.'
        ].join(' '));

        process.exit(code);
      }

      console.error('Build failed');
      process.exit(code);
    }

    afterBuild(options);
  });
}

/**
 * Parse arguments
 *
 * @param {Array} args
 * @api private
 */

function parseArgs(args) {
  var options = {
    arch: process.arch,
    platform: process.platform,
    v8: /[0-9]+\.[0-9]+/.exec(process.versions.v8)[0]
  };

  options.args = args.filter(function(arg) {
    if (arg === '-f' || arg === '--force') {
      options.force = true;
      return false;
    } else if (arg.substring(0, 13) === '--target_arch') {
      options.arch = arg.substring(14);
    } else if (arg === '--debug') {
      options.debug = true;
    }

    return true;
  });

  return options;
}

/**
 * Test for pre-built library
 *
 * @param {Object} options
 * @api private
 */

function testBinary(options) {
  options.bin = [
    options.platform + '-' + options.arch,
    '-v8-' + options.v8
  ].join('');

  if (options.force) {
    return build(options);
  }

  if (!process.env.SKIP_NODE_SASS_TESTS) {
    fs.stat(path.join(__dirname, '..', 'bin', options.bin, 'binding.node'), function (err) {
      if (err) {
        return build(options);
      }

      console.log('`' + options.bin + '` exists; testing');

      var total;
      var failures;
      var mocha = new Mocha({
        ui: 'bdd',
        timeout: 999999,
        reporter: function(stats) {
          total = stats.total;
          failures = stats.failures;
        }
      });

      mocha.addFile(path.resolve(__dirname, '..', 'test', 'api.js'));
      mocha.run(function () {
        if ((total - failures) * 100 / total < 90) {
          console.log([
            'Problem with the binary: ' + failures + ' of ' + total + ' tests are failing.',
            'Manual build incoming.',
            'Please consider contributing the release binary to https://github.com/sass/node-sass-binaries for npm distribution.'
          ].join('\n'));

          return build(options);
        }

        console.log('Binary is fine; exiting');
      });
    });
  }
}

/**
 * Apply arguments and run
 */

testBinary(parseArgs(process.argv.slice(2)));
