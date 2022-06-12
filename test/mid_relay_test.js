const fs = require('fs')
const {spawn} = require('child_process')





let conf_file = process.argv[2]
let conf_str = fs.readFileSync(conf_file)
let conf = JSON.parse(conf_str)

console.log("conf file")
console.dir(conf)
console.log(process.cwd())


let mid_lru = spawn('node',['./bin/index', conf_file])

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


