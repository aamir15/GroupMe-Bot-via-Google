/*global UrlFetchApp:true, LanguageApp:true, Logger:true, console:true*/
/*
TODO: Readme stuff.

Replace BOT_ID with the bot identifier. Make an ID at https://dev.groupme.com/bots.
*/
var BOT_ID = '', //REPLACE WITH YOUR BOT'S ID.
	botVersion = '1.2.0';

var BotDebug,
	BotUtilities,
	BotFactory,
	BotTasks,

	/**
	Application Configuration
	*/
	APP_CONFIG = {

		command: {
			key: '!', //!command
			argsSplit: ' ' //Split at spaces for args
		},

		messages: {
			limits: {
				text: 1000 //1000 character limit.	
			},
			//GroupMe Unique Message ID Keygen
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
		id: BOT_ID,

		/*
			API Keys configurations.
		*/
		keys: {
			google: {
				search: {
					key: '',
					cx: ''
				},
				youtube: ''
			}
		},

		options: {
			help: {
				message: 'GroupMe Bot - v' + botVersion + '.\nType !list for a list of functions.'
			},
			list: {
				showAllPages: false,
				maxPerPage: 50
			},

			google: {
				search: {
					defaultLimit: 6,
					maxLimit: 10,
					safeSearch: 'high',
					lr: 'lang_en'
				},
				image: {
					type: 'image',
					defaultLimit: 1,
					maxLimit: 1,
					safeSearch: 'high' //off, medium, high			
				},
				youtube: {
					safeSearch: 'moderate'
				}
			},
			bing: {
				maxResults: 5,
				showRelated: false
			}
		},

		/*
			Looping schedule.
		*/
		schedule: {
			blocking: {
				minutesInDay: 1440,

				/*
				  How often in minutes the script is called. 
				  
				  Should be the greatest common denominator between scheduled tasks.
				*/
				interval: 1
			},

			//Array of queued tasks.
			queue: ['a', 'b'],

			//Configuration for each queued task, keyed by name.
			config: {
				a: {
					//Task Name Should be available in BotFactory's TASK_DEFINITIONS.
					task: 'sendText',

					//Args to pass to the task.
					args: ["This is scheduled to run every 1 minutes."],

					//How often to run the task in minutes.
					interval: 1
				},
				b: {
					task: 'sendText',
					args: ["This is scheduled to run every 2 minutes."],
					interval: 2
				}
			}

		}
	};

BotDebug = (function () {
	'use strict';

	var factory = {
		debug: true,
		sendToDebug: true,
		log: function (text) {
			Logger.log(text);
		},
		logMessage: function (options) {
			Logger.log(JSON.stringify(options));
		}
	};

	return factory;
}());

BotUtilities = (function () {
	'use strict';

	var utilities = {};

	utilities.isNotNull = function (value) {
		return (value !== null || value !== undefined);
	};

	/*
		Attempts to retrieve a value from the passed object.
		
		If the object is a function, execute it before returning.
	*/
	utilities.getValue = function (object, defaultValue) {
		var value = object;

		if (this.isNotNull(object) === false) {
			value = defaultValue;
		}

		if (typeof (object) === 'function') {
			value = object();
		}

		return value;
	};

	utilities.getNumberValue = function (object, defaultValue) {
		var value = this.getValue(object, defaultValue);
		return Number(value);
	};

	/*
		Sanitize a raw input query for URL purposes.
		
		Makes sure users can't inject arbitrary parameters.
	*/
	utilities.sanitizeUrlParameter = function (query) {
		var sanitized = encodeURIComponent(query);
		return sanitized;
	};

	return utilities;
}());

BotFactory = function (APP_CONFIG, BOT_CONFIG, TASK_DEFINITIONS) {
	'use strict';

	//MARK: Factory validation.
	if (!APP_CONFIG) {
		throw 'Invalid configuration. No App Configuration was specified.';
	}

	if (!BOT_CONFIG.id || BOT_CONFIG.id.length === 0) {
		throw 'Invalid configuration. No Bot Identifier was specified.';
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

			if (!payload.text) {
				payload.text = '';
			}

			if (payload.text.length > APP_CONFIG.messages.limits.text) {
				payload.text = payload.text.substr(0, APP_CONFIG.messages.limits.text - 3) + '...';
			}

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

	};

	/**
	Factory and sender for GroupMeMessage objects.
	*/
	GroupMeMessageSender = function (id) {
		this.botId = id;
	};

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

			payload.bot_id = this.botId;
			payload.source_guid = message.id;

			return payload;
		},

		sendMessage: function (message) {
			var options = {
				method: 'post',
				payload: JSON.stringify(this.getMessagePayload(message))
			};

			if (BotDebug.sendToDebug) {
				BotDebug.logMessage(options);
			} else {
				UrlFetchApp.fetch(APP_CONFIG.messages.send.url, options);
			}
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

		senderIsNotBotWithId: function (id) {
			return this.getSender.id !== id;
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
				minutes = (23 * date.getHours()) + date.getMinutes(),
				interval = this.bot.config.schedule.blocking.interval,
				//span = this.bot.config.schedule.blocking.minutesInDay,
				block = Math.ceil(minutes / interval),
				time = {
					date: date,
					minutes: minutes,
					block: block,
					timeBlockCache: {
						1: true //Always execute 1 minute intervals.
					},
					computeWithinBlock: function (interval) {
						BotDebug.log('I: ' + interval + ' B: ' + this.block + ' R: ' + (this.block % interval));
						return ((this.block % interval) === 0);
					},
					withinTimeBlock: function (interval) {
						if (!this.timeBlockCache[interval]) {
							this.timeBlockCache[interval] = this.computeWithinBlock(interval);
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
				scheduleQueue = schedule.queue,
				queueTaskConfig,
				filteredQueueTasks = [];

			scheduleQueue.forEach(function (queueTask) {
				queueTaskConfig = schedule.config[queueTask];

				if (!queueTaskConfig) {
					throw 'No queue task named "' + queueTask + '" was configured in the schedule.';
				}

				if (scheduler.shouldRunQueueTask(queueTaskConfig)) {
					filteredQueueTasks.push(queueTask);
				}
			});

			this.runScheduledTasksWithNames(filteredQueueTasks);
		},

		runAllQueuedTasks: function () {
			var queueTasks = this.bot.config.schedule.queue;
			this.runScheduledTasksWithNames(queueTasks);
		},

		runScheduledTasksWithNames: function (queueTasks) {
			var config,
				taskName,
				args,
				bot = this.bot,
				scheduledTasksConfigs = this.bot.config.schedule.config;

			queueTasks.forEach(function (queueTask) {
				config = scheduledTasksConfigs[queueTask];
				taskName = config.task;
				args = config.args || [];
				bot.runTask(taskName, args);
			});
		},

		/*
			Compares the minutes to the current time.
		*/
		shouldRunQueueTask: function (taskConfig) {
			var interval = taskConfig.interval,
				shouldRun;

			if (!interval) {
				throw 'The queue task "' + taskConfig.task + '" has an invalid interval specified.';
			}

			shouldRun = this.isTimeToRun(interval);

			BotDebug.log(((shouldRun) ? 'Should' : 'Shouldn\'t') + ' run task ' + taskConfig.task + ' i: ' + interval);

			return shouldRun;
		},

		isTimeToRun: function (interval) {
			return this.time.withinTimeBlock(interval);
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
			var id = config.id;

			this.config = config;
			this.messaging = {
				attachments: GroupMeAttachmentFactory,
				sender: new GroupMeMessageSender(id),
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
		runScheduledTasks: function () {
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
				try {
					task.run(this, args);
				} catch (e) {
					this.sendError('Error Running Task', e);
				}
			} else {
				this.sendError('No Task Available', 'No task was available with the name "' + name + '".');
			}
		},

		//MARK: Utility
		hasTask: function (name) {
			return this.getTask(name) !== undefined;
		},

		getTask: function (name) {
			return TASK_DEFINITIONS[name];
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
				BotDebug.log(text);
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

	internal.tasks = {

		count: function () {
			return Object.keys(tasks);
		}

	};

	internal.args = {

		concatFrom: function (args, splitter, start) {
			return this.concat(args, splitter, start);
		},

		concatTo: function (args, splitter, end) {
			return this.concat(args, splitter, undefined, end);
		},

		concat: function (args, splitter, start, end) {
			var getValue = function (element) {
				return element;
			};

			return this.concatElements(args, getValue, splitter, start, end);
		},

		concatElements: function (elements, getValue, splitter, start, end) {
			if (!splitter) {
				splitter = APP_CONFIG.command.argsSplit;
			}

			if (!start) {
				start = 0;
			}

			if (end === undefined) {
				end = elements.length;
			}

			var text = "",
				count = end - start,
				value,
				i;

			if (count > 0) {
				if (count > 1) {
					for (i = start; i < (end - 1); i += 1) {
						text += getValue(elements[i], i) + splitter;
					}
				}

				text += getValue(elements[end - 1], end);
			}

			return text;
		}
	};

	//MARK: Public Functions
	tasks.help = {
		help: {
			invocation: '!help <~task>',
			description: 'Displays the help information for a task.'
		},
		showHelpMessage: function (bot) {
			var text = BotUtilities.getValue(bot.config.options.help.message);
			bot.sendText(text);
		},
		helpTextForTask: function (bot, task) {
			var text,
				help,
				taskDefinition = bot.getTask(task);

			if (taskDefinition) {
				help = taskDefinition.help;

				if (help) {
					text = task + ' Task\n';

					if (help.invocation) {
						text += 'Invocation: ' + BotUtilities.getValue(help.invocation);
					}

					if (help.description) {
						text += 'Description: ' + BotUtilities.getValue(help.description);
					}

					if (help.example) {
						text += 'Example: ' + BotUtilities.getValue(help.example);
					}

				} else {
					text = 'There is no help info for task "' + task + '".';
				}

			} else {
				text = 'The task "' + task + '" is not available to this bot.';
			}

			return text;
		},
		showHelpForTask: function (bot, task) {
			var text = this.helpTextForTask(bot, task);
			bot.sendText(text);
		},
		run: function (bot, args) {
			var task = args[0];

			if (task !== undefined) {
				this.showHelpForTask(bot, task);
			} else {
				this.showHelpMessage();
			}
		}
	};

	tasks.list = {
		help: {
			invocation: '!list <page>',
			description: function () {
				var taskCount = internal.tasks.count();
				return 'There are currently "' + taskCount + '" tasks available to this bot.';
			}
		},
		listDescriptionForTask: function (task) {
			var taskDefinition = tasks[task],
				help = taskDefinition.help,
				text;

			if (help && help.list) {
				text = BotUtilities.getValue(help.list, task);
			} else {
				text = task;
			}

			return APP_CONFIG.command.key + text;
		},
		makeListForPage: function (page, pageSize) {
			var taskNames = Object.keys(tasks),
				start = (page * pageSize),
				end = Math.min(start + pageSize, taskNames.length),
				list;

			list = taskNames.slice(start, end);

			return list;
		},
		listTasks: function (bot, page, pageSize) {
			var listDefinition = this,
				list = this.makeListForPage(page, pageSize),
				helpInfo,
				text = internal.args.concatElements(list, function (e) {
					return listDefinition.listDescriptionForTask(e);
				}, ', ');

			bot.sendText(text);
		},
		run: function (bot, args) {
			var page = BotUtilities.getNumberValue(args[0], 0),
				pageSize = bot.config.options.list.maxPerPage;
			this.listTasks(bot, page, pageSize);
		}
	};

	/*
		This is the task available to the bot as "helloWorld".
	*/
	tasks.helloWorld = {
		help: {
			invocation: '!helloWorld',
			description: 'Hello world!'
		},

		//"Static" Variable available to this task through 'this' reserved word.
		simple: false,
		text: 'Hello World',

		//Function that is actually called. Recieves a GroupMeBot instance, and an array of string arguments.
		run: function (bot, args) {
			var text = 'Hello World',
				attachmentFactory = bot.messaging.attachments,
				attachments = [],
				map,
				message;

			if (this.simple) {
				text = this.text; //Usage of variable in tasks.helloWorld
				text = internal.helloWorld(); //Usage of internal function.

				bot.sendText(text);
			} else {
				message = bot.makeMessage();

				map = attachmentFactory.makeLocation(96.0, -36.0, 'Hello World');
				attachments.push(map);

				/*
                image = attachmentFactory.makeImage(url);
				attachments.push(image);
                */

				message.text = text;
				message.attachments = attachments;
				message.send();
			}
		}
	};

	tasks.video = {
		help: {
			invocation: '!video <search>',
			example: '!video hello world',
			description: 'Returns the first video found on youtube with the search provided.'
		},
		config: {
			maxResults: 1
		},
		baseVideoUrl: 'https://www.youtube.com/watch?v=',
		baseQueryUrl: 'https://www.googleapis.com/youtube/v3/search?part=id&type=video&key=',
		urlForVideo: function (id) {
			return this.baseVideoUrl + id;
		},
		searchVideos: function (query) {
			query = BotUtilities.sanitizeUrlParameter(query);

			var key = BOT_CONFIG.keys.google.youtube,
				safety = BOT_CONFIG.options.google.youtube.safeSearch || 'none',
				URL = this.baseQueryUrl + key + '&safeSearch=' + safety + 'maxResults=' + this.config.maxResults + '&q=' + query,
				response = UrlFetchApp.fetch(URL),
				json = response.getContentText(),
				results = JSON.parse(response);

			return results;
		},
		urlForResult: function (result) {
			var id = result.id.videoId;
			return this.urlForVideo(id);
		},
		attachFirstResultToMessage: function (results, message) {
			var items = results.items,
				first = items[0],
				text = this.urlForResult(first);

			message.text = text;
		},
		attachResultsToMessage: function (bot, results, message, max) {
			var items = results.items,
				resultsCount = items.length,
				attachments = [];

			message.text = 'Recieved ' + resultsCount + ' video results.';

			//TODO...

		},
		run: function (bot, args) {
			var query = internal.args.concat(args),
				results = this.searchVideos(query),
				resultsCount = results.items.length,
				message = bot.makeMessage();

			if (resultsCount > 0) {
				this.attachFirstResultToMessage(results, message);
				//this.attachResultsToMessage(bot, searchResults, message, 5);
			} else {
				message.text = 'No video results were found.';
			}

			message.send();
		}
	};

	tasks.translate = {
		help: {
			invocation: '!translate <from> <to> <text>',
			example: '!translate en sp Translation to spanish please.',
			description: 'Translates text from one language to another.'
		},
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
		help: {
			invocation: '!find <search>',
			example: '!find grocery store',
			description: 'Returns the first Google Maps result.'
		},
		mapOutput: false,
		defaultMaxResults: 5,
		textForResult: function (result) {
			var rating;

			if (result.rating) {
				rating = " (" + result.rating + " stars)";
			} else {
				rating = "";
			}

			return "* " + result.name + rating;
		},
		convertResultsToText: function (results, max) {
			var textResults = [],
				textResult,
				result,
				i;

			for (i = 0; i < Math.min(max, results.length); i += 1) {
				result = results[i];
				textResult = this.textForResult(result);
				textResults.push(textResult);
			}

			return textResults;
		},
		attachMapResults: function (bot, message, results, max) {
			this.attachTextResults(message, results, max);

			var attachmentFactory = bot.messaging.attachments,
				attachments = [],
				attachment,
				result,
				location,
				name,
				text,
				i;

			for (i = 0; i < Math.min(max, results.length); i += 1) {
				result = results[i];
				name = result.name;
				location = result.geometry.location;
				attachment = attachmentFactory.makeLocation(location.lat, location.lng, name);
				attachments.push(attachment);
			}

			message.attachments = attachments;
		},
		attachTextResults: function (message, results, max) {
			var resultsText = this.convertResultsToText(results, max),
				text = internal.args.concat(resultsText, '\n');
			message.text = text;
		},
		run: function (bot, args) {
			var queryRoot = "https://maps.googleapis.com/maps/api/place/textsearch/json?",
				argQuery = "query=",
				argKey = "&key=" + bot.config.keys.googleMaps,
				query = internal.args.concat(args, '+'),
				request = queryRoot + argQuery + query + argKey,
				json = UrlFetchApp.fetch(request),
				parsed = JSON.parse(json),
				results = parsed.results,
				message = bot.makeMessage();

			Logger.log(json);

			if (results.length > 0) {
				if (this.mapOutput) {
					this.attachMapResults(bot, message, results, this.defaultMaxResults);
				} else {
					this.attachTextResults(message, results, this.defaultMaxResults);
				}
			} else {
				message.text = 'Nothing found.';
			}

			message.send();
		}
	};

	tasks.weather = {
		help: {
			invocation: '!weather <city>',
			example: '!weather Bryan, Texas',
			description: 'Displays the weather from given city.'
		},
		textForResult: function (results) {
			var name = results.name,
				coord = results.coord, //Location
				main = results.main, //temp/_min/_max
				wind = results.wind,
				weather = results.weather[0],
				text;

			text = 'Weather - ' + name + '\n' +
				'Temperature: ' + main.temp + '°F.' + '\n' +
				'Wind: ' + wind.speed + ' Heading: ' + wind.deg + '\n' +
				'Description: ' + weather.description;
			return text;
		},
		attachResultsToMessage: function (results, message) {
			var text = this.textForResult(results);
			message.text = text;
		},
		run: function (bot, args) {
			var queryRoot = "http://api.openweathermap.org/data/2.5/weather?units=imperial&q=",
				query = internal.args.concat(args, "%20"), //%20 = ' '
				request = queryRoot + query,
				json = UrlFetchApp.fetch(request),
				results = JSON.parse(json),
				result,
				message = bot.makeMessage();

			if (results) {
				this.attachResultsToMessage(results, message);
			} else {
				message.text = 'No weather info avaiable.';
			}

			message.send();
		}
	};

	tasks.scholar = {
		help: {
			invocation: '!scholar <search>',
			example: '!scholar a scholarly journal',
			description: 'Searches Google Scholar.'
		},
		baseUrl: "http://ecology-service.cse.tamu.edu/BigSemanticsService/metadata.json?url=https%3A%2F%2Fscholar.google.com%2Fscholar%3Fq%3D",
		run: function (bot, args) {
			var query = internal.args.concat(args) || '',
				request = this.baseUrl + BotUtilities.sanitizeUrlParameter(query),
				json = UrlFetchApp.fetch(request),
				response = JSON.parse(json),
				results,
				text;

			if (response) {
				results = response.google_scholar_search.search_results;

				//TODO: Send multiple messages in order to send all results.

				if (results.length > 0) {
					text = internal.args.concatElements(results, function (e, i) {
						var result = e.google_scholar_search_result,
							destination = result.destination_page,
							title = result.title,
							url = destination.location;

						return i + ') ' + title + '\nUrl: ' + url;
					}, '\n\n');
				} else {
					text = 'No scholar results found.';
				}

				bot.sendText(text);
			} else {
				bot.sendError('Scholar', 'Error while searching.');
			}

		}
	};

	tasks.bing = {
		help: {
			invocation: '!bing <search>',
			example: '!bing it on',
			description: 'Searches Bing.'
		},
		baseUrl: 'http://ecology-service.cse.tamu.edu/BigSemanticsService/metadata.json?url=http%3A%2F%2Fwww.bing.com%2Fsearch%3Fq%3D',
		textForResults: function (results, key, max) {
			var text = null;

			if (results.length > 0) {
				text = internal.args.concatElements(results, function (e, i) {
					var document = (key) ? e[key] : e,
						title = document.title,
						url = document.location;

					return i + ') ' + title + '\nUrl: ' + url;
				}, '\n\n', 0, max);
			}

			return text;
		},
		sendMessageWithResults: function (bot, results, key, title, max) {
			var text = this.textForResults(results, key, max);

			title = ((title) ? (title + '\n') : '');

			if (!text) {
				text = 'None';
			}

			bot.sendText(title + text);
		},
		run: function (bot, args) {
			var query = internal.args.concat(args, '%20'),
				request = this.baseUrl + query,
				json = UrlFetchApp.fetch(request),
				results = JSON.parse(json),
				bing = results.bing_search_xpath,
				searchResults = bing.search_results,
				relatedSearches = bing.related_searches,
				text;

			this.sendMessageWithResults(bot, searchResults, 'rich_document', '---SEARCH RESULTS---', 5);
			this.sendMessageWithResults(bot, relatedSearches, null, '---RELATED SEARCHES---', 5);
		}
	};

	tasks.league = {
		baseUrl: "http://ecology-service.cse.tamu.edu/BigSemanticsService/metadata.json?url=http%3A%2F%2Fgameinfo.na.leagueoflegends.com%2Fen%2Fgame-info%2Fchampions%2F",
		abilityKey: {
			'passive': 0,
			'q': 1,
			'w': 2,
			'e': 3,
			'r': 4,
			'ult': 5
		},
		filterAbilities: function (abilityList, filter) {
			var key,
				abilities = [];

			filter = filter || 'all';

			switch (filter) {
			case 'q':
			case 'w':
			case 'e':
			case 'r':
			case 'ult':
			case 'passive':
				abilities.push(abilityList[this.abilityKey[filter]]);
				break;
			case 'all':
				abilities = abilityList;
				break;
			}

			return abilities;
		},
		sendAbilityDetails: function (bot, ability, index) {
			var abilityText = ability.title + ":\n";

			if (ability.description) {
				abilityText += ability.description + "\n";
			}

			if (ability.cost) {
				abilityText += "Cost: " + ability.cost + "\n";
			}

			if (ability.range) {
				abilityText += "Range: " + ability.range + "\n";
			}

			bot.sendText(abilityText);
		},
		sendDataForHero: function (bot, hero, abilityFilter) {
			var league = this,
				query = hero.toLowerCase(),
				request = this.baseUrl + query,
				json = UrlFetchApp.fetch(request),
				response = JSON.parse(json),
				abilities,
				results,
				text;

			if (response) {
				abilities = response.league_champion.abilites;
				abilities = this.filterAbilities(abilities, abilityFilter);

				abilities.forEach(function (ability, i) {
					league.sendAbilityDetails(bot, ability, i);
				});
			} else {
				bot.sendError('League', 'Error while finding champion ' + hero + '.');
			}
		},
		run: function (bot, args) {
			var hero = args[0],
				filter = args[1];
			this.sendDataForHero(bot, hero, filter);
		}
	};

	internal.search = {
		baseUrl: 'https://www.googleapis.com/customsearch/v1',
		SearchFactory: (function () {
			var factory = {},
				GoogleSearch,
				GoogleSearchResult;

			GoogleSearch = function (key, cx) {
				this.key = key;
				this.cx = cx;
			};

			GoogleSearch.prototype = {

				search: function (query) {
					query = BotUtilities.sanitizeUrlParameter(query || '');

					var request = internal.search.baseUrl + '?key=' + this.key + '&cx=' + this.cx + '&q=' + query,
						json;

					if (this.safe) {
						request += '&safe=' + this.safe;
					}

					if (this.limit) {
						request += '&num=' + this.limit;
					}

					if (this.type) {
						request += '&searchType=' + this.type;
					}

					if (this.lr) {
						request += '&lr=' + this.lr;
					}

					json = UrlFetchApp.fetch(request);
					return this.convertResponse(json);
				},

				convertResponseItem: function (result) {
					return new GoogleSearchResult(result);
				},

				convertResponse: function (json) {
					var search = this,
						response = JSON.parse(json),
						results = [];

					if (response) {
						response.items.forEach(function (result) {
							results.push(search.convertResponseItem(result));
						});
					}

					return results;
				}

			};

			/**
			GoogleSearchResult
			
			.getResultsData()
			- .title
			- .link
			- .displayLink
			*/
			GoogleSearchResult = function (data) {
				this.init(data);
			};

			GoogleSearchResult.prototype = {

				init: function (data) {
					this.data = data;
				},

				getResultsData: function () {
					var data = {
						title: this.data.title,
						link: this.data.link,
						website: this.data.displayLink
					};

					return data;
				}

			};

			factory.make = function (key, cx) {
				return new GoogleSearch(key, cx);
			};

			return factory;
		}()),

		makeSearch: function (key, cx) {
			var search = this.SearchFactory.make(key, cx);
			return search;
		},

		newSearch: function (keys, config) {
			var key = keys.key,
				cx = keys.cx,
				search = this.makeSearch(key, cx);

			if (config) {
				search.safe = config.safeSearch;
				search.limit = config.defaultLimit;
				search.lr = config.lr;
				search.type = config.type;
			}

			return search;
		}
	};

	tasks.search = {
		help: {
			invocation: '!search <search>',
			example: '!search google',
			description: 'Searches Google.'
		},

		textForResults: function (searchResults) {
			var text = null;

			if (searchResults.length > 0) {
				text = internal.args.concatElements(searchResults, function (searchResult, i) {
					var data = searchResult.getResultsData();
					return i + ') ' + data.title + '\nAt: ' + data.link;
				}, '\n\n');
			}

			return text;
		},

		run: function (bot, args) {
			var query = internal.args.concat(args),
				keys = bot.config.keys.google.search,
				config = bot.config.options.google.search,
				search = internal.search.newSearch(keys, config),
				results,
				text;

			if (query && query.length > 0) {
				results = search.search(query);
				text = this.textForResults(results);
				bot.sendText(text);
			} else {
				bot.sendText('Invalid search query.');
			}
		}
	};

	tasks.image = {
		help: {
			invocation: '!image <search>',
			example: '!image that is funny',
			description: 'Searches Google Images.'
		},

		sendResults: function (bot, searchResults) {
			var attachmentFactory = bot.messaging.attachments,
				text = null;

			if (searchResults.length > 0) {
				searchResults.forEach(function (result) {
					var data = result.getResultsData(),
						message = bot.makeMessage(),
						image = attachmentFactory.makeImage(data.link);

					message.text = 'From: ' + data.website;
					message.attachments = [image];
					message.send();
				});
			}

			return text;
		},

		run: function (bot, args) {
			var query = internal.args.concat(args),
				keys = bot.config.keys.google.search,
				config = bot.config.options.google.image,
				search = internal.search.newSearch(keys, config),
				results;

			if (query && query.length > 0) {
				results = search.search(query);

				if (results.length > 0) {
					this.sendResults(bot, results);
				} else {
					bot.sendText('No images found.');
				}
			} else {
				bot.sendText('Invalid search query.');
			}
		}

	};

	tasks.text = {
		help: {
			invocation: '!text <text>',
			example: '!text Something to say.',
			description: 'Makes the bot say what you type.'
		},
		run: function (bot, args) {
			var text = internal.args.concatFrom(args);
			bot.sendText(text);
		}
	};

	return tasks;
}());

/**
Google Scripts
scripts.google.com
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
			BotDebug.log("Invalid Post. Contained no data.");
			throw 'Invalid POST. No data was available.';
		} else {
			BotDebug.log("Recieved Message: " + event.postData.getDataAsString());
		}

		json = postData.getDataAsString();
		bot.runWithMessage(json);
	} else {
		throw 'Invalid POST. No event was available.';
	}
}

function runScheduledTasks() {
	'use strict';

	var botFactory = new BotFactory(APP_CONFIG, BOT_CONFIG, BotTasks),
		bot = botFactory.makeBot({
			server: true
		});

	bot.runScheduledTasks();
}

//MARK: Debug
function runDebugText() {
	'use strict';

	var text = APP_CONFIG.command.key + 'search katarina',
		botFactory = new BotFactory(APP_CONFIG, BOT_CONFIG, BotTasks),
		bot = botFactory.makeBot({
			server: true
		});

	bot.runWithText(text);
}