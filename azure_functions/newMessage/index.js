//const axios = require("axios");
const { createHmac } = require ('crypto');

module.exports = async function (context, req) {
    context.log('New incoming message.');

    const secret = process.env.VIBER_AUTH_TOKEN;
    const hash = createHmac('sha256', secret)
               .update(req.rawBody || "")
               .digest('hex');

    if (hash === req.headers['x-viber-content-signature'])
    {   
        if (req.body.event === "message"){
            context.log(`-- event type is "${req.body.event}": putting in the queue`)
            context.bindings.incomeMsgQueue = req.body;
        } else
            context.log(`-- event type is "${req.body.event}": discarding`)
    } else
        context.log(`!!! signature missmatch. message will be discarded.`)
        
    context.res = {
        // status: 200, /* Defaults to 200 */
        body: {}
    };
}