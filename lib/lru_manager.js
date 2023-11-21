
const LRU = require('shm-lru-cache')
const {fix_path} = require('./utils')


// LRUManager
// Interface the LRU..
//    The LRUManager is a member of the session object. Future implementations may use an array of LRUManagers

/**
 * 
 */
class LRUManager {
    //
    constructor(conf) {
      //
      if ( conf.module_path !== undefined ) {
        conf.module_path = conf.module_path.replace('/lib','')
        conf.module_path  = fix_path(conf.module_path)
        conf.cache.module_path = conf.module_path  
      }
      if ( (conf.token_path !== undefined) && (conf.cache.token_path === undefined) ) {
        conf.cache.token_path = conf.token_path
      }
      //
      this.cache = (typeof conf.cache.custom_lru === 'function') ? new conf.cache.custom_lru(conf.cache) : new LRU(conf.cache)
      if ( conf.cache.stop_child ) {
        this.cache.set_sigint_proc_stop(() => { process.exit(0) })
      }
      this.in_operation = true
      this.conf = conf
      //
      this.lru_evictor = false
      this.running_evictions = false
      this.eviction_queue = []
      this.evict_queue_busy = false
      this.ev_interval = false
      //
      this.stat_table = {}
      //
      this.initialize(conf)
      if ( conf.eviction_schedule ) {
        this.init_eviction_schedule(conf)
      }
    }

    /**
     * Passes off initialization to the LRU evictor initialization method, `init`. The configuration object, `conf`, 
     * should have a field `evictor`, which may be a string for passing to `require` or 
     * a function. If the evictor is set, it will be called when an insertion fails. 
     * 
     * The evictor method must be asynchronous. In many implementations, the evictor will operate by sending a message to the CPU 
     * resident global session initializer. 
     * 
     * Called from the constructor... 
     * 
     * @param {object} conf 
     */
    initialize(conf) {
      if ( typeof conf.evictor === "function" ) {
        this.lru_evictor = conf.evictor
      } else if ( typeof conf.evictor === "string" ) {
        this.lru_evictor = require(conf.evictor)
        this.lru_evictor.init(conf)
      }
    }

    /**
     * 
     * @param {string} key 
     * @returns 
     */
    pure_hash(key) {
      return this.cache.pure_hash(key)
    }

    /**
     * 
     * @param {string} hash 
     * @returns 
     */
    augment_hash(hash) {
      return this.cache.augment_hash(hash)
    }

/*
    #add_stat(stat_key) {
      if ( this.stat_table[stat_key] ) {
        this.stat_table[stat_key]++
      } else {
        this.stat_table[stat_key] = 1
      }
    }
*/
    /**
     * 
     * @param {Function} func 
     */
    report_stats(func) {
      if ( typeof func === "function" ) {
        func(this.stat_table)
      }
    }
   

