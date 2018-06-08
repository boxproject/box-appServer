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
const rp = require('request-promise');
const logger = require('./logger').logger;
/**
 * @function：发送POST或GET请求
 * @returns: 请求成功，则返回接口请求返回的数据
 *           请求失败时，返回false，并记录错误信息
 * @author：david
 */
exports.rpcRequest = async function (method, host, url, params_obj, callback) {
    let options = {
        method: method,
        uri: host + url,
        rejectUnauthorized: false,
        timeout: 3000
    }
    if (method == 'GET') {
        if (params_obj) {
            options.qs = params_obj;
        }
    } else if (method == 'POST') {
        if (params_obj) {
            options.formData = params_obj;
        }
    }
    rp(options)
        .then(function (repos) {
            if (typeof repos != 'object') repos = JSON.parse(repos);
            if (repos.RspNo == 0) {
                callback(repos);
            } else {
                logger.info('repRequest error url:', url);
                logger.info('rpcRequest error:', repos);
                callback(false);
            }
        })
        .catch(function (err) {
            logger.info('rpcRequest error:', err);
            callback(false)
        });
}
