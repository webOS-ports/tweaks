// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: MIT

'use strict';

/*
	The service over the stand-in bus: every method's replies as the old
	service gave them, what the store holds after, and the subscriptions.
	Tests marked "old service:" pin a bug of the old one that this version
	still has (README.md, by number).
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {boot, prefFile} = require('./boot');

const KIND = 'org.webosports.tweaks:1';
const PHONE = 'org.webosports.app.phone';
const SHELL = 'luna-next-cardshell';

const dialPad = {group: 'Dialpad Preferences', restart: 'none', label: 'Dialpad Feedback', help: 'Vibrate, sound, both, or none',
	key: 'dialPadFeedback', type: 'ListSelector', value: 'noFeedback',
	choices: [{label: 'Vibrate Only', value: 'vibrateOnly'}, {label: 'None', value: 'noFeedback'}]};
const shellPrefs = [
	{group: 'Launcher', key: 'tabTitleCase', type: 'ListSelector', value: 'capitalizedCase', label: 'Tab title case',
		choices: [{label: 'UPPERCASE', value: 'upperCase'}, {label: 'Capitalized Case', value: 'capitalizedCase'}]},
	{group: 'Launcher', key: 'showAndroidTab', type: 'ToggleButton', value: true},
	{group: 'Status Bar', key: 'carrierString', type: 'TextField', value: 'LuneOS'},
	{group: 'UI', key: 'rippleSize', type: 'IntegerPicker', value: 5, min: 1, max: 0},
	{group: 'UI', key: 'wallpaper', type: 'FilePicker', value: '', path: '/media/internal/wallpapers', select: true}
];
const FILES = {[PHONE + '.json']: prefFile('phone', PHONE, [dialPad])};
const APP_FILES = {[SHELL + '.json']: prefFile('luna', SHELL, shellPrefs)};

function stored(t) {
	const all = t.db.all(KIND);
	assert.strictEqual(all.length, 1);
	return all[0];
}

function puts(t) {
	return t.db.calls.filter(c => c.method === 'put').length;
}

test('scan stores every tweak the files declare, in the old format', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		assert.deepStrictEqual(await t.request('scan', {}), {returnValue: true});
		const s = stored(t);
		assert.deepStrictEqual(Object.keys(s).filter(k => k[0] !== '_').sort(),
			['browser', 'calendar', 'camera', 'clock', 'contacts', 'email', 'luna', 'messaging', 'phone', 'system']);
		const strip = v => JSON.parse(JSON.stringify(v, (k, x) => (k === '_id' ? undefined : x)));
		assert.deepStrictEqual(strip(s.phone), {'dialpad preferences': [{owner: PHONE, type: 'ListSelector',
			key: 'dialPadFeedback', restart: 'none', prefserv: '', help: 'Vibrate, sound, both, or none',
			label: 'Dialpad Feedback', value: 'noFeedback', choices: dialPad.choices}]});
		const luna = strip(s.luna);
		assert.deepStrictEqual(Object.keys(luna).sort(), ['launcher', 'status bar', 'ui']);
		assert.deepStrictEqual(luna.launcher[1], {owner: SHELL, type: 'ToggleButton', key: 'showAndroidTab',
			restart: 'none', prefserv: '', help: '', label: '', value: true});
		assert.deepStrictEqual(luna['status bar'][0], {owner: SHELL, type: 'TextField', key: 'carrierString',
			restart: 'none', prefserv: '', help: '', label: '', value: 'LuneOS', input: 'text'});
		// min 1 kept, max 0 is "none given": 100.
		assert.deepStrictEqual(luna.ui[0], {owner: SHELL, type: 'IntegerPicker', key: 'rippleSize', restart: 'none',
			prefserv: '', help: '', label: '', value: 5, min: 1, max: 100});
		assert.deepStrictEqual(luna.ui[1], {owner: SHELL, type: 'FilePicker', key: 'wallpaper', restart: 'none',
			prefserv: '', help: '', label: '', value: '', path: '/media/internal/wallpapers', filter: 'files', select: true});
	} finally {
		t.stop();
	}
});

test('scan leaves out what it cannot store, and takes the owner from the file name', async () => {
	const t = boot({files: {
		'patch-1.json': [{category: 'System', prefs: [
			{group: 'G', key: 'noValue', type: 'ToggleButton'},
			{group: 'G', key: 'noChoices', type: 'ListSelector', value: 'a'},
			{group: 'G', key: 'slider', type: 'Slider', value: 3},
			{key: 'noGroup', type: 'ToggleButton', value: true},
			{group: 'G', key: 'ok', type: 'ToggleButton', value: false}]}],
		'notes.txt': 'not a preference file',
		'broken.json': '[ {',
		'object.json': {category: 'phone', prefs: [dialPad]}
	}});
	try {
		await t.request('scan', {});
		const s = stored(t);
		assert.deepStrictEqual(s.system.g.map(e => [e.owner, e.key]), [['patch-1', 'ok']]);
		assert.deepStrictEqual(s.phone, {});
	} finally {
		t.stop();
	}
});

test('scan keeps a value chosen, in the same category and group', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		await t.request('scan', {});
		await t.request('set', {owner: SHELL, tabTitleCase: 'upperCase', carrierString: 'Mine'});
		// The shell moves carrierString to another group: its value goes back to the file's.
		const moved = shellPrefs.map(p => (p.key === 'carrierString' ? Object.assign({}, p, {group: 'Carrier'}) : p));
		fs.writeFileSync(path.join(t.dirs.app, SHELL + '.json'), JSON.stringify(prefFile('luna', SHELL, moved)));
		await t.request('scan', {});
		assert.deepStrictEqual(await t.request('get', {owner: SHELL, keys: ['tabTitleCase', 'carrierString']}),
			{returnValue: true, tabTitleCase: 'upperCase', carrierString: 'LuneOS'});
	} finally {
		t.stop();
	}
});

test('get answers the stored values, scanning first when the store does not hold one', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		// Nothing stored yet: the get scans.
		assert.deepStrictEqual(await t.request('get', {owner: PHONE, key: 'dialPadFeedback'}),
			{returnValue: true, dialPadFeedback: 'noFeedback'});
		assert.strictEqual(puts(t), 1);
		assert.deepStrictEqual(await t.request('get', {owner: SHELL, keys: ['tabTitleCase', 'showAndroidTab', 'nope']}),
			{returnValue: true, tabTitleCase: 'capitalizedCase', showAndroidTab: true});
		// The store held tabTitleCase and showAndroidTab, but not "nope": scanned again.
		assert.strictEqual(puts(t), 2);
		assert.deepStrictEqual(await t.request('get', {owner: SHELL, keys: []}), {returnValue: true});
		assert.strictEqual(puts(t), 2);
	} finally {
		t.stop();
	}
});

test('get and set refuse as the old service did', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		const refused = text => ({errorText: text, errorCode: -1, exception: '[object Object]', returnValue: false});
		assert.deepStrictEqual(await t.request('get', {key: 'x'}), refused('owner is required'));
		assert.deepStrictEqual(await t.request('get', {owner: SHELL}), refused('key or keys is required'));
		assert.deepStrictEqual(await t.request('set', {tabTitleCase: 'x'}), refused('owner is required'));
		assert.deepStrictEqual(await t.request('set', {owner: SHELL, a: 1, b: 2}), refused('No such tweak for ' + SHELL + ': a, b'));
		assert.deepStrictEqual(await t.request('set', {owner: 'nobody', tabTitleCase: 'x'}),
			refused('No such tweak for nobody: tabTitleCase'));
	} finally {
		t.stop();
	}
});

test('set stores the known keys, lists the unknown, and leaves $ arguments out', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		await t.request('scan', {});
		assert.deepStrictEqual(await t.request('set', {owner: SHELL, tabTitleCase: 'upperCase', nope: 1, $extra: 2}),
			{returnValue: true, unknown: ['nope']});
		assert.deepStrictEqual(await t.request('get', {owner: SHELL, key: 'tabTitleCase'}),
			{returnValue: true, tabTitleCase: 'upperCase'});
		const before = puts(t);
		// The same value again, and a call with only the owner: nothing to write.
		assert.deepStrictEqual(await t.request('set', {owner: SHELL, tabTitleCase: 'upperCase'}), {returnValue: true});
		assert.deepStrictEqual(await t.request('set', {owner: SHELL}), {returnValue: true});
		assert.strictEqual(puts(t), before);
	} finally {
		t.stop();
	}
});

test('sets that come in at once are each stored', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		await t.request('scan', {});
		const replies = await Promise.all([
			t.request('set', {owner: SHELL, tabTitleCase: 'upperCase'}),
			t.request('set', {owner: SHELL, carrierString: 'A'}),
			t.request('set', {owner: PHONE, dialPadFeedback: 'vibrateOnly'}),
			t.request('scan', {}),
			t.request('set', {owner: SHELL, carrierString: 'B'})
		]);
		assert.deepStrictEqual(replies, Array(5).fill({returnValue: true}));
		assert.deepStrictEqual(await t.request('get', {owner: SHELL, keys: ['tabTitleCase', 'carrierString']}),
			{returnValue: true, tabTitleCase: 'upperCase', carrierString: 'B'});
		assert.deepStrictEqual(await t.request('get', {owner: PHONE, key: 'dialPadFeedback'}),
			{returnValue: true, dialPadFeedback: 'vibrateOnly'});
	} finally {
		t.stop();
	}
});

test('a subscribed get is told of each change to its keys, until it cancels', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		await t.request('scan', {});
		const sub = t.open('get', {owner: SHELL, keys: ['tabTitleCase', 'carrierString'], subscribe: true});
		assert.deepStrictEqual(await sub.first, {returnValue: true, tabTitleCase: 'capitalizedCase', carrierString: 'LuneOS',
			subscribed: true});
		assert.strictEqual(t.bus.inflight, 1, 'an open subscription keeps the service from idling out');
		await t.request('set', {owner: SHELL, tabTitleCase: 'upperCase', showAndroidTab: false});
		await t.request('set', {owner: SHELL, showAndroidTab: true});
		await t.request('set', {owner: PHONE, dialPadFeedback: 'vibrateOnly'});
		await t.request('set', {owner: SHELL, tabTitleCase: 'upperCase'});
		await t.request('set', {owner: SHELL, carrierString: 'X', tabTitleCase: 'capitalizedCase'});
		await t.settle();
		assert.deepStrictEqual(sub.replies.slice(1), [
			{owner: SHELL, tabTitleCase: 'upperCase', returnValue: true, fired: true},
			{owner: SHELL, carrierString: 'X', tabTitleCase: 'capitalizedCase', returnValue: true, fired: true}]);
		sub.cancel();
		assert.strictEqual(t.prefs.subscribers, 0);
		assert.strictEqual(t.bus.inflight, 0);
		await t.request('set', {owner: SHELL, carrierString: 'Y'});
		await t.settle();
		assert.strictEqual(sub.replies.length, 3);
	} finally {
		t.stop();
	}
});

test('a subscribed get that fails ends there', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		const sub = t.open('get', {owner: SHELL, subscribe: true});
		assert.strictEqual((await sub.first).errorText, 'key or keys is required');
		assert.strictEqual(t.bus.subscriptions, 0);
		assert.strictEqual(t.bus.inflight, 0);
	} finally {
		t.stop();
	}
});

test('a subscription cancelled before its first reply gets none, and is not kept', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		const sub = t.open('get', {owner: SHELL, key: 'tabTitleCase', subscribe: true});
		sub.cancel();
		await t.settle();
		assert.strictEqual(sub.replies.length, 0);
		assert.strictEqual(t.prefs.subscribers, 0);
		assert.strictEqual(t.bus.inflight, 0);
		await t.request('set', {owner: SHELL, tabTitleCase: 'upperCase'});
		await t.settle();
		assert.strictEqual(sub.replies.length, 0);
	} finally {
		t.stop();
	}
});

test('"subscribe" on another method is a tweak key, as it was', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		assert.deepStrictEqual(await t.request('set', {owner: SHELL, subscribe: true}),
			{errorText: 'No such tweak for ' + SHELL + ': subscribe', errorCode: -1, exception: '[object Object]',
				returnValue: false});
		assert.strictEqual(t.bus.subscriptions, 0);
	} finally {
		t.stop();
	}
});

test('list gives the files or the directories of a path', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		const tree = path.join(t.dirs.root, 'tree');
		fs.mkdirSync(path.join(tree, 'sub'), {recursive: true});
		fs.writeFileSync(path.join(tree, 'a.png'), 'x');
		const files = await t.request('list', {path: tree});
		assert.deepStrictEqual(files, {returnValue: true, files: [{label: 'a.png', value: tree + '/a.png'}]});
		assert.deepStrictEqual(await t.request('list', {path: tree, filter: 'dirs'}),
			{returnValue: true, files: [{label: 'sub', value: tree + '/sub'}]});
		assert.deepStrictEqual(await t.request('list', {path: tree, filter: 'other'}), {returnValue: true, files: []});
	} finally {
		t.stop();
	}
});

test('list refuses a path it cannot read (bug 3)', async () => {
	const t = boot({});
	try {
		const missing = path.join(t.dirs.root, 'missing');
		assert.deepStrictEqual(await t.request('list', {path: missing}), {errorText: 'ENOENT: no such file or directory, ' +
			'scandir \'' + missing + '\'', errorCode: -1, exception: '[object Object]', returnValue: false});
	} finally {
		t.stop();
	}
});

test('list leaves out an entry it cannot stat (bug 4)', async () => {
	const t = boot({});
	try {
		const tree = path.join(t.dirs.root, 'tree');
		fs.mkdirSync(tree, {recursive: true});
		fs.writeFileSync(path.join(tree, 'a.png'), 'x');
		fs.symlinkSync(path.join(tree, 'gone'), path.join(tree, 'dangling'));
		assert.deepStrictEqual(await t.request('list', {path: tree}),
			{returnValue: true, files: [{label: 'a.png', value: tree + '/a.png'}]});
	} finally {
		t.stop();
	}
});

// readdir in name order, so the test does not depend on the file system's.
function sortedReaddir(fn) {
	const orig = fs.readdirSync;
	fs.readdirSync = (...a) => orig.apply(fs, a).slice().sort();
	return Promise.resolve().then(fn).finally(() => {
		fs.readdirSync = orig;
	});
}

test('after a FilePicker tweak, the rest of its directory is read from that directory (bug 1)', () => sortedReaddir(async () => {
	const t = boot({files: {
		'a-shell.json': prefFile('luna', SHELL, shellPrefs),
		'b-phone.json': prefFile('phone', PHONE, [dialPad])
	}});
	try {
		assert.deepStrictEqual(await t.request('scan', {}), {returnValue: true});
		assert.deepStrictEqual(await t.request('get', {owner: PHONE, key: 'dialPadFeedback'}),
			{returnValue: true, dialPadFeedback: 'noFeedback'});
		assert.strictEqual(stored(t).luna.ui[1].path, '/media/internal/wallpapers');
	} finally {
		t.stop();
	}
}));

test('a broken entry, tweak or file is left out, and the rest stored (bug 2)', async () => {
	const t = boot({files: Object.assign({
		'patch.json': [{owner: 'x', prefs: [dialPad]}, null, {category: 7, prefs: [dialPad]}, {category: '_kind', prefs: [dialPad]},
			{category: 'System', owner: 'x', prefs: [null, 'text', {group: 3, key: 'k', type: 'ToggleButton', value: true},
				{group: '__proto__', key: 'k', type: 'ToggleButton', value: true},
				{group: 'constructor', key: 'k', type: 'ToggleButton', value: true}]}]
	}, FILES), appFiles: APP_FILES});
	fs.mkdirSync(path.join(t.dirs.sys, 'folder.json'));
	try {
		assert.deepStrictEqual(await t.request('scan', {}), {returnValue: true});
		assert.deepStrictEqual(await t.request('get', {owner: PHONE, key: 'dialPadFeedback'}),
			{returnValue: true, dialPadFeedback: 'noFeedback'});
		const s = stored(t);
		assert.strictEqual(s._kind, KIND);
		assert.deepStrictEqual(s.system.constructor.map(e => [e.owner, e.key]), [['x', 'k']]);
		assert.deepStrictEqual(Object.keys(s.system), ['constructor']);
	} finally {
		t.stop();
	}
});

test('db8 failing is answered as Foundations\' PalmCall failed', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		t.db.failNext('find', {returnValue: false, errorCode: -3970, errorText: 'kind not registered: \'' + KIND + '\''});
		const r = await t.request('get', {owner: PHONE, key: 'dialPadFeedback'});
		assert.strictEqual(r.errorCode, -3970);
		assert.strictEqual(r.errorText, 'palm://com.palm.db/find {"query":{"from":"' + KIND + '","limit":2}}: ' +
			'kind not registered: \'' + KIND + '\'');
		t.db.failNext('put', {returnValue: false});
		const s = await t.request('scan', {});
		assert.strictEqual(s.errorCode, -1);
		assert.match(s.errorText, /^palm:\/\/com\.palm\.db\/put \{"objects":.*: Unknown PalmCall failure$/);
	} finally {
		t.stop();
	}
});

test('two stored objects fail every call', async () => {
	const t = boot({files: FILES, appFiles: APP_FILES});
	try {
		t.db.seed({_kind: KIND, phone: {}});
		t.db.seed({_kind: KIND, luna: {}});
		const r = await t.request('get', {owner: PHONE, key: 'dialPadFeedback'});
		assert.strictEqual(r.errorCode, -9999);
		assert.strictEqual(r.errorText, 'MojoService: no errorCode supplied More than 1 preferences object found');
		assert.match(r.exception, /^Error: More than 1 preferences object found\n/);
	} finally {
		t.stop();
	}
});

test('an unknown method and the bus\'s own info', async () => {
	const t = boot({});
	try {
		assert.strictEqual((await t.request('nosuch', {})).returnValue, false);
		const info = await t.request('info', {});
		assert.deepStrictEqual(info.methods, ['list', 'scan', 'get', 'set', 'quit', 'info']);
	} finally {
		t.stop();
	}
});
