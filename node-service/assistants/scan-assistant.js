var ScanCommandAssistant = function() {
}

//

ScanCommandAssistant.prototype.setup = function() {  
}

ScanCommandAssistant.prototype.run = function(future) {
	future.nest(prefs.scan());

	future.then(this, function(future) {
		var result = future.result;

		future.result = { returnValue: true};
	});
}

ScanCommandAssistant.prototype.cleanup = function() {  
}
