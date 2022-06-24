
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
      this.eviction_queue_tokens = []
      this.evict_queue_tokens_busy = false
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


    async #lru_eviction() {
      if ( this.lru_evictor ) {
        this.running_evictions = true
        let status = await this.lru_evictor()
        this.running_evictions = false
        return status
      }
      return false
    }
  
    //
    async set(key,value) {
      if ( this.running_evictions || this.evict_queue_busy ) {
        this.eviction_queue.push([key,value])
      }
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let augmented_hash_token = this.cache.hash(key)
      let status = this.cache.set(augmented_hash_token, sdata)   // store in the LRU cache
      if ( status === false ) {
        this.eviction_queue.push([key,value])
        status = await this.#lru_eviction() // no longer running evictions at return
        if ( status ) {
          this.cache.set(augmented_hash_token, sdata)
          this.evict_queue_busy = true
          while ( this.eviction_queue.length ) {
            let [k,v] = this.eviction_queue.shift()
            await this.set(k,v)  // on at a time -- should not recurse...
          }
          this.evict_queue_busy = false
        }
      }
      return(augmented_hash_token)    // return the derived key
    }


    // ----
    async set_with_token(token,value) {
      if ( this.running_evictions || this.evict_queue_tokens_busy ) {
        this.eviction_queue_tokens.push([token,value])
      }
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let status = this.cache.set(token, sdata)   // store in the LRU cache
      if ( status === false ) {
        this.eviction_queue.push([token,value])
        status = await this.#lru_eviction()  // no longer running evictions at return
        if ( status ) {
          this.evict_queue_tokens_busy = true
          while ( this.eviction_queue_tokens.length ) {
            let [t,v] = this.eviction_queue_tokens.shift()
            await this.set_with_token(t,v)  // on at a time -- should not recurse...
          }
          this.evict_queue_tokens_busy = false
        }
      }
    }
  
    hash_set(key,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let augmented_hash_token = this.cache.hash(key)
      let hh_unidentified = this.cache.hasher(sdata)
      this.cache.set(augmented_hash_token, hh_unidentified)   // store in the LRU cache
      return(hh_unidentified)    // return the derived key
    }
  
    check_hash(hh_unid,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let hh_unidentified = this.cache.hasher(sdata)
      return hh_unidentified === hh_unid
    }
    
    //
    delete(key) { // token must have been returned by set () -> augmented_hash_token
      let augmented_hash_token = this.cache.hash(key)
      this.cache.del(augmented_hash_token)
    }
  
    //
    async get(key) {    // token must have been returned by set () -> augmented_hash_token
      let augmented_hash_token = this.cache.hash(key)
      let value = await this.cache.get(augmented_hash_token)
      if ( typeof value !== 'string' ) {
        return false
      }
      return value
    }

    get_with_token(token) {
        let value = this.cache.get(token)
        if ( typeof value !== 'string' ) {
          return false
        }
        return value  
    }

    run_evictions() {  // one process will run this 
      let time_shift = 0
      let reduced_max = 20
      let evict_list = this.cache.immediate_mapped_evictions(time_shift,reduced_max)
      return evict_list
    }

    //
    disconnect(opt) {
      this.in_operation = false
      return this.cache.disconnect(opt)
    }
}

module.exports = LRUManager