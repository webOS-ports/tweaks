// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: MIT

'use strict';

/*
	The four bus methods, answering as the old service's assistants did
	(mojo.js gives the mojoservice reply around them):

	get  {owner, key | keys, subscribe?} -> {key: value, ...}: the values
	     the store holds for those tweaks of owner. With "subscribe": true
	     the call stays open and gets {owner, key: value} whenever /set
	     changes one of them.
	set  {owner, key: value, ...}: stores them; a key no preference file
	     declares for owner is left out ({unknown: [...]}), and a call
	     naming no other fails.
	scan builds the store from the preference files again, keeping the
	     values chosen.
	list {path?, filter?: "files" | "dirs"} -> {files: [{label, value}]}:
	     the Tweaks app's file picker; a path it cannot read is refused.

	A refusal is {errorCode: -1, message}: thrown, as the old service set it
	as the future's exception (mojoservice turned a plain result into
	returnValue true whatever it said), and replied as mojoservice replied
	it, with "[object Object]" for its exception.
*/

const fs = require('fs');

const SERVICE = 'org.webosports.service.tweaks.prefs';
const NAMES = ['list', 'scan', 'get', 'set'];
// services.json's commandTimeout.
const COMMAND_TIMEOUT_S = 30;

function refusal(message) {
	return {errorCode: -1, message};
}

function createCommands({prefs}) {
	async function get(args, subscription) {
		if (!args.owner) {
			throw refusal('owner is required');
		}
		if (!args.key && !args.keys) {
			throw refusal('key or keys is required');
		}
		const keys = args.key ? [args.key] : args.keys;
		const config = await prefs.loadFor(args.owner, keys);
		const result = {returnValue: true};
		for (let i = 0; i < keys.length; i++) {
			const tweak = prefs.find(config, args.owner, keys[i]);
			if (tweak) {
				result[keys[i]] = tweak.value;
			}
		}
		// Registered before this reply goes out, so no change falls between.
		if (subscription) {
			const subscriber = prefs.subscribe(args.owner, keys, subscription);
			subscription.onCancel(() => prefs.unsubscribe(subscriber));
			result.subscribed = true;
		}
		return result;
	}

	async function set(args) {
		if (!args.owner) {
			throw refusal('owner is required');
		}
		const values = {};
		for (const key of Object.keys(args)) {
			if (key === 'owner' || key.charAt(0) === '$') {
				continue;
			}
			values[key] = args[key];
		}
		const outcome = await prefs.update(args.owner, values);
		if (outcome.unknown.length > 0 && outcome.unknown.length === Object.keys(values).length) {
			throw refusal('No such tweak for ' + args.owner + ': ' + outcome.unknown.join(', '));
		}
		if (outcome.unknown.length > 0) {
			return {returnValue: true, unknown: outcome.unknown};
		}
		return {returnValue: true};
	}

	async function scan() {
		await prefs.scan();
		return {returnValue: true};
	}

	// returnValue false is what the old service said; mojoservice made it true, and so does mojo.js.
	async function list(args) {
		const path = args.path ? args.path : '/media/internal/downloads';
		const filter = args.filter ? args.filter : 'files';
		let files;
		try {
			files = fs.readdirSync(path);
		} catch (error) {
			// A refusal (bug 3): the old reply said returnValue true, with no files.
			throw refusal(error.message);
		}
		const items = [];
		for (const file of files) {
			// An entry that cannot be stat'ed (a dangling symlink) is left out, not the list (bug 4).
			let stat = null;
			try {
				stat = fs.statSync(path + '/' + file);
			} catch (error) {
				continue;
			}
			// == as the old service compared: a filter of ["files"] is "files".
			if (stat && ((filter == 'files' && stat.isFile()) || (filter == 'dirs' && stat.isDirectory()))) { /* jshint ignore:line */ // eslint-disable-line eqeqeq
				items.push({label: file, value: path + '/' + file});
			}
		}
		return {returnValue: false, files: items};
	}

	return {get, set, scan, list};
}

module.exports = {createCommands, SERVICE, NAMES, COMMAND_TIMEOUT_S};
