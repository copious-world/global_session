const {spawn} = require('child_process')
const {conf_loader} = require('../lib/utils')



// ----
let conf_file = process.argv[2]
let default_path = './test/mid_relay.conf'
let conf = conf_loader(conf_file,default_path)

if ( conf_file === undefined ) conf_file = default_path

console.log("conf file")
console.dir(conf)
console.log(process.cwd())


// Uses the static path chosen by config... field -> edge_supported_relay
//let mid_lru = spawn('node',[  '--inspect-brk', './test/mid-test.js', conf_file])  //
let mid_lru = spawn('node',[ './test/mid-test.js', conf_file])  //

mid_lru.stdout.on('data', (data) => {
    let str = data.toString().trim()
    console.log(str);
});

mid_lru.stderr.on('data', (data) => {
    console.error("err[2]: " + data.toString());
});

mid_lru.on('exit', (code) => {
    console.log(`Child mid relay server exited with code ${code}`);
});


