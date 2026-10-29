// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

/*
	A stand-in palmbus for running the service on the host (after the
	contacts linker's tests/palmbus.js): outgoing calls go to
	onCall(uri, args, sender) -> a reply, an array of replies, or undefined
	(never replies); open() delivers a call to a registered service and
	keeps every reply it gets, request() resolves with the first.
	cancel() on what open() gives ends it as the hub does when a subscriber
	goes away: a "cancel" event on the service's handle, for a call it
	registered with subscriptionAdd.
*/
'use strict';

const {EventEmitter} = require('events');

function createPalmbus(onCall) {
	const services = {};
	let token = 0;

	function Handle(name) {
		EventEmitter.call(this);
		this.name = name || '';
		this.methods = [];
		this.subscribed = new Map();
		if (name) {
			services[name] = this;
		}
	}
	Object.setPrototypeOf(Handle.prototype, EventEmitter.prototype);
	Handle.prototype.registerMethod = function (category, method) {
		this.methods.push((category || '/') + method);
	};
	Handle.prototype.subscriptionAdd = function (key, message) {
		this.subscribed.set(String(key), message);
	};
	Handle.prototype.unregister = function () {
		this.unregistered = true;
	};
	Handle.prototype.pushRole = function () {};
	Handle.prototype.call = function (uri, payload) {
		const req = new EventEmitter();
		const args = JSON.parse(payload);
		req.cancel = function () {
			req.cancelled = true;
		};
		const self = this;
		setImmediate(async function () {
			let r;
			try {
				r = await onCall(uri.replace(/^palm:/, 'luna:'), args, self.name);
			} catch (e) {
				r = {returnValue: false, errorCode: -1, errorText: String(e && e.stack || e)};
			}
			if (r === undefined) {
				return;
			}
			for (const next of Array.isArray(r) ? r : [r]) {
				const one = await next;
				if (req.cancelled) {
					return;
				}
				req.emit('response', {payload: () => JSON.stringify(one)});
			}
		});
		return req;
	};
	Handle.prototype.callOneReply = Handle.prototype.call;
	Handle.prototype.watch = Handle.prototype.call;
	Handle.prototype.subscribe = Handle.prototype.call;

	// A call to the service registered as name: {replies (parsed), first (a promise), cancel()}.
	function open(name, method, payload, caller) {
		caller = caller || {};
		const h = services[name];
		if (!h) {
			throw new Error('no service ' + name);
		}
		token++;
		const t = String(token);
		const replies = [];
		let resolveFirst;
		const first = new Promise(resolve => {
			resolveFirst = resolve;
		});
		const msg = {
			method: () => method,
			category: () => '/',
			payload: () => JSON.stringify(payload || {}),
			uniqueToken: () => t,
			token: () => Number(t),
			applicationID: () => caller.appId || '',
			senderServiceName: () => caller.service || '',
			sender: () => caller.service || caller.appId || '',
			isSubscription: () => !!(payload && payload.subscribe),
			respond: text => {
				replies.push(JSON.parse(text));
				if (replies.length === 1) {
					resolveFirst(replies[0]);
				}
				return true;
			}
		};
		h.emit('request', msg);
		return {
			replies,
			first,
			cancel() {
				if (h.subscribed.has(t)) {
					h.subscribed.delete(t);
					h.emit('cancel', msg);
				}
			}
		};
	}

	function request(name, method, payload, caller) {
		return open(name, method, payload, caller).first;
	}

	return {Handle, services, open, request, setAppId() {}};
}

module.exports = {createPalmbus};
