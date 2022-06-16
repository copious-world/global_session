
const LRU = require('shm-lru-cache')
const {fix_path} = require('./utils')


// LRUManager
// Interface the LRU..
//    The LRUManager is a member of the session object. Future implementations may use an array of LRUManagers

class LRUManager {
    //
    constructor(conf) {
      //
      conf.module_path = conf.module_path.replace('/lib','')
      conf.module_path  = fix_path(conf.module_path)
      conf.cache.module_path = conf.module_path
    console.dir(conf)
      this.cache = new LRU(conf.cache)
      this.in_operation = true
      this.conf = conf
      //
    }
  
    initialize(conf) {
    }
  
    //
    set(key,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      let augmented_hash_token = this.cache.hash(key)
      this.cache.set(augmented_hash_token, sdata)   // store in the LRU cache
      return(augmented_hash_token)    // return the derived key
    }
  
    set_with_token(token,value) {
      let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
      this.cache.set(token, sdata)   // store in the LRU cache
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

    //
    disconnect(opt) {
      this.in_operation = false
      return this.cache.disconnect(opt)
    }
}

module.exports = LRUManager