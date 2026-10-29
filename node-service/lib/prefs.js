// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: MIT

'use strict';

/*
	The tweaks store: one db8 object of kind org.webosports.tweaks:1, which
	the Tweaks app reads directly and /get and /set answer from. It holds a
	property per category (browser, calendar, ..., luna, phone, system, and
	any other a preference file names), each a property per group (lower
	case), each a list of the tweaks in it:

	  {owner, type, key, restart, prefserv, help, label, value, ...}

	with min/max (IntegerPicker), choices (ListSelector), input (TextField),
	or path/filter/select (FilePicker). The format is the old service's
	(assistants/utils-prefs.js), unchanged: the Tweaks app, Settings and the
	shell read it.

	The tweaks come from the preference files (*.json) in PREF_DIRS. A scan
	builds the store from them again, keeping the values already chosen.
*/

const fs = require('fs');

const DB_KIND = 'org.webosports.tweaks:1';
const DB = 'luna://com.palm.db';
const PREF_DIRS = ['/usr/palm/services/org.webosports.service.tweaks.prefs/preferences',
	'/media/cryptofs/apps/usr/palm/services/org.webosports.service.tweaks.prefs/preferences'];

function defaultPrefs() {
	return {
		_kind: DB_KIND,
		browser: {},
		calendar: {},
		camera: {},
		clock: {},
		contacts: {},
		email: {},
		messaging: {},
		phone: {},
		system: {}
	};
}

/*
	The tweaks the preference files in dirs declare, with the values already
	chosen in config carried over: what /scan stores.
*/
function buildConfig(config, {dirs = PREF_DIRS, log = console} = {}) {
	const newConfig = {
		_id: config._id,
		_kind: config._kind,
		_rev: config._rev,
		browser: {},
		calendar: {},
		camera: {},
		clock: {},
		contacts: {},
		email: {},
		luna: {},
		messaging: {},
		phone: {},
		system: {}
	};

	// The value the store holds for owner/key in that category and group, else value.
	function chosen(category, group, owner, key, value) {
		if (config[category] && config[category][group]) {
			for (let k = 0; k < config[category][group].length; k++) {
				if (config[category][group][k].owner == owner && config[category][group][k].key == key) { /* jshint ignore:line */ // eslint-disable-line eqeqeq
					return config[category][group][k].value;
				}
			}
		}
		return value;
	}

	function entry(owner, key, pref, value) {
		const restart = pref.restart ? pref.restart : 'none';
		const prefserv = pref.prefserv ? pref.prefserv : '';
		const help = pref.help ? pref.help : '';
		const label = pref.label ? pref.label : '';
		// The properties in the order the old service wrote them.
		const ordered = type => ({owner, type, key, restart, prefserv, help, label, value});
		switch (pref.type) {
		case 'IntegerPicker':
			return Object.assign(ordered('IntegerPicker'), {min: pref.min ? pref.min : 0, max: pref.max ? pref.max : 100});
		case 'ListSelector':
			return pref.choices ? Object.assign(ordered('ListSelector'), {choices: pref.choices}) : null;
		case 'TextField':
			return Object.assign(ordered('TextField'), {input: pref.input ? pref.input : 'text'});
		case 'ToggleButton':
			return ordered('ToggleButton');
		case 'FilePicker':
			return Object.assign(ordered('FilePicker'), {
				path: pref.path ? pref.path : '/media/internal/downloads',
				filter: pref.filter ? pref.filter : 'files',
				select: pref.select == true ? pref.select : 'single' /* jshint ignore:line */ // eslint-disable-line eqeqeq
			});
		default:
			return null;
		}
	}

	/*
		path is the directory being read, and the old service's FilePicker
		branch declared a `var path` of its own in the same function: so
		after a FilePicker tweak the rest of that directory's files were
		read from the tweak's path (/media/internal/downloads by default),
		and a file not there failed the whole scan (README: bug 1).
	*/
	function scanDirectory(path) {
		log.log('Scanning path ' + path);
		let files;
		try {
			files = fs.readdirSync(path);
		} catch (error) {
			return false;
		}
		for (const file of files) {
			if (file.slice(file.length - 5) !== '.json') {
				continue;
			}
			const fileId = file.slice(0, file.length - 5);
			const filePath = path + '/' + file;
			log.log('Reading tweak ' + filePath);
			const fileData = fs.readFileSync(filePath, 'utf8');
			let jsonData;
			try {
				jsonData = JSON.parse(fileData);
			} catch (error) {
				continue;
			}
			if (!(jsonData instanceof Array)) {
				continue;
			}
			for (let i = 0; i < jsonData.length; i++) {
				const category = jsonData[i].category.toLowerCase();
				const owner = jsonData[i].owner || fileId;
				const prefs = jsonData[i].prefs;
				if (!prefs || !prefs.length) {
					continue;
				}
				if (!newConfig[category]) {
					newConfig[category] = {};
				}
				for (let j = 0; j < prefs.length; j++) {
					if (!prefs[j].group) {
						continue;
					}
					const group = prefs[j].group.toLowerCase();
					if (newConfig[category][group] == undefined) { /* jshint ignore:line */ // eslint-disable-line eqeqeq
						newConfig[category][group] = [];
					}
					if (!prefs[j].key || prefs[j].value == undefined) { /* jshint ignore:line */ // eslint-disable-line eqeqeq
						continue;
					}
					const key = prefs[j].key;
					if (prefs[j].type === 'FilePicker') {
						path = prefs[j].path ? prefs[j].path : '/media/internal/downloads';
					}
					const made = entry(owner, key, prefs[j], chosen(category, group, owner, key, prefs[j].value));
					if (made) {
						newConfig[category][group].push(made);
					}
				}
			}
		}
		return true;
	}

	for (const dir of dirs) {
		scanDirectory(dir);
	}
	return newConfig;
}

