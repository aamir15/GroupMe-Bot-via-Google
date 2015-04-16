/**
TODO: People, etc.
*/
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
    GroupMeMessageSender;

//Classes Etc...

//MARK: GroupMe Messages
/**
GroupMe Message that acts as a GroupMe Message.

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
        }
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


//MARK: Bot Variables
var bot = {
    messages: {
        sender: new GroupMeMessageSender()
    }
};


//MARK: Logic
//respond to messages sent to the group. Recieved as POST
//this method is automatically called whenever the Web App's (to be) URL is called
function doPost(e) {
    /*
    var post = JSON.parse(e.postData.getDataAsString());
    var text = post.text;
    var name = post.name

    if(text.toLowerCase().substring(0, 3) == "!hi") {
    }
    */

    var message = bot.messages.sender.makeMessage();
    message.text = ("Hello.");
    message.send();
}