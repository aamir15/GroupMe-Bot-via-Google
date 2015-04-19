/*global UrlFetchApp:true*/
var config = {
		bot: {
			id: "ac098e4046fa7d3d8d9601b441",
			name: ""
		},

		messages: {
			keygen: {
				multiplier: 1000000,
				make: function () {
					return Math.floor((Math.random() * this.multiplier));
				}
			},
			send: {
				url: "https://api.groupme.com/v3/bots/post"
			}
		},

		//File to load the configuration from.
		file: ""
	},

	//MARK: "Classes"
	//Messages
	GroupMeMessage,
	GroupMeAttachmentFactory,
	GroupMeMessageSender,
	GroupMeDecodedMessage,
	GroupMeMessageDecoder,

	//Command
	BotCommand,
	BotTask,
	GroupMeBot;

//Classes Etc...

//MARK: GroupMe Messages
/**
Message object that acts as a GroupMe message.

Variables:
- .text         (String)
- .attachments  ([Object])    //See GroupMeAttachmentFactory
*/
GroupMeMessage = function (id, handler) {
	this.init(id, handler);
};

GroupMeMessage.prototype = {

	init: function (id, handler) {
		this.id = id;
		this.handler = handler;
	},

	send: function () {
		this.handler.sendMessage(this);
	},

	/**
	Builds the Message Payload for this message for a GroupMeMessageSender.
	*/
	buildPayload: function () {
		var payload = {
			text: this.text
		};

		if (this.attachments) {
			payload.attachments = this.attachments;
		}

		return payload;
	}

};

/**
Utility object for creating different types of GroupMe attachments.

Functions
- .makeImage(url)
- .makeLocation(lat, lng, name)
- .makeEmoji(TODO...)
*/
GroupMeAttachmentFactory = {

	makeImage: function (url) {
		return {
			type: "image",
			url: url
		};
	},
	makeLocation: function (lat, lng, name) {
		return {
			type: "location",
			lat: lat,
			lng: lng,
			name: name
		};
	}


	//TODO: Add Remaining types. Someone figure out the emoji charmap if we got time. Can also make a dictionary/object of all that for easy access.

	/*
	{
	      "type": "image",
	      "url": "http://i.groupme.com/123456789"
	    },
	    {
	      "type": "location",
	      "lat": "40.738206",
	      "lng": "-73.993285",
	      "name": "GroupMe HQ"
	    },
	    {
	      "type": "split",
	      "token": "SPLIT_TOKEN"
	    },
	    {
	      "type": "emoji",
	      "placeholder": "☃",
	      "charmap": [
	        [
	          1,
	          42
	        ],
	        [
	          2,
	          34
	        ]
	      ]
	    }
	*/
};

/**
Factory and sender for GroupMeMessage objects.
*/
GroupMeMessageSender = function () {};

GroupMeMessageSender.prototype = {

	makeMessageId: function () {
		return config.messages.keygen.make();
	},

	makeMessage: function () {
		var messageId = this.makeMessageId();
		return new GroupMeMessage(messageId, this);
	},

	getMessagePayload: function (message) {
		var payload = message.buildPayload();

		payload.bot_id = config.bot.id;
		payload.source_guid = message.id;

		return payload;
	},

	sendMessage: function (message) {
		var options = {
			"method": "post",
			"payload": this.getMessagePayload(message)
		};

		UrlFetchApp.fetch(config.messages.send.url, options);
	}

};

/**
Represents a message recieved from GroupMe. 
*/
GroupMeDecodedMessage = function (data) {
	this.init(data);
};

GroupMeDecodedMessage.prototype = {

	init: function (data) {

		/*
    {
  "attachments": [],
  "avatar_url": "http://i.groupme.com/123456789",
  "created_at": 1302623328,
  "group_id": "1234567890",
  "id": "1234567890",
  "name": "John",
  "sender_id": "12345",
  "sender_type": "user",
  "source_guid": "GUID",
  "system": false,
  "text": "Hello world ☃☃",
  "user_id": "1234567890"
}
    */

		this.data = data;
	},

	/*
		Parses a command from the text.
		
		Command Syntax: 
		
		!command arg1 arg2 arg3...
	*/
	parseCommand: function () {
		var text = this.data.text,
			isCommand = false, //TODO: Use regex or just see if it follow the pattern. See below.
			command = null;

		if (isCommand) {
			//TODO: Attempts to parse the text for a command. Use regex to see if it might be, and then split the string accordingly, and make a BotCommand instance.
		}

		return command;
	},

	getCommand: function () {

		//Lazy loading/parsing of command.
		if (this.command === undefined) {
			this.command = this.parseCommand();
		}

		return this.command;
	},

	isCommand: function () {
		return this.getCommand() !== null;
	}

	//TODO: Add any helper functions. (hasAttachments, etc.)

};

