/*global UrlFetchApp:true, LanguageApp:true, Logger:true, console:true*/
/*
TODO: Readme stuff.

Replace BOT_ID with the bot identifier. Make an ID at https://dev.groupme.com/bots.
*/
var BOT_ID = '', //REPLACE WITH YOUR BOT'S ID.
	botDebug = {
		debug: true,
		log: function (text) {
			'use strict';
			Logger.log(text);
		}
	};

var BotFactory,
	BotTasks,

	/**
	Application Configuration
	*/
	APP_CONFIG = {
		bot: {
			id: BOT_ID,
			name: ''
		},

		command: {
			key: '!', //!command
			argsSplit: ' ' //Split at spaces for args
		},

		messages: {
			keygen: {
				multiplier: 1000000,
				make: function () {
					'use strict';
					return Math.floor((Math.random() * this.multiplier));
				}
			},
			send: {
				url: 'https://api.groupme.com/v3/bots/post'
			}
		},

		//Optional Remote File to load the configuration from, otherwise it is defined below.
		botConfigFile: ''
	},

	/**
	Channel Bot Configuration
	*/
	BOT_CONFIG = {
		/*
			API Keys configurations.
		*/
		keys: {
			googleApps: ''
		},

		options: {

		},

		/*
			Looping schedule.
		*/
		schedule: {
			tolerance: 1, //Tolerance in minutes.

			//Array of task names. Should be available in BotFactory's TASK_DEFINITIONS.
			tasks: ['sendText'],

			//Configuration for each task, keyed by name.
			config: {
				sendText: {
					args: ["This is a schedule message."],
					minutes: 5
				}
			}

		}
	};