    /**
     * (private)
     * 
     * @param {string} target_hash 
     * @returns {boolean}
     */
    async #lru_eviction(target_hash_pair) {
      if ( this.lru_evictor ) {  // the object with an evict method and access to the hash table.
        this.running_evictions = true
        let status = await this.lru_evictor.evict(target_hash_pair)   // this is a pair in JS a two element array
        this.running_evictions = false
        return status
      }
      return false
    }
  
    //
    /**
     * The application determines the key, which should be a numeric hash of the value. 
     * The hash of the value should be almost unique for smooth operation of the underlying hash table data structure.
     * This method refers to the hash module class instance to obtain an augmented hash, which is really the hash annotaed with its
     * modulus determined by the hash table size.
     * 
     * @param {Number} key 
     * @param {object} value 
     * @returns {string} - a hyphenated string where the left is the modulus of the hash and the right is the hash itself.
     */
    async set(key,value) {
      let augmented_hash_pair = this.cache.hash_pair(key)
      return await this.set_with_token(augmented_hash_pair,value,key)
    }

    // ----
    /**
     * 
     * @param {string} augmented_hash_token 
     * @param {object} value 
     * @param {string} key 
     * @param {boolean} busy_q 
     */
    async set_with_token(augmented_hash_pair,value,key,busy_q) {
      //
      if ( this.running_evictions || (this.evict_queue_busy && (busy_q === undefined) ) ) {
        this.eviction_queue.push([augmented_hash_pair,value])
        return
      }
      //
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      //
      let status = await this.cache.set(augmented_hash_pair, sdata)   // store in the LRU cache SET
      //
      if ( status === false ) {
        this.eviction_queue.push([augmented_hash_pair,value])
        //this.#add_stat("RUNNING EVICTIONS")
        //
        status = await this.#lru_eviction(augmented_hash_pair)  // no longer running evictions at return
        //
        if ( status ) {
          if ( !(this.evict_queue_busy) ) {
            this.evict_queue_busy = true
            while ( this.eviction_queue.length ) {
              let [t,v] = this.eviction_queue.shift()
              await this.set_with_token(t,v,false,true)  // on at a time -- should not recurse...
            }
            this.evict_queue_busy = false  
          }
        }
        //
      }
    }


    // ----
    /**
     * 
     * @param {string} key 
     * @param {object} value 
     * @returns 
     */
    hash_set(key,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let augmented_hash_token = this.cache.hash(key)
      let hh_unidentified = this.cache.hasher(sdata)
      this.set_with_token(augmented_hash_token, hh_unidentified)   // store in the LRU cache
      return(hh_unidentified)    // return the derived key
    }
  
    // ----
    /**
     * 
     * @param {string} hh_unid 
     * @param {object|string} value 
     * @returns 
     */
    check_hash(hh_unid,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let hh_unidentified = this.cache.hasher(sdata)
      return hh_unidentified === hh_unid
    }
    
    // ----
    /**
     * 
     * @param {string} key 
     */
    delete(key) { // token must have been returned by set () -> augmented_hash_token
      let augmented_hash_token = this.cache.hash(key)
      this.cache.del(augmented_hash_token)
    }

    // ----
    /**
     * 
     * @param {string} key 
     * @returns 
     */
    async get(key) {    // token must have been returned by set () -> augmented_hash_token
      let augmented_hash_token = this.cache.hash(key)
      let value = await this.cache.get(augmented_hash_token)
      if ( typeof value !== 'string' ) {
        return false
      }
      return value
    }

    // ----
    /**
     * 
     * @param {string} token 
     * @returns 
     */
    async get_with_token(token) {
        let value = await this.cache.get(token)
        if ( typeof value !== 'string' ) {
          return false
        }
        return value  
    }

    // ----
    /**
     * 
     * @param {Number} time_shift 
     * @param {Number} reduced_max 
     * @returns 
     */
    run_evictions(time_shift,reduced_max) {  // one process will run this 
      let evict_list = this.cache.immediate_mapped_evictions(time_shift,reduced_max)
      return evict_list
    }

    // ----
    /**
     * 
     * @param {string} augmented_hash 
     * @returns 
     */
    run_targeted_evictions(augmented_hash) {  // one process will run this 
      let time_shift = 0
      let reduced_max = 20
      let evict_list = this.cache.immediate_targeted_evictions(augmented_hash,time_shift,reduced_max)
      return evict_list
    }

    // ----
    /**
     * 
     * @param {object} conf 
     */
    init_eviction_schedule(conf) {
      let self = this
      let e_sched = conf.eviction_schedule
      let time_shift = e_sched.time_sfhit ? parseInt(e_sched.time_sfhit) : 0
      let reduced_max = e_sched.max_evicts ? parseInt(e_sched.max_evicts) : 20
      let interval = parseInt(e_sched.intrerval)
      this.ev_interval = setInterval(() => {
        self.run_evictions(time_shift,reduced_max)
      },interval)

    }

    // ----
    /**
     * 
     * 
     * The option paramter may have a field `save_backup`, which if true will cause the cache's disconnect method to 
     * save buffers. How the cache object does this is up to the implementations from either
     * `cache.custom_lru(conf.cache)` OR `LRU(conf.cache)`
     * 
     * @param {object} opt 
     * @returns {boolean}
     */
    disconnect(opt) {
      if ( this.ev_interval ) {
        clearInterval(this.ev_interval)
        this.ev_interval = false
      }
      this.in_operation = false
      return this.cache.disconnect(opt)
    }

}

module.exports = LRUManager