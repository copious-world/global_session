
const ftok = require('ftok')
const fs = require('fs')

function fix_path(a_path) {
    let n = a_path.length
    while ( a_path[n-1] === '/' ) {
        a_path = a_path.substr(0,n-1)
        n--
    } 
    return a_path
}


module.exports.fix_path = fix_path

function make_process_identifier() {
    let path = process.cwd()
    return ftok(path)
}
  

module.exports.make_process_identifier = make_process_identifier



function conf_loader(conf_path,default_path) {
    if ( (default_path !== undefined) && !conf_path ) {
        conf_path = default_path
    }
    if ( (typeof conf_path === 'string') && (conf_path.length > 0) ) {
        //
        try {
            let conf_str = fs.readFileSync(conf_path)
            let conf_obj = JSON.parse(conf_str)
            return conf_obj
        } catch (e) {
            console.log(e)
        }
        //
    }
    return false
}

module.exports.conf_loader = conf_loader