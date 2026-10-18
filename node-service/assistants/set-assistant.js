var SetCommandAssistant = function() {
}

//

SetCommandAssistant.prototype.setup = function() {  
}

/*
 * Every argument but "owner" names a tweak of that owner. One that no
 * preference file declares is not stored; a call that names none that are
 * fails, rather than answering returnValue true for a change that went
 * nowhere.
 */
SetCommandAssistant.prototype.run = function(future) {
	var args = this.controller.args;

	// mojoservice turns a plain result into returnValue true whatever it
	// says, so a refusal has to be an exception.
	if(!args.owner) {
		future.exception = { errorCode: -1, message: "owner is required" };
		return;
	}

	var values = {};

	for(var key in args) {
		if((key == "owner") || (key.charAt(0) == "$"))
			continue;

		values[key] = args[key];
	}

	future.nest(prefs.update(args.owner, values));

	future.then(this, function(future) {
		var outcome = future.result;

		if((outcome.unknown.length > 0) &&
			(outcome.unknown.length == Object.keys(values).length))
		{
			future.exception = { errorCode: -1,
				message: "No such tweak for " + args.owner + ": " + outcome.unknown.join(", ") };
		}
		else if(outcome.unknown.length > 0)
			future.result = { returnValue: true, unknown: outcome.unknown };
		else
			future.result = { returnValue: true };
	});
}

SetCommandAssistant.prototype.cleanup = function() {  
}
