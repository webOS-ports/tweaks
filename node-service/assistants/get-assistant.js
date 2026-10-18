var GetCommandAssistant = function() {
}

//

GetCommandAssistant.prototype.setup = function() {  
}

/*
 * With "subscribe": true the caller stays subscribed and gets a reply with
 * {owner, key: value} whenever /set changes one of the keys it asked for.
 */
GetCommandAssistant.prototype.run = function(future, subscription) {
	var args = this.controller.args;

	// mojoservice turns a plain result into returnValue true whatever it
	// says, so a refusal has to be an exception.
	if(!args.owner) {
		future.exception = { errorCode: -1, message: "owner is required" };
		return;
	}

	if((!args.key) && (!args.keys)) {
		future.exception = { errorCode: -1, message: "key or keys is required" };
		return;
	}

	var keys = [];

	if(args.key)
		keys.push(args.key);
	else
		keys = args.keys;

	future.nest(prefs.loadFor(args.owner, keys));

	future.then(this, function(future) {
		var config = future.result;

		var result = { returnValue: true };

		for(var i = 0; i < keys.length; i++) {
			var tweak = prefs.find(config, args.owner, keys[i]);

			if(tweak)
				result[keys[i]] = tweak.value;
		}

		// Registered before this reply goes out, so no change falls between.
		if(subscription) {
			this.subscriber = prefs.subscribe(args.owner, keys, subscription);
			result.subscribed = true;
		}

		future.result = result;
	});
}

GetCommandAssistant.prototype.cancelSubscription = function() {
	if(this.subscriber) {
		prefs.unsubscribe(this.subscriber);
		this.subscriber = null;
	}
}

GetCommandAssistant.prototype.cleanup = function() {  
}
