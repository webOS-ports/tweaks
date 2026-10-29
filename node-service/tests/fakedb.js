// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	An in-memory db8, as much of it as the tweaks service uses, written to
	what db8 did on the LuneOS VM (2026-10-29):

	- find {query: {from, limit}}: the kind's records by _id, at most limit
	- put: a new _id when there is none, a new _rev only when the object
	  changed, and every object in an array an _id of its own ("28f", as
	  db8 numbers them); an object whose _rev is not the stored one is
	  refused, -3961 "db: revision mismatch - expected <stored>, got <given>"
	- a kind with "sync": true gets _sync: true
	- what find gives has its properties in sorted order, at every level
	- a kind it does not have: -3970 "kind not registered: '<kind>'"

	failNext(method, reply) makes the next call of that method answer reply.
*/

const KINDS = {'org.webosports.tweaks:1': {sync: true}};

function clone(v) {
	return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

// A copy with the properties of every object in sorted order, as db8 hands them back.
function sorted(v) {
	if (Array.isArray(v)) {
		return v.map(sorted);
	}
	if (v && typeof v === 'object') {
		const out = {};
		for (const k of Object.keys(v).sort()) {
			out[k] = sorted(v[k]);
		}
		return out;
	}
	return v;
}

function createFakeDb() {
	const records = new Map();
	const calls = [];
	const failures = {};
	let rev = 1000;
	let nextId = 1;
	let nextSub = 0x200;

	function newId() {
		return 'T' + String(nextId++).padStart(8, '0');
	}

	function idArrays(v) {
		if (Array.isArray(v)) {
			for (const e of v) {
				if (e && typeof e === 'object' && !Array.isArray(e) && !e._id) {
					e._id = (nextSub++).toString(16);
				}
				idArrays(e);
			}
		} else if (v && typeof v === 'object') {
			for (const k of Object.keys(v)) {
				idArrays(v[k]);
			}
		}
	}

	function strip(r) {
		const c = clone(r);
		delete c._rev;
		return JSON.stringify(c);
	}

	function error(code, text) {
		return {returnValue: false, errorCode: code, errorText: text};
	}

	function put(objects) {
		for (const o of objects) {
			if (!o || !KINDS[o._kind]) {
				return error(-3970, 'kind not registered: \'' + (o && o._kind) + '\'');
			}
			const old = o._id && records.get(o._id);
			if (old && o._rev !== undefined && o._rev !== old._rev) {
				return error(-3961, 'db: revision mismatch - expected ' + old._rev + ', got ' + o._rev);
			}
		}
		const results = objects.map(o => {
			const r = clone(o);
			r._id = r._id || newId();
			if (KINDS[r._kind].sync) {
				r._sync = true;
			}
			idArrays(r);
			const old = records.get(r._id);
			if (old && strip(old) === strip(r)) {
				return {id: r._id, rev: old._rev};
			}
			r._rev = ++rev;
			records.set(r._id, r);
			return {id: r._id, rev: r._rev};
		});
		return {returnValue: true, results};
	}

	function find(query) {
		query = query || {};
		if (!KINDS[query.from]) {
			return error(-3970, 'kind not registered: \'' + query.from + '\'');
		}
		const list = Array.from(records.values()).filter(r => r._kind === query.from && !r._del)
			.sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
		return {returnValue: true, results: sorted(list.slice(0, query.limit || 500))};
	}

	// luna://com.palm.db/<method> for a stand-in bus.
	async function handle(method, args) {
		calls.push({method, args: clone(args)});
		if (failures[method] && failures[method].length) {
			return failures[method].shift();
		}
		args = args || {};
		switch (method) {
		case 'find':
			return find(args.query);
		case 'put':
			return put(args.objects || []);
		default:
			return error(-1, 'Unknown method "' + method + '" for category "/"');
		}
	}

	function failNext(method, reply) {
		(failures[method] = failures[method] || []).push(reply);
	}

	// Tests and the A/B: every record of the kind, or a record stored as it is given.
	function all(kind) {
		return Array.from(records.values()).filter(r => r._kind === kind).map(clone);
	}
	function seed(obj) {
		return put([obj]).results[0];
	}

	return {handle, all, seed, failNext, calls, records};
}

module.exports = {createFakeDb};
