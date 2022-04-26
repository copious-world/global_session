let reqs = require('../lib/utils')


function pass(tname) {
    console.log(`${tname} \t-> OK`)
}

function fail(tname) {
    console.log(`${tname} \t-> FAIL`)
}

let dog_assert_eq = (p,q,tname) => {
    let t = p === q
    if ( t ) {
        pass(tname)
    } else fail(tname)
    return t
}

let tok = reqs.make_process_identifier()
dog_assert_eq(tok,268270,"process id")

let p = reqs.fix_path("this/is/a/path/")
dog_assert_eq(p,"this/is/a/path","fix_path single")

p = reqs.fix_path("this/is/a/path////")
dog_assert_eq(p,"this/is/a/path","fix_path too many")

p = reqs.fix_path("///")
dog_assert_eq(p,"","fix_path only")

p = reqs.fix_path("cool/path")
dog_assert_eq(p,"cool/path","fix_path no need")
