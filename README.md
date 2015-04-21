# GroupMe-Bot

##Overview
GroupMe-Bot was created for TAMU CSCE 438.  It is a GroupMe Bot that accepts various commands, such as:
* `!helloWorld`
* `!translate <from> <to> <text>`
* `!find <query>`
* `!weather <query>`

##APIs
The bot relies on `OpenWeather`, `Google Maps API`, and `GroupMe API` to funtion.  Relevant API keys must be generated to run an instance.

##Deployment
The bot is intended to be deployed as a `Google Apps Script`.

##Collected Data
The GroupMe bot has access to all messages sent by users in the GroupMe chat with the bot.  The bot does not record any data, although commands passed through to APIs may be recorded by external services.

##Output
The GroupMe bot can reply to the GroupMe chat with text based replies, as well as contextual replies, such as maps and images, when relevant to the query.