GroupMeMessageDecoder = function () {};

GroupMeMessageDecoder.prototype = {

	/**
	Decodes the message to a more structured format.
	*/
	decode: function (json) {
		var parsedMessage = JSON.parse(json),
			decodedMessage = new GroupMeDecodedMessage(parsedMessage);

		return decodedMessage;
	}

};

//MARK: Bot Command
/**
BotCommand
.name (String)
.args [Object]
*/
BotCommand = function (name, args) {
	this.init(name, args);
};

BotCommand.prototype = {

	init: function (name, args) {

		if (name) {
			this.name = name;
		} else {
			throw "BotCommand types must have a name.";
		}

		this.args = args;
	}

};

/**
BotTask
.validate([string])
.run(GroupMeBot, [string]) (function)
*/
BotTask = function (config) {
	this.init(config);
};

BotTask.prototype = {

	init: function (config) {
		this.config = config;
	},

	validate: function (args) {
		var valid = true;

		if (this.config.validate) {
			valid = this.config.validate(args);
		}

		return valid;
	},

	run: function (bot, args) {
		var canRun = this.validate(args);

		if (canRun) {
			this.config.run(bot, args);
		}
	}

};

//MARK: Bot
GroupMeBot = function (config) {
	this.init(config);
};

GroupMeBot.prototype = {

	init: function (config) {
		this.config = config;
	},

	//MARK: Messages
	/**
	The bot interprets and uses the passed message.
	*/
	runWithMessage: function (json) {
		var message = this.config.messages.decoder.decode(json);
		this.useDecodedMessage(message);
	},

	useDecodedMessage: function (decodedMessage) {
		if (decodedMessage.isCommand()) {
			var command = decodedMessage.getCommand();
			this.runTaskWithCommand(command);
		}
	},

	//MARK: Tasks
	/**
	The bot runs all its tasks.
	*/
	runTasks: function () {
		var tasks = this.config.tasks,
			filteredTasks = [];

		//TODO: Loop through tasks and filter those that should be run, then loop through them.


		//TODO: For each task in filteredTasks, run it.

	},

	//MARK: Running Tasks
	runTaskWithCommand: function (command) {
		var task = this.config.tasks[command.name],
			args = command.args;

		if (task !== null) {
			this.runTask(task, args);
		} else {
			this.sendError('No Task Available', 'No task was available with the name "' + command.name + '."');
		}
	},

	runTask: function (task, args) {
		task.run(this, args);
	},

	//MARK: Responses
	/*
		Convenience function to create a new GroupMeMessage using the configuration.
	*/
	makeMessage: function () {
		return this.config.messages.sender.makeMessage();
	},

	/*
		Convenience function for sending text.
	*/
	sendText: function (text) {
		var message = this.makeMessage();
		message.text = text;
		message.send();
	},

	/*
		Convenience function for sending error messages.
	*/
	sendError: function (type, message) {
		//TODO: Send an error.
		this.sendText('Error: ' + type + ' - ' + message);
	}

};

//MARK: Tasks					  
var task_helloWorld = new BotTask({
	run: function (bot) {
		bot.sendMessage("Hello World.");
	}
});

//MARK: Start
var GLOBAL_BOT = {
	messages: {
		sender: new GroupMeMessageSender(),
		decoder: new GroupMeMessageDecoder()
	},
	//Tasks available to the bot via key.
	tasks: {
		hello: task_helloWorld
	},

	schedule: {

	}
};

function handleGroupMeMessage(json) {
	var bot = new GroupMeBot(GLOBAL_BOT);
	bot.runWithMessage(json);
}

function handleTimeTrigger() {
	var bot = new GroupMeBot(GLOBAL_BOT);
	bot.runTasks();
}

//respond to messages sent to the group. Recieved as POST
//this method is automatically called whenever the Web App's (to be) URL is called
function doPost(event) {
	if (event) {
		var json = JSON.parse(event.postData.getDataAsString());

		//TODO (Minor): If GroupMe sent the message then run bot as command, else...
		handleGroupMeMessage(json);
	} else {
		//Was not a sent message. Nothing occurs.
	}
}