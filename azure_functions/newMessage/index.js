//const axios = require("axios");
const { createHmac } = require('crypto');
const { TableClient } = require("@azure/data-tables");
const { button } = require("../common/keyboard_buttons")
const { concatHexCharCode } = require("../common/support_functions")

const connectionString = process.env.AzureWebJobsStorage;
const client = TableClient.fromConnectionString(connectionString, "patientsDB");

module.exports = async function (context, req) {
    context.log(`New incoming message. Event type is "${req.body.event}"`);
    context.log.verbose(JSON.stringify(req.body));

    const secret = process.env.VIBER_AUTH_TOKEN_DEV;
    const hash = createHmac('sha256', secret)
        .update(req.rawBody || "")
        .digest('hex');

    if (hash === req.headers['x-viber-content-signature']) {
        if (req.body.event === "message") {
            context.bindings.incomeMsgQueue = req.body;
//            await client.upsertEntity({ partitionKey: "p1", rowKey: concatHexCharCode(req.body.sender.id), patientViberProfile: JSON.stringify(req.body.sender)}, "Replace")
//                .then(res => context.log.verbose("upsert response: ", res))
//                .catch(error => context.log.error("error upsert entity in patientsDB.", error));
        } else if (req.body.event === "conversation_started") {
            if (!req.body.subscribed) {
                context.res = {
                    body: {
                        "sender": { "name": "Д-р Арабаджикова" },
                        "type": "text",
                        "text": "Добре дошли! Това е моя Viber асистент, който ми помага с административните задачи. Изберете Начало за да започнем.",
                        "keyboard": {
                            "Type": "keyboard",
                            "Buttons": [button("Начало", "---start")]
                        }
                    }
                }
            }
            else {
                /*
                let tracking_data = JSON.stringify({
                    timestamp: 0,
                    data: { current_task: "", current_subtask: "" }
                })
                */

                context.res = {
                    body: {
                        "sender": { "name": "Асистент" }, "type": "text",
                        "text": "Изберете как да Ви помогна.",
                        //"tracking_data": tracking_data,
                        "keyboard": {
                            "Type": "keyboard",
                            "Buttons": [button("Резултати", "---results", 3, 2), button("Друго/Помощ", "---help", 3, 2)]
                        }
                    }
                }
            }
            return
        } else if (req.body.event === "unsubscribed") {
            await client.deleteEntity("p1", req.body.user_id)
                .catch(error => context.log.error("error deleting unsubsribed client from patientsDB", error))
        } else
            context.log(`-- event type is "${req.body.event}": discarding`)
    } else
        context.log(`!!! signature missmatch. message will be discarded.`)

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: {}
    };
} 