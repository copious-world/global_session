
const ftok = require('ftok')

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
