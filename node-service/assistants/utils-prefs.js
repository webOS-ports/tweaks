var prefs = (function() {
	var that = {};

	var Foundations = IMPORTS.foundations;

	var Future = IMPORTS.foundations.Control.Future;

	var DB = Foundations.Data.DB;

	var DB_KIND = "org.webosports.tweaks:1";

	var defaultPrefs = function() {
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
	};

	/*
	 * The tweaks the installed preference files declare, with the values
	 * already chosen carried over from "config". This is what /scan stores;
	 * /get and /set run it themselves when they are asked about a tweak the
	 * store does not hold yet, so nothing depends on the Tweaks app having
	 * been opened first.
	 */
	var buildConfig = function(config) {
		var newConfig = {
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

		function scanDirectory(path) {
			var fs = IMPORTS.require('fs');

			console.log("Scanning path " + path);

			try {
				var files = fs.readdirSync(path);
			}
			catch(error) {
				return false;
			}

			for(var fileIdx = 0; fileIdx < files.length; fileIdx++) {
				if(files[fileIdx].slice(files[fileIdx].length - 5) == ".json") {
					var fileId = files[fileIdx].slice(0, files[fileIdx].length - 5);
					var filePath = path + '/' + files[fileIdx];
					console.log("Reading tweak " + filePath);

					var fileData = fs.readFileSync(filePath, 'utf8');

					try { var jsonData = JSON.parse(fileData); } catch(error) { continue; }	

					if(jsonData instanceof Array) {
						for(var i = 0; i < jsonData.length; i++) {
							var category = jsonData[i].category.toLowerCase();
							var owner = jsonData[i].owner || fileId;

							if((jsonData[i].prefs) && (jsonData[i].prefs.length)) {
								if(!newConfig[category])
									newConfig[category] = {}; 

								for(var j = 0; j < jsonData[i].prefs.length; j++) {
									if(jsonData[i].prefs[j].group) {
										var group = jsonData[i].prefs[j].group.toLowerCase();

										if(newConfig[category][group] == undefined)
											newConfig[category][group] = [];

										if(jsonData[i].prefs[j].key) {
											var key = jsonData[i].prefs[j].key;

											var help = "";
											var label = "";
											var restart = "none";
											var prefserv = "";

											if(jsonData[i].prefs[j].help)
												help = jsonData[i].prefs[j].help;

											if(jsonData[i].prefs[j].label)
												label = jsonData[i].prefs[j].label;

											if(jsonData[i].prefs[j].restart)
												restart = jsonData[i].prefs[j].restart;

											if(jsonData[i].prefs[j].prefserv)
												prefserv = jsonData[i].prefs[j].prefserv;

											if(jsonData[i].prefs[j].value != undefined) {
												var value = jsonData[i].prefs[j].value;

												// Lets fetch the old value and use it...

												if((config[category]) && (config[category][group])) {
													for(var k = 0; k < config[category][group].length; k++) {
														if((config[category][group][k].owner == owner) &&
															(config[category][group][k].key == key))
														{
															value = config[category][group][k].value;

															break;
														}
													}
												}

												if(jsonData[i].prefs[j].type == "IntegerPicker") {
													var minValue = 0;
													var maxValue = 100;

													if(jsonData[i].prefs[j].min)
														minValue = jsonData[i].prefs[j].min;

													if(jsonData[i].prefs[j].max)
														maxValue = jsonData[i].prefs[j].max;

													newConfig[category][group].push({
														owner: owner, type: "IntegerPicker", 
														key: key, restart: restart, prefserv: prefserv,
														help: help, label: label, value: value,
														min: minValue, max: maxValue});
												}
												else if(jsonData[i].prefs[j].type == "ListSelector") {
													if(jsonData[i].prefs[j].choices) {
														var choices = jsonData[i].prefs[j].choices;

														newConfig[category][group].push({
															owner: owner, type: "ListSelector", 
															key: key, restart: restart, prefserv: prefserv,
															help: help, label: label, value: value,
															choices: choices});
													}
												}
												else if(jsonData[i].prefs[j].type == "TextField") {
													var input = "text";

													if(jsonData[i].prefs[j].input)
														input = jsonData[i].prefs[j].input;

													newConfig[category][group].push({
														owner: owner, type: "TextField", 
														key: key, restart: restart, prefserv: prefserv,
														help: help, label: label, value: value,
														input: input});
												}
												else if(jsonData[i].prefs[j].type == "ToggleButton") {
													newConfig[category][group].push({
														owner: owner, type: "ToggleButton", 
														key: key, restart: restart, prefserv: prefserv,
														help: help, label: label, value: value});
												}
												else if(jsonData[i].prefs[j].type == "FilePicker") {
													var path = "/media/internal/downloads";

													if(jsonData[i].prefs[j].path)
														path = jsonData[i].prefs[j].path;

													var filter = "files";

													if(jsonData[i].prefs[j].filter)
														filter = jsonData[i].prefs[j].filter;

													var select = "single";

													if(jsonData[i].prefs[j].select == true)
														select = jsonData[i].prefs[j].select;

													newConfig[category][group].push({
														owner: owner, type: "FilePicker", 
														key: key, restart: restart, prefserv: prefserv,
														help: help, label: label, value: value,
														path: path, filter: filter, select: select});
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}

			return true;
		}

		scanDirectory("/usr/palm/services/org.webosports.service.tweaks.prefs/preferences");
		scanDirectory("/media/cryptofs/apps/usr/palm/services/org.webosports.service.tweaks.prefs/preferences");

		return newConfig;
	};
//

	var loadPrefs = function() {
		var future = DB.find({ from: DB_KIND, limit: 2 });

		future.then(this, function(future) {
			var result = future.result;
			
			var len = result.results ? result.results.length : 0;
			
			if (len === 0)
				future.result = defaultPrefs();
			else if (len > 1)
				throw new Error("More than 1 preferences object found");
			else
				future.result = result.results[0];
		});

		return future;
	};

	var savePrefs = function(prefs) {
		var future = DB.put([prefs]);

		future.then(this, function(future) {
			var result = future.result;
		
			future.result = { returnValue: true };
		});

		return future;
	};

	/*
	 * The stored entry for one tweak, or null. The object also holds _id,
	 * _kind and _rev, which are strings rather than categories.
	 */
	var findTweak = function(config, owner, key) {
		for(var category in config) {
			if((!config[category]) || (typeof config[category] !== "object"))
				continue;

			for(var group in config[category]) {
				var tweaks = config[category][group];

				if(!(tweaks instanceof Array))
					continue;

				for(var i = 0; i < tweaks.length; i++) {
					if((tweaks[i].owner == owner) && (tweaks[i].key == key))
						return tweaks[i];
				}
			}
		}

		return null;
	};

	var holdsAll = function(config, owner, keys) {
		for(var i = 0; i < keys.length; i++) {
			if(!findTweak(config, owner, keys[i]))
				return false;
		}

		return true;
	};

	/*
	 * Writes, one at a time. Each is a load, a change and a put of the whole
	 * object, so two running together would both start from the same _rev,
	 * and Settings writes a text tweak on every keystroke.
	 */
	var queue = [];
	var writing = false;

	var runNext = function() {
		if((writing) || (queue.length === 0))
			return;

		writing = true;

		var job = queue.shift();
		var future;

		try {
			future = job.work();
		}
		catch(error) {
			writing = false;
			job.done.exception = error;
			runNext();
			return;
		}

		future.then(function(future) {
			writing = false;

			try {
				job.done.result = future.result;
			}
			catch(error) {
				job.done.exception = error;
			}

			runNext();
		});
	};

	var enqueue = function(work) {
		var done = new Future();

		queue.push({ work: work, done: done });
		runNext();

		return done;
	};

	/*
	 * The stored object, scanned first if a tweak asked about is not in it:
	 * then the preference files are read again and the result stored, which
	 * is what /scan does. Gives the object read back after that.
	 */
	var loadHolding = function(owner, keys) {
		var future = loadPrefs();

		future.then(this, function(future) {
			var config = future.result;

			if(holdsAll(config, owner, keys)) {
				future.result = config;
				return;
			}

			console.log("WebOS Tweaks: rescanning for " + owner + "/" + keys.join(","));

			future.nest(savePrefs(buildConfig(config)));

			future.then(this, function(future) {
				var saved = future.result;

				future.nest(loadPrefs());
			});
		});

		return future;
	};

	/*
	 * Clients following tweaks through /get with "subscribe": true, each with
	 * the owner and keys it asked for and the mojoservice future factory its
	 * replies go out through.
	 */
	var subscribers = [];

	var notify = function(owner, changed) {
		for(var i = 0; i < subscribers.length; i++) {
			var subscriber = subscribers[i];

			if(subscriber.owner != owner)
				continue;

			var reply = { owner: owner };
			var any = false;

			for(var j = 0; j < subscriber.keys.length; j++) {
				if(changed.hasOwnProperty(subscriber.keys[j])) {
					reply[subscriber.keys[j]] = changed[subscriber.keys[j]];
					any = true;
				}
			}

			if(any)
				subscriber.replies.get().result = reply;
		}
	};

// Public functions...

	that.load = function() {
		var future = loadPrefs();
		
		future.then(this, function(future) {
			console.log("WebOS Tweaks preferences loaded");

			var result = future.result;

			future.result = result;
		});
		
		return future;
	};

	that.save = function(prefs) {
		var future = new Future();		
		
		future.nest(savePrefs(prefs));
		
		future.then(this, function(future) {
			console.log("WebOS Tweaks preferences saved");

			future.result = { returnValue: true };
		});

		return future;
	};

	that.build = buildConfig;

	that.find = findTweak;

	/*
	 * The /scan store: what the preference files declare, keeping the values
	 * already set. Queued with the writes, as it is one.
	 */
	that.scan = function() {
		return enqueue(function() {
			var future = loadPrefs();

			future.then(this, function(future) {
				future.nest(that.save(buildConfig(future.result)));
			});

			return future;
		});
	};

	/*
	 * The stored object for reading the given tweaks. A tweak missing from it
	 * gets the store scanned first, in the write queue.
	 */
	that.loadFor = function(owner, keys) {
		var future = loadPrefs();

		future.then(this, function(future) {
			var config = future.result;

			if(holdsAll(config, owner, keys))
				future.result = config;
			else
				future.nest(enqueue(function() { return loadHolding(owner, keys); }));
		});

		return future;
	};

	/*
	 * Set the given tweaks of one owner, store them and tell the subscribers.
	 * Gives { changed: {key: value}, unknown: [key] }; a key no preference
	 * file declares for that owner is left alone and listed as unknown.
	 */
	that.update = function(owner, values) {
		var keys = Object.keys(values);

		return enqueue(function() {
			var changed = {};
			var unknown = [];
			var future = loadHolding(owner, keys);

			future.then(this, function(future) {
				var config = future.result;
				var dirty = false;

				for(var i = 0; i < keys.length; i++) {
					var tweak = findTweak(config, owner, keys[i]);

					if(!tweak) {
						unknown.push(keys[i]);
						continue;
					}

					if(JSON.stringify(tweak.value) !== JSON.stringify(values[keys[i]])) {
						tweak.value = values[keys[i]];
						changed[keys[i]] = values[keys[i]];
						dirty = true;
					}
				}

				if(!dirty) {
					future.result = { changed: changed, unknown: unknown };
					return;
				}

				future.nest(that.save(config));

				future.then(this, function(future) {
					var saved = future.result;

					notify(owner, changed);

					future.result = { changed: changed, unknown: unknown };
				});
			});

			return future;
		});
	};

	that.subscribe = function(owner, keys, replies) {
		var subscriber = { owner: owner, keys: keys, replies: replies };

		subscribers.push(subscriber);

		return subscriber;
	};

	that.unsubscribe = function(subscriber) {
		var at = subscribers.indexOf(subscriber);

		if(at >= 0)
			subscribers.splice(at, 1);
	};

	return that;
}());
