const SessionCacheManager = require('../lib/global_session')
const fs = require('fs')

let TEST_WANT_KEY = "kjd8uq3rkdiufhqru"
let TEST_WANT_VALUE = "testing-for-the-lost-token"

async function client_1_messages(client) {
    // ----
    // t1
    let v1 = "this-is-a-test"
    console.log("A")
    client.set("2i3u4nw9eu28fu",v1)
    let lrum = client.get_LRUManager()
    // t2
    console.log("B")
    let augmented_hash_token = lrum.cache.hash(TEST_WANT_KEY)
    console.log("C")
    lrum.set_with_token(augmented_hash_token,TEST_WANT_VALUE)
    console.log("D")
    //
    let v1_test = await client.get("2i3u4nw9eu28fu")
    let v2_test = await client.get(TEST_WANT_KEY)
    console.log(v1_test,v1)
    console.log(v2_test,TEST_WANT_VALUE)//
    setTimeout(() => {
        console.log("sending messages TEST_PATH")
        client.message_fowarding.publish("messages-ready","TEST_PATH",{})
    },1000)
}


async function client_2_messages(client) {
    console.log("client 2 SUBSCRIBING to messages-ready on TEST_PATH")
    client.message_fowarding.subscribe("messages-ready","TEST_PATH",{},async (msg_object) => {
        //
        console.log("client 2 HANDLING PUBLICATION FROM client 1 for messages-ready on TEST_PATH")
        //
        let v1 = "this-is-a-test"
        let v1_test = await client.get("2i3u4nw9eu28fu")
        console.log("client_2_messages",v1_test,v1)
        //
        let v2_test = await client.get(TEST_WANT_KEY)
        if ( !v2_test ) {
            let pvalue = new Promise((resolve,reject) => {
                let handler = (key) => {
                    let value = client.get(TEST_WANT_KEY)
                    resolve(value)
                }
                client.application_set_key_notify(TEST_WANT_KEY,handler)                
            })
            v2_test = await pvalue
        }
        console.log(v2_test,TEST_WANT_VALUE)
    })
}


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
let conf_file = 'session-service.conf'
let conf_par = process.argv[2]
if ( conf_par !== undefined ) {
    conf_file = conf_par
}

let client_index = parseInt(process.argv[3]) - 1
let g_the_client = false

try {
    console.log(process.cwd())
    let conf = JSON.parse(fs.readFileSync(conf_file).toString())
    let cl = new SessionCacheManager(conf.lrus[client_index],conf.relay)
    console.log(`client : ${client_index + 1}`)
    g_the_client = cl
} catch (e) {
    console.log(e)
    process.exit(0)
}


process.on("message",(message) => {
    let which_cl = message.client
    if ( which_cl === 1 ) {
        switch ( message.cmd ) {
            case "go" : {
                if ( g_the_client ) client_1_messages(g_the_client)
                break;
            }
            default : {}
        }
    } else if ( which_cl === 2 ) {
        switch ( message.cmd ) {
            case "go" : {
                if ( g_the_client ) client_2_messages(g_the_client)
                process.send({ "client" : 2, "executed" : message.cmd })
                break;
            }
            default : {}
        }
    }
})

process.on('SIGINT', async () => {
    try {
        process.exit(0)
    } catch (e) {
        console.log(e)
        process.exit(0)
    }
});
