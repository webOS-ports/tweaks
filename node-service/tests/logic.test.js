// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

// The mojoservice replies (lib/mojo.js) and the store's lookups (lib/prefs.js), without a bus.

const test = require('node:test');
const assert = require('node:assert');
const mojo = require('../lib/mojo');
const {findTweak, holdsAll, defaultPrefs} = require('../lib/prefs');

const quiet = {log() {}, warn() {}, error() {}, info() {}};

test('replies as mojoservice gave them', () => {
	assert.deepStrictEqual(mojo.reply(null), {returnValue: true});
	assert.deepStrictEqual(mojo.reply({returnValue: false, files: []}), {returnValue: true, files: []});
	assert.strictEqual(mojo.reply(true), true);
	assert.deepStrictEqual(mojo.subscribeReply({owner: 'o', k: 1}), {owner: 'o', k: 1, returnValue: true, fired: true});
	assert.deepStrictEqual(mojo.subscribeReply(undefined), {returnValue: true, fired: true});
	assert.deepStrictEqual(mojo.exception({errorCode: -1, message: 'owner is required'}),
		{errorText: 'owner is required', errorCode: -1, exception: '[object Object]', returnValue: false});
	const e = mojo.exception(new Error('boom'));
	assert.strictEqual(e.errorCode, -9999);
	assert.strictEqual(e.errorText, 'MojoService: no errorCode supplied boom');
	assert.match(e.exception, /^Error: boom\n/);
});

test('a command past its time answers 504', async () => {
	const m = mojo.method('org.webosports.service.tweaks.prefs', 'scan', () => new Promise(() => {}), {timeoutS: 0.05, log: quiet});
	// mojo.js does not hold the process open for its timer: this does, for the test.
	const hold = setTimeout(() => {}, 1000);
	const r = await m.handler({}, {});
	clearTimeout(hold);
	assert.strictEqual(r.errorCode, 504);
	assert.strictEqual(r.errorText, 'commandTimeout in org.webosports.service.tweaks.prefs/scan');
});

test('findTweak looks through every category and group, and past _id, _kind and _rev', () => {
	const config = Object.assign(defaultPrefs(), {_id: 'x', _rev: 3,
		luna: {launcher: [{owner: 'shell', key: 'a', value: 1}], odd: 'not a list'},
		phone: {dial: [{owner: 'phone', key: 'a', value: 2}]}});
	assert.strictEqual(findTweak(config, 'phone', 'a').value, 2);
	assert.strictEqual(findTweak(config, 'shell', 'a').value, 1);
	assert.strictEqual(findTweak(config, 'shell', 'b'), null);
	assert.strictEqual(holdsAll(config, 'shell', ['a']), true);
	assert.strictEqual(holdsAll(config, 'shell', ['a', 'b']), false);
	assert.strictEqual(holdsAll(config, 'shell', []), true);
});
