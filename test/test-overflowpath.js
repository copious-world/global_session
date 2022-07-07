

let {SessionPathIntercept} = require('../lib/session_midway_relay')



class Testable extends SessionPathIntercept {
    //
    constructor(path,path_conf,FanoutRelayerClass) {
        super(path,path_conf,FanoutRelayerClass)
        //
        this.maxout = path_conf.cache.el_count
        //
        if ( path_conf.which_test === 'fill-it' || true ) {
            let self = this
            path_conf.evictor = async (target_hash) => {
                let result = await self.send({
                    "_tx_op" : "C",
                    "_exec_op"  : "evictions-forward",
                    "conflict" : target_hash
                })
                return result
            }
        } else {
    console.log("----->>>>>> -==== setting evictor")
            let self = this
            path_conf.evictor = async (target_hash) => {
                let evict_list = self._LRUManager.run_targeted_evictions(target_hash)
    console.dir(evict_list)
                return true
            }
        }

        this._LRUManager.initialize(path_conf)

console.log("Testable")
console.dir(path_conf)
        if ( path_conf.which_test === 'fill-it' ) {
            this.fill_up_memory()
        } else {
            this.focus_on_bucket()
        }


    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ----
    fill_up_memory() {

        for ( let i = 0; i < this.maxout/2; i++ ) {
            let key = `key${i+1}-${Math.trunc(Math.random()*237)}`
            this._LRUManager.set(key,`{ this is a value test ${i}}`)
        }
                /**/
        let self = this
        let k = this.maxout/2
        setTimeout(async () => {
            /**/
console.log(`ADDING MORE ${k}, ${self.maxout}`)
            for ( let i = k; i < self.maxout; i++ ) {
                let key = `key${i+1}-${Math.trunc(Math.random()*237)}`
                await self._LRUManager.set(key,`{ this is a value test ${i}}`)
            }


            // try causing a problems with the same key over an over
console.log("CAUSE A PROBLEM!!!!")
            let key = `key${self.maxout}-${Math.trunc(Math.random()*237)}`
            for ( let i = 0; i < 100; i++ ) {
                await self._LRUManager.set(key,`{ this is a value test ${self.maxout}}`)
            }
console.log("PROBLEM CAUSED")

            self._LRUManager.report_stats((table) => { console.dir(table)})

        },1000)
    }

    focus_on_bucket() {
        setTimeout(async () => {
            console.log("------------------------------------>FOCUSSING ON BUCKET")
            let token_list = []
            for ( let i = 0; i < 40; i++ ) {
                let augmented_hash_token = "100-" + Math.trunc(Math.random()*10000)
                token_list.push(augmented_hash_token)
                console.log(i,augmented_hash_token)
                await this._LRUManager.set_with_token(augmented_hash_token,`{ this is a value test ${i}}`)
            }
            this._LRUManager.report_stats((table) => { console.dir(table)})
            while ( token_list.length ) {
                let token = token_list.shift()
                //
                let v  = await this._LRUManager.get_with_token(token)
                console.log(v)
            }
        },1200)
    }

}

module.exports = Testable