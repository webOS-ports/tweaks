// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	org.webosports.service.tweaks.prefs: the tweaks store the Tweaks app,
	Settings and the shell read (lib/prefs.js), and the methods they call
	(lib/commands.js).

	The launcher (run-js-service -> jsservicelauncher's bootstrap-node.js)
	requires this directory, as it has a package.json, and calls run().
	Nothing starts on require, so a test can start() it on a stand-in bus.
*/

const {createBus} = require('./lib/bus');
const {palmCall, method} = require('./lib/mojo');
const {createPrefs, PREF_DIRS} = require('./lib/prefs');
const {createCommands, SERVICE, NAMES, COMMAND_TIMEOUT_S} = require('./lib/commands');

const NAME = SERVICE;

/*
	start({palmbus, ...}): the service on that bus. dirs: where the
	preference files are (PREF_DIRS by default).
*/
function start({palmbus, exit, idleMs, log = console, dirs = PREF_DIRS} = {}) {
	const bus = createBus({palmbus, name: NAME, exit, idleMs, log});
	const call = palmCall(Object.assign((uri, args, opts) => bus.call(uri, args, opts), {subscribe: bus.subscribe}));
	const prefs = createPrefs({call, dirs, log});
	const commands = createCommands({prefs});
	const table = {};
	for (const name of NAMES) {
		table[name] = method(NAME, name, commands[name], {timeoutS: COMMAND_TIMEOUT_S, log, subscribe: call.subscribe,
			subscribable: name === 'get'});
	}
	bus.serve(table);
	log.log(NAME + ': up (node ' + process.version + ')');
	return {bus, prefs};
}

let running = null;
function run() {
	if (running) {
		return running;
	}
	process.title = NAME;
	// palmbus is the launcher's: it is there on the device and nowhere else.
	running = start({palmbus: require('palmbus')});
	return running;
}

module.exports = {start, run, NAME};

if (require.main === module) {
	run();
}
