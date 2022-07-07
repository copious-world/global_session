
const LRU = require('shm-lru-cache')
const {fix_path} = require('./utils')


// LRUManager
// Interface the LRU..
//    The LRUManager is a member of the session object. Future implementations may use an array of LRUManagers

class LRUManager {
    //
    constructor(conf) {
      //
      if ( conf.module_path !== undefined ) {
        conf.module_path = conf.module_path.replace('/lib','')
        conf.module_path  = fix_path(conf.module_path)
        conf.cache.module_path = conf.module_path  
      }
      if ( conf.token_path !== undefined && conf.cache.token_path === undefined ) {
        conf.cache.token_path = conf.token_path
      }
      //
      this.cache = new LRU(conf.cache)
      if ( conf.cache.stop_child ) {
        this.cache.set_sigint_proc_stop(() => { process.exit(0) })
      }
      this.in_operation = true
      this.conf = conf
      this.lru_evictor = false
      this.running_evictions = false
      this.eviction_queue = []
      this.evict_queue_busy = false
      //
      this.stat_table = {}
      //
      this.initialize(conf)
    }

    initialize(conf) {
      if ( typeof conf.evictor === "function" ) {
        this.lru_evictor = conf.evictor
      } else if ( typeof conf.evictor === "string" ) {
        this.lru_evictor = require(conf.evictor)
        this.lru_evictor.init(conf)
      }
    }

    pure_hash(key) {
      return this.cache.pure_hash(key)
    }

    augment_hash(hash) {
      return this.cache.augment_hash(hash)
    }


    #add_stat(stat_key) {
      if ( this.stat_table[stat_key] ) {
        this.stat_table[stat_key]++
      } else {
        this.stat_table[stat_key] = 1
      }
    }

    report_stats(func) {
      if ( typeof func === "function" ) {
        func(this.stat_table)
      }
    }
   

    async #lru_eviction(target_hash) {
      if ( this.lru_evictor ) {
        this.running_evictions = true
        let status = await this.lru_evictor(target_hash)
        this.running_evictions = false
        return status
      }
      return false
    }
  
    //
    async set(key,value) {
      let augmented_hash_token = this.cache.hash(key)
//console.log("test",`${augmented_hash_token} :: ${key} :: ${value}`)
      return await this.set_with_token(augmented_hash_token,value,key)
    }

    // ----
    async set_with_token(augmented_hash_token,value,key,busy_q) {
      //
      if ( this.running_evictions || (busy_q === undefined) ) {
        this.eviction_queue.push([augmented_hash_token,value])
      }
      //
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let status = await this.cache.set(augmented_hash_token, sdata)   // store in the LRU cache
      if ( status === false ) {
        this.eviction_queue.push([augmented_hash_token,value])
        this.#add_stat("RUNNING EVICTIONS")
        //
        status = await this.#lru_eviction(augmented_hash_token)  // no longer running evictions at return
        if ( status ) {
          if ( !(this.evict_queue_busy) ) {
            this.evict_queue_busy = true
            while ( this.eviction_queue.length ) {
              let [t,v] = this.eviction_queue.shift()
              await this.set_with_token(t,v,false,this.evict_queue_busy)  // on at a time -- should not recurse...
            }
            this.evict_queue_busy = false  
          }
        }
        //
      }
    }


    // ----
    hash_set(key,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let augmented_hash_token = this.cache.hash(key)
      let hh_unidentified = this.cache.hasher(sdata)
      this.set_with_token(augmented_hash_token, hh_unidentified)   // store in the LRU cache
      return(hh_unidentified)    // return the derived key
    }
  
    // ----
    check_hash(hh_unid,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let hh_unidentified = this.cache.hasher(sdata)
      return hh_unidentified === hh_unid
    }
    
    // ----
    delete(key) { // token must have been returned by set () -> augmented_hash_token
      let augmented_hash_token = this.cache.hash(key)
      this.cache.del(augmented_hash_token)
    }

    // ----
    async get(key) {    // token must have been returned by set () -> augmented_hash_token
      let augmented_hash_token = this.cache.hash(key)
      let value = await this.cache.get(augmented_hash_token)
      if ( typeof value !== 'string' ) {
        return false
      }
      return value
    }

    // ----
    async get_with_token(token) {
        let value = await this.cache.get(token)
        if ( typeof value !== 'string' ) {
          return false
        }
        return value  
    }

    // ----
    run_evictions() {  // one process will run this 
      let time_shift = 0
      let reduced_max = 20
      let evict_list = this.cache.immediate_mapped_evictions(time_shift,reduced_max)
      return evict_list
    }

    // ----
    run_targeted_evictions(augmented_hash) {  // one process will run this 
      let time_shift = 0
      let reduced_max = 20
      let evict_list = this.cache.immediate_targeted_evictions(augmented_hash,time_shift,reduced_max)
      return evict_list
    }


    // ----
    disconnect(opt) {
      this.in_operation = false
      return this.cache.disconnect(opt)
    }
}

module.exports = LRUManager