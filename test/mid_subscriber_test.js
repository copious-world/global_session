const {conf_loader} = require('../lib/utils')

let SiblingServerClass = require('../lib/session_mid_sibling')
let conf = conf_loader(process.argv[2],'./test/mid_relay-sibling.conf')
console.dir(conf)



class SessionClusterServer extends SiblingServerClass {

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


