// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	The service on a stand-in bus (palmbus.js), with an in-memory db8
	(fakedb.js) and preference directories of its own, made under
	tests/.work (TWEAKS_TEST_WORK elsewhere) and removed by stop().
*/

const fs = require('fs');
const path = require('path');
const {createPalmbus} = require('./palmbus');
const {createFakeDb} = require('./fakedb');

const SERVICE = path.join(__dirname, '..');
const NAME = 'org.webosports.service.tweaks.prefs';
const WORK = process.env.TWEAKS_TEST_WORK || path.join(__dirname, '.work');
const quiet = {log() {}, warn() {}, error() {}, info() {}};

let serial = 0;

/*
	boot({files: {name: content}, appFiles, store}) -> {request, open, db, dirs,
	bus, prefs, settle, stop}. files go in the first directory (the system's),
	appFiles in the second; content that is not a string is written as JSON.
	store: an object already stored, as from an earlier scan.
*/
function boot({files = {}, appFiles = {}, store} = {}) {
	const root = path.join(WORK, process.pid + '-' + (++serial));
	const dirs = {sys: path.join(root, 'sys'), app: path.join(root, 'app'), root};
	fs.rmSync(root, {recursive: true, force: true});
	for (const [dir, list] of [[dirs.sys, files], [dirs.app, appFiles]]) {
		fs.mkdirSync(dir, {recursive: true});
		for (const [name, content] of Object.entries(list)) {
			fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
		}
	}
	const db = createFakeDb();
	if (store) {
		db.seed(store);
	}
	let pending = 0, last = Date.now();
	const pb = createPalmbus(async (uri, args) => {
		pending++;
		last = Date.now();
		try {
			const [, service, method] = /^luna:\/\/([^/]+)\/(.+)$/.exec(uri);
			if (service === 'com.palm.db') {
				await new Promise(r => setImmediate(r));
				return await db.handle(method, args);
			}
			return {returnValue: false, errorCode: -1, errorText: 'unexpected ' + uri};
		} finally {
			pending--;
			last = Date.now();
		}
	});
	const {bus, prefs} = require(path.join(SERVICE, 'service')).start({palmbus: pb, idleMs: 0, log: quiet, exit() {},
		dirs: [dirs.sys, dirs.app]});
	async function settle(ms = 20) {
		for (;;) {
			await new Promise(r => setTimeout(r, 5));
			if (pending === 0 && Date.now() - last >= ms) {
				return;
			}
		}
	}
	return {
		db, dirs, bus, prefs, settle,
		request: (method, args) => pb.request(NAME, method, args),
		open: (method, args) => pb.open(NAME, method, args),
		stop() {
			bus.stop();
			fs.rmSync(root, {recursive: true, force: true});
		}
	};
}

// A preference file of one owner: [{category, owner, prefs}].
function prefFile(category, owner, prefs) {
	return [{category, owner, prefs}];
}

module.exports = {boot, prefFile, NAME, WORK};
