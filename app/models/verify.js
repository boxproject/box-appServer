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
'use strict';
const Crypto = require('crypto');
const verify = Crypto.createVerify('SHA256');
const P = require(global.config.info.DIR + '/utils/promise').P;
const dbhelper = require(global.config.info.DIR + '/utils/dbhelper');
const pool = dbhelper.pool;
const queryFormat = dbhelper.queryFormat;
const Utils = require('../../utils/utils');
const NodeRSA = require('node-rsa');

/**
 * @function 验证客户端签名信息
 * @param  {string} msg       // 签名的原始信息
 * @param  {string} pub_key   // 公钥
 * @param  {string} sign_info // 签名值
 * @returns {bool}
 * @author david
 */
exports.signInfo = async (msg, pub_key, sign_info) => {
  let p = await Utils.insert_str(pub_key, '\n', 64);
  p = '-----BEGIN RSA PUBLIC KEY-----\n' + p + '-----END RSA PUBLIC KEY-----';
  let key = new NodeRSA(p);
  let pass = key.verify(msg, sign_info, 'utf8', 'base64');
  return pass;
}

/**
 * @function 检测指定业务流模板哈希是否存在
 * @param {string} flow_hash   // 审批流哈希值
 * @returns {bool}
 * @author david
 */
exports.flowHashExists = async (flow_hash) => {
  let query = queryFormat(`select id from tb_business_flow where flowHash = ?`, [flow_hash]);
  let data = await P(pool, 'query', query);
  return data.length ? true : false;
}

/**
 * @function  验证是否为私钥APP账号
 * @param   {string} app_account_id   // 账号唯一标识符
 * @return  {bool}
 * @author  david
 */
exports.isAdminAccount = async (app_account_id) => {
  let query = queryFormat('select id from tb_accounts_info where appAccountID = ?', [app_account_id]);
  let data = await P(pool, 'query', query);
  return data.length ? false : true;
}

/**
 * @function 验证是否提交过注册申请
 * @param   {string} applyer_id 申请者账号唯一标识符
 * @param   {string} captain_id 直属上级账号唯一标识符
 * @return  {bool}
 * @author  david
 */
exports.hasApplyedRegistration = async (applyer_id, captain_id) => {
  let query = queryFormat('select id from tb_registration_history where applyer = ? and captain = ? and isDeleted = 0', [applyer_id, captain_id]);
  let data = await P(pool, 'query', query);
  return data.length ? true : false;
}

/**
 * @function 检测账号是否存在
 * @param {string} app_account
 * @return {bool}
 * @author david
 */
exports.accExists = async (app_account) => {
  let query = queryFormat('select acc.id from tb_accounts_info acc left join tb_registration_history rh on rh.applyerAcc = acc.account where acc.account = ? and rh.consent = 2', [app_account]);
  let data = await P(pool, 'query', query);
  return data.length ? true : false;
}

/**
 * @function 检测转账地址是否为充值地址
 */
exports.toIsFrom = async (to_addr) => {
  let query = queryFormat('select address from tb_currency where address = ?', [to_addr]);
  let data = await P(pool, 'query', query);
  return data.length ? true : false;
}
