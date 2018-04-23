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
const config = global.config;
const logger = require('./logger').logger;
const P = require(global.config.info.DIR + '/utils/promise').P;
const RPC = require('./rpc');
const Capital = require('../app/models/capital');

/**
 * @function：处理http请求的错误信息
 * @returns: 已知的errorcode按正确的请求处理，格式化信息后输出
 *           未知的错误信息，返回errorcode为500
 * @author：jay
 */
exports.handleError = async function(ctx, next){
  try{
    await next();
  }catch (err){
    if (typeof err.code === 'number') {
      try{
        let state = {
          method: err.ctx.method,
          url: err.ctx.url,
          language: err.ctx.header['content-language'],
          body: err.ctx.request.body,
          ip: err.ctx.request.ip
        }
        logger.errorcode("errorCode:",err.code, 
        "errorMessage:", err.message, 
        "errorState:", state);
      }catch(e){
        logger.error(e);
      }
      ctx.status = 200;
      ctx.body = {
        code: err.code,
        message: err.message
      }
    } else {
      logger.error(err);
      ctx.status = 500;
      ctx.body = {
        detail
      } 
    }
  }
}

/**
 * 在指定位置插入字符串
 * @param str
 * @param insert_str
 * @param sn
 * @returns {string}
 */
exports.insert_str = async function (str, insert_str, sn) {
  var newstr = "";
  for (var i = 0; i < str.length; i += sn) {
      var tmp = str.substring(i, i + sn);
      newstr += tmp + insert_str;
  }
  return newstr;
}
