// // // 
const {spawn} = require('child_process')

let readiness = false
let red_count = 0
let server_ready_promise = new Promise((resolve,rejects) => {
    let red_interval = setInterval(() => {
        if ( readiness ) {
            clearInterval(red_interval)
            resolve(readiness)
        }
        red_count++ 
        if ( red_count > 1000 ) {
            clearInterval(red_interval)
            rejects("timeout")
        }
        console.log("server ready " + red_count)
    },100)
})

let mid_lru = spawn('node',['./bin/index'])

// // // // // // 
mid_lru.stdout.on('data', (data) => {
    let str = data.toString().trim()
    if ( str.indexOf("READY") === 0 ) {
        readiness = true
    }
    if ( str.indexOf("READY") > 0 ) {
         let dat_lines = str.split('\n')
        while ( dat_lines.length ) {
            let ln = dat_lines.shift().trim()
            if ( ln === "READY" ) {
                readiness = true
            }
        }
    }
    console.log(str);
});

mid_lru.stderr.on('data', (data) => {
    console.error("err: " + data.toString());
});

mid_lru.on('exit', (code) => {
    console.log(`Child exited with code ${code}`);
});


let cli_children = []
async function start_local_clients() {

    try {
        await server_ready_promise;
    } catch (e) {
        process.exit(0)
    }

    let conf_file = 'session-service.conf'
    let conf_par = process.argv[2]
    if ( conf_par !== undefined ) {
        conf_file = conf_par
    }

    // client1_ready_promise
    let cl_readiness = false
    let cl_red_count = 0
    let client1_ready_promise = new Promise((resolve,rejects) => {
        let cl_red_interval = setInterval(() => {
            if ( cl_readiness ) {
                clearInterval(cl_red_interval)
                resolve(cl_readiness)
            }
            cl_red_count++ 
            if ( cl_red_count > 1000 ) {
                clearInterval(cl_red_interval)
                rejects("timeout")
            }
            console.log("parent proc>> client 1 ready " + cl_red_count)
        },100)
    }) 


    // CLIENT 1
    let client_1 = spawn('node',['./test/test-clients',conf_file,1],{"stdio" : ['pipe','pipe','pipe','ipc']})

    // // // // // // 
    client_1.stdout.on('data', (data) => {
        let str = data.toString().trim()
        if ( str.indexOf("Client connected to: localhost :  5110") >= 0 ) {
            cl_readiness = true
            console.log("__" + str + "__");
        }
        console.log(str);
    });

    client_1.stderr.on('data', (data) => {
        console.error("err[1]: " + data.toString());
    });

    client_1.on('exit', (code) => {
        console.log(`Child client_1 exited with code ${code}`);
    });

    cli_children.push(client_1)

    try {
        await client1_ready_promise;
    } catch (e) {
        process.exit(0)
    }


    // client2_ready_promise
    let cl2_readiness = false
    let cl2_red_count = 0
    let client2_ready_promise = new Promise((resolve,rejects) => {
        let cl2_red_interval = setInterval(() => {
            if ( cl2_readiness ) {
                clearInterval(cl2_red_interval)
                resolve(cl2_readiness)
            }
            cl2_red_count++ 
            if ( cl2_red_count > 1000 ) {
                clearInterval(cl2_red_interval)
                rejects("timeout")
            }
            console.log("parent proc>> client 2 ready " + cl2_red_count)
        },100)
    })


    // CLIENT 2
    let client_2 = spawn('node',['./test/test-clients',conf_file,2],{"stdio" : ['pipe','pipe','pipe','ipc']})

    // // // // // // 
    client_2.stdout.on('data', (data) => {
        let str = data.toString().trim()
        if ( str.indexOf("Client connected to: localhost :  5110") >= 0 ) {
            cl2_readiness = true
            console.log("__" + str + "__");
        }
        console.log(str);
    });

    client_2.stderr.on('data', (data) => {
        console.error("err[2]: " + data.toString());
    });

    client_2.on('exit', (code) => {
        console.log(`Child client_2 exited with code ${code}`);
    });

    cli_children.push(client_2)

    await client2_ready_promise

    client_2.send({ "cmd" : "go", "client" : 2 })
/*
    let client_3 = spawn('node',['./test/test-clients',conf_file,3])

    // // // // // // 
    client_3.stdout.on('data', (data) => {
        let str = data.toString().trim()
        console.log(str);
    });

    client_3.stderr.on('data', (data) => {
        console.error("err[2]: " + data.toString());
    });

    client_3.on('exit', (code) => {
        console.log(`Child client_2 exited with code ${code}`);
    });

    cli_children.push(client_3)

*/

    client_1.on("message", (message) => {
        console.log(message)
    })

    client_2.on("message", (message) => {
        console.log(message)
        if ( message.executed === "go" ) {
            client_1.send({ "cmd" : "go", "client" : 1 })
        }
    })

}



// // // // // // 
process.on('SIGINT', async () => {
    try {
        for ( cl of cli_children ) {
            cl.kill('SIGINT')
        }
        mid_lru.kill('SIGINT');
        process.exit(0)
    } catch (e) {
        console.log(e)
        process.exit(0)
    }
});


start_local_clients()