BotFactory = function (APP_CONFIG, BOT_CONFIG, TASK_DEFINITIONS) {
	'use strict';

	//MARK: Factory validation.
	if (!APP_CONFIG.bot.id || APP_CONFIG.bot.id.length === 0) {
		throw 'Invalid configuration. No Bot Identifier was specified.';
	}

	if (!BOT_CONFIG) {
		BOT_CONFIG = {};
	}

	if (!TASK_DEFINITIONS) {
		throw 'Invalid configuration. Task definitions cannot be null.';
	}

	//MARK: "Classes"
	var //Messages
		GroupMeMessage,
		GroupMeAttachmentFactory,
		GroupMeMessageSender,
		GroupMeDecodedMessage,
		GroupMeMessageDecoder,

		//Command
		BotCommand,
		BotScheduler,
		GroupMeBot;

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
				type: 'image',
				url: url
			};
		},
		makeLocation: function (lat, lng, name) {
			return {
				type: 'location',
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
			return APP_CONFIG.messages.keygen.make();
		},

		makeMessage: function () {
			var messageId = this.makeMessageId();
			return new GroupMeMessage(messageId, this);
		},

		getMessagePayload: function (message) {
			var payload = message.buildPayload();

			payload.bot_id = APP_CONFIG.bot.id;
			payload.source_guid = message.id;

			return payload;
		},

		sendMessage: function (message) {
			var options = {
				method: 'post',
				payload: this.getMessagePayload(message)
			};

			UrlFetchApp.fetch(APP_CONFIG.messages.send.url, options);
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

			/* TODO: Remove this later.
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
				regex = new RegExp('^' + APP_CONFIG.command.key + '(\\S+)', ['i']),
				isCommand = text.match(regex),
				split,
				command = null,
				name,
				args;

			if (isCommand) {
				split = text.split(APP_CONFIG.command.argsSplit);
				name = split[0].substring(1);

				if (split.length > 1) {
					args = split.slice(1);
				}

				command = new BotCommand(name, args);
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
		},

		/*
			Returns an object containing all sender-related data.
		*/
		getSender: function () {
			var senderData = {
				name: this.data.name,
				id: this.data.sender_id,
				type: this.data.sender_type
			};

			return senderData;
		},

		senderIsNotBot: function () {
			return this.getSender.type !== 'bot';
		},

		senderIsNotThisBot: function () {
			return this.getSender.id !== APP_CONFIG.bot.id;
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
				throw 'BotCommand types must have a name.';
			}

			this.args = args;
		}

	};

	//MARK: Bot Scheduler
	/*
		Utility class for running scheduled tasks on a bot.
	*/
	BotScheduler = function (bot) {
		this.init(bot);
	};

	BotScheduler.prototype = {

		init: function (bot) {
			this.bot = bot;
			this.time = this.initTime();
		},

		initTime: function () {
			var date = new Date(),
				minutes = date.minutes,
				time = {
					date: date,
					minutes: minutes,
					timeBlockCache: {
						1: true //Always execute 1 minute intervals.
					},
					computeTimeBlock: function (interval) {
						var time = this.minutes,
							check = time % interval,
							isWithin = ((time / check) === 0);
						return isWithin;
					},
					withinTimeBlock: function (interval) {
						if (this.timeBlockCache[interval]) {
							this.timeBlockCache[interval] = this.computeTimeBlock(interval);
						}

						return this.timeBlockCache[interval];
					}
				};

			return time;
		},

		//MARK: Run Tasks
		runScheduledTasks: function () {
			var scheduler = this,
				schedule = this.bot.config.schedule,
				scheduledTasks = schedule.tasks,
				task,
				filteredTasks = [];

			scheduledTasks.forEach(function (taskName) {
				task = schedule.config[taskName];

				if (task === undefined) {
					throw 'No task named "' + taskName + '" was configured in the schedule.';
				}

				if (scheduler.shouldRunTask(task)) {
					filteredTasks.push(taskName);
				}
			});

			this.runScheduleTasksWithNames(filteredTasks);
		},

		runAllTasks: function () {
			var tasks = this.bot.config.schedule.tasks;
			this.runScheduleTasksWithNames(tasks);
		},

		runScheduleTasksWithNames: function (taskNames) {
			var args,
				bot = this.bot,
				scheduledTasksConfigs = this.bot.config.schedule.config,
				config;

			taskNames.forEach(function (task) {
				config = scheduledTasksConfigs[task];

				if (config) {
					args = config.args || [];
				}

				bot.runTask(task, args);
			});
		},

		/*
			Compares the minutes to the current time.
		*/
		shouldRunTask: function (taskConfig) {
			var minutes = taskConfig.minutes;
			return this.isTimeToRun(minutes);
		},

		isTimeToRun: function (minutes) {
			return this.time.withinTimeBlock(minutes);
		}

	};

	//MARK: Bot
	/**
	
	Constructor
	.config {
		.tasks [String]			//Array of tasks to loop through for the schedule.
		.schedule {
			.tasks [String],
			.config {
				<taskname>: {			//Task name in the schedule.
					.minutes (Number)	//Minutes between times to call task.
				}
			}
		},
	}
	
	Variables
	.messaging.sender	(GroupMeMessageSender)
	.messaging.decoder	(GroupMeMessageDecoder)
	*/
	GroupMeBot = function (config, extra) {
		this.init(config, extra);
	};

	GroupMeBot.prototype = {

		init: function (config, extra) {
			this.config = config;
			this.messaging = {
				sender: new GroupMeMessageSender(),
				decoder: new GroupMeMessageDecoder()
			};

			if (extra) {
				this.isServer = extra.server;
			}
		},

		//MARK: Messages
		/**
		The bot interprets and uses the passed message.
		*/
		runWithMessage: function (json) {
			var message = this.messaging.decoder.decode(json);
			this.useDecodedMessage(message);
		},

		runWithText: function (text) {
			var data = {
					'attachments': [],
					'created_at': new Date().getTime(),
					'id': 'System',
					'name': 'System',
					'sender_id': 'internal',
					'sender_type': 'internal',
					'system': true,
					'text': text,
					'user_id': null
				},
				decoded = new GroupMeDecodedMessage(data);

			return this.useDecodedMessage(decoded);
		},

		useDecodedMessage: function (decodedMessage) {
			if (decodedMessage.senderIsNotBot() && decodedMessage.isCommand()) {
				var command = decodedMessage.getCommand();
				this.runTaskWithCommand(command);
			}
		},

		//MARK: Tasks
		/**
		The bot runs all its tasks.
		*/
		runScheduleTasks: function () {
			var scheduler = new BotScheduler(this);
			scheduler.runScheduledTasks();
		},

		//MARK: Running Tasks
		runTaskWithCommand: function (command) {
			var name = command.name,
				args = command.args;

			this.runTask(name, args);
		},

		runTask: function (name, args) {
			var task = TASK_DEFINITIONS[name];

			if (task) {
				task.run(this, args);
			} else {
				this.sendError('No Task Available', 'No task was available with the name "' + name + '."');
			}
		},

		//MARK: Responses
		/*
			Convenience function to create a new GroupMeMessage using the configuration.
		*/
		makeMessage: function () {
			return this.messaging.sender.makeMessage();
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
			var text = 'Error: ' + type + ' - ' + message;

			if (!this.isServer) {
				this.sendText(text);
			} else {
				botDebug.log(text);
			}
		}

	};

	//MARK: Bot
	this.makeBot = function (otherConfig) {
		return new GroupMeBot(BOT_CONFIG, otherConfig);
	};

	//MARK: Convenience
	this.handleGroupMeMessage = function (json) {
		this.makeBot().runWithMessage(json);
	};

	this.handleTimeTrigger = function () {
		this.makeBot().runTasks();
	};

};

