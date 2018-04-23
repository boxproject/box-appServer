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
'use strict'
/**
 * @function Promise的封装函数
 * @returns {Promise} P(pool,'pool',query)
 * @info  若要使用该函数,则需要封装的异步函数最后一个参数为回调函数.
 *        该回调函数的具体形式为函数里的let=callback,回调函数如
 *        果是两个参数及以上则默认第一个参数为error(目前不支持两个
 *        以上参数).
 *        传入参数:第一个为执行函数的上下文,第二个参数为要执行的函
 *        数(字符串形式),以后为执行函数需要的参数.
 * @example 如读取文件函数 fs.readFile(file[, options], callback)
 *          封装后如下形式 P(fs,'readFile',file[,options])
 */
exports.P = function(){
  let that = arguments[0];
  let fn = arguments[1];
  let args = Array.prototype.slice.call(arguments,2);
  return new Promise(function(resolve,reject){
    let callback = function(){
      if(arguments[0] instanceof Error){
        return reject(arguments[0]);
      }else if(arguments.length<2){
        resolve(arguments[0]);
      }else{
        if(arguments[0]){
          reject(arguments[0]);
        }else{
          resolve(arguments[1]);
        }
      }
    };
    args.push(callback);
    that[fn].apply(that,args);
  });
};