/*
	The stored entry for one tweak, or null. The object also holds _id,
	_kind and _rev, which are not categories.
*/
function findTweak(config, owner, key) {
	for (const category in config) {
		if (!config[category] || typeof config[category] !== 'object') {
			continue;
		}
		for (const group in config[category]) {
			const tweaks = config[category][group];
			if (!(tweaks instanceof Array)) {
				continue;
			}
			for (let i = 0; i < tweaks.length; i++) {
				if (tweaks[i].owner == owner && tweaks[i].key == key) { /* jshint ignore:line */ // eslint-disable-line eqeqeq
					return tweaks[i];
				}
			}
		}
	}
	return null;
}

function holdsAll(config, owner, keys) {
	for (let i = 0; i < keys.length; i++) {
		if (!findTweak(config, owner, keys[i])) {
			return false;
		}
	}
	return true;
}

/*
	createPrefs({call, dirs}): the store over db8 (call, the bus's, failing
	as Foundations' PalmCall failed: mojo.palmCall).
*/
function createPrefs({call, dirs = PREF_DIRS, log = console} = {}) {
	async function loadPrefs() {
		const result = await call(DB + '/find', {query: {from: DB_KIND, limit: 2}});
		const len = result.results ? result.results.length : 0;
		if (len === 0) {
			return defaultPrefs();
		}
		if (len > 1) {
			throw new Error('More than 1 preferences object found');
		}
		return result.results[0];
	}

	async function savePrefs(prefs) {
		await call(DB + '/put', {objects: [prefs]});
		log.log('WebOS Tweaks preferences saved');
		return {returnValue: true};
	}

	const build = config => buildConfig(config, {dirs, log});

	/*
		Writes, one at a time. Each is a load, a change and a put of the
		whole object, so two running together would both start from the same
		_rev, and Settings writes a text tweak on every keystroke.
	*/
	let tail = Promise.resolve();
	function enqueue(work) {
		const done = tail.then(() => work());
		tail = done.catch(() => {});
		return done;
	}

	/*
		The stored object, scanned first if a tweak asked about is not in
		it: then the preference files are read again and the result stored,
		which is what /scan does. Gives the object read back after that.
	*/
	async function loadHolding(owner, keys) {
		const config = await loadPrefs();
		if (holdsAll(config, owner, keys)) {
			return config;
		}
		log.log('WebOS Tweaks: rescanning for ' + owner + '/' + keys.join(','));
		await savePrefs(build(config));
		return loadPrefs();
	}

	// Clients following tweaks through /get with "subscribe": true.
	const subscribers = [];

	function notify(owner, changed) {
		for (const subscriber of subscribers.slice()) {
			if (subscriber.owner != owner) { /* jshint ignore:line */ // eslint-disable-line eqeqeq
				continue;
			}
			const reply = {owner};
			let any = false;
			for (let j = 0; j < subscriber.keys.length; j++) {
				if (Object.prototype.hasOwnProperty.call(changed, subscriber.keys[j])) {
					reply[subscriber.keys[j]] = changed[subscriber.keys[j]];
					any = true;
				}
			}
			if (any) {
				subscriber.replies.push(reply);
			}
		}
	}

	return {
		find: findTweak,
		build,

		// /scan: what the preference files declare, keeping the values set. Queued with the writes.
		scan() {
			return enqueue(async () => savePrefs(build(await loadPrefs())));
		},

		// The stored object for reading the given tweaks; one missing gets the store scanned first.
		async loadFor(owner, keys) {
			const config = await loadPrefs();
			if (holdsAll(config, owner, keys)) {
				return config;
			}
			return enqueue(() => loadHolding(owner, keys));
		},

		/*
			Set the given tweaks of one owner, store them and tell the
			subscribers. -> {changed: {key: value}, unknown: [key]}; a key no
			preference file declares for that owner is left alone and listed.
		*/
		update(owner, values) {
			const keys = Object.keys(values);
			return enqueue(async () => {
				const changed = {};
				const unknown = [];
				const config = await loadHolding(owner, keys);
				let dirty = false;
				for (const key of keys) {
					const tweak = findTweak(config, owner, key);
					if (!tweak) {
						unknown.push(key);
						continue;
					}
					if (JSON.stringify(tweak.value) !== JSON.stringify(values[key])) {
						tweak.value = values[key];
						changed[key] = values[key];
						dirty = true;
					}
				}
				if (!dirty) {
					return {changed, unknown};
				}
				await savePrefs(config);
				notify(owner, changed);
				return {changed, unknown};
			});
		},

		subscribe(owner, keys, replies) {
			const subscriber = {owner, keys, replies};
			subscribers.push(subscriber);
			return subscriber;
		},

		unsubscribe(subscriber) {
			const at = subscribers.indexOf(subscriber);
			if (at >= 0) {
				subscribers.splice(at, 1);
			}
		},

		get subscribers() {
			return subscribers.length;
		}
	};
}

module.exports = {createPrefs, buildConfig, findTweak, holdsAll, defaultPrefs, DB_KIND, PREF_DIRS};