/**
Object contains all tasks available to a bot.

Tasks are defined as objects instead of functions to allow future extension of tasks.
*/
BotTasks = (function () {
	'use strict';

	var tasks = {},
		internal = {};

	//MARK: Internal Functions
	/*
		This function will not be available to the bot.
	*/
	internal.helloWorld = function () {
		return 'Hello World';
	};

	internal.args = {
		concatFrom: function (args, splitter, start) {
			return this.concat(args, splitter, start);
		},

		concatTo: function (args, splitter, end) {
			return this.concat(args, splitter, undefined, end);
		},

		concat: function (args, splitter, start, end) {
			if (!splitter) {
				splitter = APP_CONFIG.command.argsSplit;
			}

			if (!start) {
				start = 0;
			}

			if (end === undefined) {
				end = args.length;
			}

			var text = "",
				i;

			for (i = start; i < end; i += 1) {
				text += args[i] + " ";
			}

			return text;
		}
	};

	//MARK: Public Functions
	/*
		This is the task available to the bot as "helloWorld".
	*/
	tasks.helloWorld = {
		//"Static" Variable available to this task through 'this' reserved word.
		simple: true,
		text: 'Hello World',

		//Function that is actually called. Recieves a GroupMeBot instance, and an array of string arguments.
		run: function (bot, args) {
			var text = 'Hello World',
				message;

			if (this.simple) {
				text = this.text; //Usage of variable in tasks.helloWorld
				text = internal.helloWorld(); //Usage of internal function.

				bot.sendText(text);
			} else {
				message = bot.makeMessage();
				message.text = text;
				message.send();
			}
		}
	};

	tasks.translate = {
		run: function (bot, args) {
			var sourceLanguage = args[0],
				targetLanguage = args[1],
				text = internal.args.concat(args, ' ', 2),
				result = LanguageApp.translate(text, sourceLanguage, targetLanguage),
				message = bot.makeMessage();

			message.text = result;
			message.send();
		}
	};

	tasks.find = {
		run: function (bot, args) {
			var queryRoot = "https://maps.googleapis.com/maps/api/place/textsearch/json?",
				argQuery = "query=",
				argKey = "&key=" + BOT_CONFIG.keys.googleApps,
				query = internal.args.concat(args, '+'),
				request = queryRoot + argQuery + query + argKey,
				json = UrlFetchApp.fetch(request),
				parsed = JSON.parse(json),
				results = parsed.results,
				result,
				message = bot.makeMessage();


			if (results.length > 0) {
				result = results[0].name + " near " + parsed.results[0].vicinity;
			} else {
				result = 'Nothing found.';
			}

			message.text = result;
			message.send();
		}
	};

	tasks.sendText = {
		run: function (bot, args) {
			var text = args[0];
			bot.sendText(text);
		}
	};

	tasks.log = {
		run: function (bot, args) {
			var text = JSON.stringify(args);
			botDebug.log("Logging Text: " + text);
		}
	};

	return tasks;
}());

/**
Google Scripts
*/

//respond to messages sent to the group. Recieved as POST
//this method is automatically called whenever the Web App's (to be) URL is called
function doPost(event) {
	'use strict';

	var botFactory = new BotFactory(APP_CONFIG, BOT_CONFIG, BotTasks),
		bot = botFactory.makeBot(),
		postData,
		json;

	if (event) {
		postData = event.postData;

		if (!postData) {
			botDebug.log("Invalid Post. Contained no data.");
			throw 'Invalid POST. No data was available.';
		} else {
			botDebug.log("Recieved Message: " + event.postData.getDataAsString());
		}

		json = postData.getDataAsString();
		bot.runWithMessage(json);
	} else {
		throw 'Invalid POST. No event was available.';
	}
}

function runDebugText() {
	'use strict';

	var text = APP_CONFIG.command.key + 'find doctor in 77840',
		botFactory = new BotFactory(APP_CONFIG, BOT_CONFIG, BotTasks),
		bot = botFactory.makeBot({
			server: true
		});

	bot.runWithText(text);
}

function runScheduledTasks() {
	'use strict';

	var botFactory = new BotFactory(APP_CONFIG, BOT_CONFIG, BotTasks),
		bot = botFactory.makeBot({
			server: true
		});

	bot.runScheduleTasks();
}

/*
Hello world function for testing the bot is alive.
*/
function gsHelloWorld() {
	'use strict';

	var botFactory = new BotFactory(APP_CONFIG, BOT_CONFIG, BotTasks),
		bot = botFactory.makeBot();

	bot.runTask('helloWorld');
}

//TODO: Add function call for google scripts for running scheduled tasks.