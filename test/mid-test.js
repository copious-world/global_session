#!/usr/bin/env node
//
const {conf_loader} = require("../lib/utils")


let cpath = process.argv[2]
if ( cpath === "--inspect-brk" ) {
    cpath = process.argv[3]
}

//
let conf = conf_loader(cpath,'session-service.conf')
console.dir(conf)

if ( conf === false ) {
    console.log("failed to load configuration")
}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
process.on('SIGINT', async () => {
    try {
        process.exit(0)
    } catch (e) {
        console.log(e)
        process.exit(0)
    }
});


if ( conf.full_edge || conf.half_edge || (conf.edge_supported_relay === undefined) ) {

    const SessionMidpoint = require('../lib/session_preasure_relief')

    class SessionClusterServer extends SessionMidpoint {

        constructor(conf) {
            super(conf)
        }
    
        report_status() {
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }
    
    }
    
    let cl_server = new SessionClusterServer(conf)
    cl_server.report_status()

} else if ( conf.edge_supported_relay ) {

    // FanoutClass --> The kind of relay client, multi-path-relay, multi-client-relay or just a single client
    let FanoutClass = false
    if ( typeof conf.custom_fanout_relayer === "string" ) {
        FanoutClass = require(conf.custom_fanout_relayer)
    }

    // ServeMessageRelay is from 'message-relay-services'
    //
    const {inject_path_handler,ServeMessageRelay} = require('../lib/session_midway_relay')
    // configure with conf.auth_path ... 
    inject_path_handler(conf)  // inject SessionPathIntercept into the list of classes. Configure the path name only...
    //
    class SessionClusterServer extends ServeMessageRelay {

        constructor(conf,FanoutClass) {
            super(conf,FanoutClass)
        }
    
        report_status() {
            console.log("THIS IS MIDTEST")
            console.log(Object.getPrototypeOf(this))
            console.log(Object.getPrototypeOf(super.constructor))
            console.log(Object.getPrototypeOf(super.constructor.constructor))
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }


        add_connection(client_name,writer) {

            let con_result = super.add_connection(client_name,writer)
            //

            let dat_handler = this.messenger_connections[client_name]

            console.log(client_name)
            console.log(Object.getPrototypeOf(dat_handler))
            //
            return con_result

        }
    
        add_data_and_react(client_name,data) {
    console.log("GOT DATA ")
    console.log(data.toString())
            //... when ready, use the data handler object to determine the fate of the message.
           let mescon = this.messenger_connections[client_name]
           if ( mescon ) mescon.data_handler(data) // RESPOND TO DATA 
       }
   
    }
    
    let cl_server = new SessionClusterServer(conf,FanoutClass)
    cl_server.report_status()

}
