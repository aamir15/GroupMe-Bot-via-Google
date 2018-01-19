		---- CLONED FROM https://github.com/william-reed/GroupMe-Bots-With-Google-Apps-Script ----



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
The bot is intended to be deployed on `Google Apps Script`.

Create a new script at https://script.google.com/ and copy over the code.

Create a GroupMe channel you want to host the bot in, and create a bot at https://dev.groupme.com/bots. Leave the callback URL empty for now, since you'll need to deploy your script before recieving a callback url.

Edit the script to set BOT_ID equal to your create GroupMe bot's id. 

Add any other necessary API keys that may be required to the BOT_CONFIG.keys variable in the script.

Deploy your script and copy the provided url. Edit your GroupMe bot's callback url.

Say hi to your bot! (!helloWorld).

##Collected Data
The GroupMe bot has access to all messages sent by users in the GroupMe chat with the bot.  The bot does not record any data, although commands passed through to APIs may be recorded by external services.

##Output
The GroupMe bot can reply to the GroupMe chat with text based replies, as well as contextual replies, such as maps and images, when relevant to the query.
