//const axios = require("axios");
const { createHmac } = require('crypto');
const { odata, TableClient } = require("@azure/data-tables");

const connectionString = process.env.AzureWebJobsStorage;
const client = TableClient.fromConnectionString(connectionString, "patientsDB");

module.exports = async function (context, req) {
    context.log('New incoming message.');

    const secret = process.env.VIBER_AUTH_TOKEN_DEV;
    const hash = createHmac('sha256', secret)
        .update(req.rawBody || "")
        .digest('hex');

    if (hash === req.headers['x-viber-content-signature']) {
        if (req.body.event === "message") {
            context.log(`-- event type is "${req.body.event}": putting in the queue`)
            context.bindings.incomeMsgQueue = req.body;
            await client.upsertEntity({ partitionKey: "p1", rowKey: req.body.sender.id, viberUser: JSON.stringify(req.body.sender) }, "Replace")
                .catch(error => console.error("error upsert entity in patientsDB.", error));
        } else if (req.body.event === "conversation_started") {
            if (!req.body.subscribed) {
                context.res = {
                    body: {
                        "sender": {
                            "name": "Д-р Арабаджикова"
                        },
                        //"tracking_data": "welcome",
                        "type": "text",
                        "text": "Добре дошли! Това е моя Viber асистент, който ми помага с административните задачи. Изберете Начало за да започнем.",
                        "keyboard": {
                            "Type": "keyboard",
                            "DefaultHeight": false,
                            "Buttons": [
                                {
                                    "ActionType": "reply",
                                    "ActionBody": "---start",
                                    "Text": "Начало",
                                    "TextSize": "regular"
                                }
                            ]
                        }
                    }
                }
            }
            else {
                let tracking_data = JSON.stringify({
                    timestamp: 0,
                    data: {
                        current_task: "",
                        current_subtask: ""
                    }
                })

                context.res = {
                    body: {
                        "sender": {
                            "name": "Асистент"
                        },
                        //"tracking_data": "top_of_menu",
                        "type": "text",
                        "text": "Изберете как да Ви помогна.",
                        "tracking_data": tracking_data,
                        "keyboard": {
                            "Type": "keyboard",
                            "Buttons": [{
                                "Columns": 3,
                                "Rows": 2,
                                "ActionType": "reply",
                                "ActionBody": "---results",
                                "Text": "Резултати",
                                "TextSize": "regular"
                            }, {
                                "Columns": 3,
                                "Rows": 2,
                                "ActionType": "reply",
                                "ActionBody": "---help",
                                "Text": "Друго/Помощ",
                                "TextSize": "regular"
                            }]
                        }
                    }
                }
            }
            return
        } else if (req.body.event === "unsubscribed") {
            await client.deleteEntity("p1", req.body.user_id)
                .catch(error => console.error("error deleting unsubsribed client from patientsDB", error))
        } else
            context.log(`-- event type is "${req.body.event}": discarding`)
    } else
        context.log(`!!! signature missmatch. message will be discarded.`)

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: {}
    };
}