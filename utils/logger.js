// Copyright 2018. box.la authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const Logger = require('mini-logger');
const path = require('path');
const config = global.config.info;
const jsonFormat = require("json-format");

var jsonOption = {
  type: 'space',
  size: 2
}

let logger = Logger({
  dir: path.join(config.DIR, 'log'),
  categories: [ 'error', 'errorcode' ,'info' ],
  format: '[{category}.]YYYY-MM-DD[.log]',
  stdout: true,
  timestamp: true
});

logger._options.categories.forEach(function(key){
  let fn = logger[key];
  logger[key] = function(){
    let err = new Error().stack;
    let reg = new RegExp("at.*?" +global.config.info.DIR + ".*?\\:.*?\\:", "g");
    let paths = err.match(reg);
    let path = paths[1].replace("("+global.config.info.DIR, '').replace(":",' ')+"\n";
    for(let j=0; j<arguments.length; j++){
      if(Object.prototype.toString.call(arguments[j]) === "[object Object]"){
        arguments[j] = jsonFormat(arguments[j], jsonOption);
      }
    }
    Array.prototype.unshift.call(arguments,path)
    fn.apply(this,arguments);
  }
});

exports.logger = logger;

let httplogger = Logger({
  dir: path.join(config.DIR, 'log'),
  categories: [ 'http' ],
  format: '[{category}.]YYYY-MM-DD[.log]',
  timestamp: true
});

exports.httpLogger = async function(ctx, next){
    await next();
    if(ctx.header["x-real-ip"]!=null){
      ctx.request.ip = ctx.header["x-real-ip"];
    }
    console.log(new Date(), '[http]', ctx.request.ip, ctx.method, ctx.url, ctx.header["accept-language"], ctx.response.status, ctx.response.message);
    httplogger.http(ctx.request.ip, ctx.method, ctx.url, ctx.header["accept-language"], ctx.header["user-agent"], ctx.response.status, ctx.response.message);
    
}

