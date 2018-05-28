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
const eError = require(global.config.info.DIR + '/utils/error');
const logger = require(global.config.info.DIR + '/utils/logger').logger;
const rData = require(global.config.info.DIR + '/utils/rdata');
const User = require('../models/user');
const Verify = require('../models/verify');
const ERROR_CODE = 1000;

/**
 * @function 将下属提交的注册信息存入数据库
 *              如果首次提交，直接存入数据库，否则提示重复提交
 *              单次申请保留30s
 * @author david
 */
exports.applyForAccount = async (ctx) => {
  let { msg, applyer_id, captain_id, applyer_account } = ctx.request.body
  logger.info('用户提交注册信息_param', {
    msg: msg,
    applyer_id: applyer_id,
    captain_id: captain_id,
    applyer_account: applyer_account
  });
  if (!msg || !applyer_id || !captain_id || !applyer_account) throw new eError(ctx, ERROR_CODE + 1);
  // 检测账号是否存在
  let acc_exists = await Verify.accExists(applyer_account);
  if (acc_exists) throw new eError(ctx, ERROR_CODE + 10);
  // 检测app_account_id
  let employee_account_info = await User.getAccountInfoByAppAccountID(applyer_id);
  if (employee_account_info && employee_account_info.departured == 0) {
    // 账号已存在
    throw new eError(ctx, ERROR_CODE + 10);
  } else if (employee_account_info && employee_account_info.departured == 1) {
    // 已离职
    throw new eError(ctx, ERROR_CODE + 11);
  }
  // 检测是否提交过相同申请
  let has_applyed = await Verify.hasApplyedRegistration(applyer_id, captain_id);
  if (has_applyed) throw new eError(ctx, ERROR_CODE + 2);
  // 将申请记录存入tb_registration_history中
  let registration_id = await User.addRegistration(applyer_id, captain_id, msg, applyer_account);
  if (!registration_id) throw new eError(ctx, ERROR_CODE + 9);
  // 是否是向私钥APP申请注册
  let is_admin_account = await Verify.isAdminAccount(captain_id);
  logger.info('扫描私钥APP注册', is_admin_account);
  if (is_admin_account) {
    // 向代理服务器提交注册信息
    let data = await User.applyTegistrationToServer(registration_id, msg, applyer_id, captain_id, applyer_account, 0);
    logger.info('请求代理服务器接口', data);
    if (!data) {
      // 撤销已提交的申请
      await User.updateCaptainApprovalInfo(registration_id, 1);
      throw new eError(ctx, ERROR_CODE + 9);
    }
  }
  logger.info('用户提交注册信息_out', { reg_id: registration_id });
  return ctx.body = new rData(ctx, "GEN_ACCOUNT", { reg_id: registration_id });
}

/**
 * @function 获取指定上司所涉及的注册申请
 * @author david 
 */
exports.getRegistrationInfo = async (ctx) => {
  let { captain_id } = ctx.query;
  if (!captain_id) throw new eError(ctx, ERROR_CODE + 1);
  // 获取该管理员所涉及的注册申请列表
  let registration_info = await User.getRegistration(captain_id, null);
  if (registration_info && registration_info.length > 5) {
    // 默认最多返回最新5条记录，其余记录删除
    let min_date_time = registration_info[registration_info.length - 1].apply_at;
    let max_date_time = registration_info[5].apply_at;
    await User.delRegistrationInfoByDateTime(min_date_time, max_date_time);
    registration_info = registration_info.slice(0, 5);
  }
  return ctx.body = new rData(ctx, 'GET_REGISTRATION', registration_info);
}

/**
 * @function 上级管理员审批下级员工的注册申请
 * @author david 
 */
exports.approvalRegistration = async (ctx) => {
  let { reg_id, consent } = ctx.request.body;
  if (!reg_id || !consent) throw new eError(ctx, ERROR_CODE + 1);
  logger.info('上级审批注册申请', {
    reg_id: reg_id,
    consent: consent
  });
  // 获取注册申请信息
  let registration_info = await User.getRegistrationByRegID(reg_id, 0);
  if (!registration_info) throw new eError(ctx, ERROR_CODE + 3);
  // 审批通过
  if (consent == 2) {
    let { applyer_pub_key, cipher_text, en_pub_key } = ctx.request.body;
    logger.info('上级审批注册申请_审批通过', {
      applyer_pub_key: applyer_pub_key,
      cipher_text: cipher_text,
      en_pub_key: en_pub_key
    });
    if (!applyer_pub_key || !cipher_text || !en_pub_key) throw new eError(ctx, ERROR_CODE + 1);
    let is_uploaded = 1;
    // 获取直属上级账号信息
    let captain_account_info = await User.getAccountInfoByAppAccountID(registration_info.captain_id);
    if (!captain_account_info) throw new eError(ctx, ERROR_CODE + 4);
    if (captain_account_info.departured) throw new eError(ctx, ERROR_CODE + 14);
    // 验证签名
    let sign_pass = await Verify.signInfo(applyer_pub_key, captain_account_info.pub_key, en_pub_key);
    logger.info('审批注册验证签名', sign_pass);
    if (!sign_pass) throw new eError(ctx, ERROR_CODE + 5);
    let depth = captain_account_info.depth + 1;
    let rgt = captain_account_info.rgt;
    if (captain_account_info.depth > 0) {
      is_uploaded = 0
    }
    await User.genAccount(registration_info.applyer_account, registration_info.applyer_id, applyer_pub_key, cipher_text, en_pub_key, rgt, registration_info.id, is_uploaded, depth)
  }
  // 记录上级审批结果
  logger.info('上级审批注册_out', { reg_id: reg_id, consent: consent });
  await User.updateCaptainApprovalInfo(reg_id, consent);
  return ctx.body = new rData(ctx, 'APPROVAL_REGISTRATION');
}

/**
 * @function 员工APP反馈上级审批注册结果出错
 * @author david 
 */
exports.cancelApprovalRegistration = async (ctx) => {
  let { reg_id, applyer_id, sign } = ctx.request.body;
  if (!reg_id || !applyer_id || !sign) throw new eError(ctx, ERROR_CODE + 1);
  // 获取员工账号信息
  let account_info = await User.getAccountInfoByAppAccountID(applyer_id);
  if (!account_info) throw new eError(ctx, ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, ERROR_CODE + 11);
  // 获取注册信息
  let reg_info = await User.getRegistrationByRegID(reg_id, 0);
  if (!reg_info) throw new eError(ctx, ERROR_CODE + 3);
  if (reg_info.applyer_id != applyer_id) throw new eError(ctx, ERROR_CODE + 7);
  // 验证签名
  let sign_pass = await Verify.signInfo(reg_id, account_info.pub_key, sign);
  logger.info('员工反馈注册审批出错_验签', sign_pass);
  if (!sign_pass) throw new eError(ctx, ERROR_CODE + 5);
  // 回滚信息
  await User.changeEmployee(applyer_id, account_info.lft, account_info.rgt);
  // 如果是根节点账号
  if (account_info.depth == 0) {
    let data = await User.applyTegistrationToServer(reg_id, reg_info.msg, applyer_id, reg_info.captain_id, account_info.account, 1);
    if (!data) throw new eError(ctx, ERROR_CODE + 12);
  }
  await User.updateCaptainApprovalInfo(reg_id, 1);
  return ctx.body = new rData(ctx, 'NOTICE');
}

/**
 * @function 私钥app审批注册
 * @author david
 */
exports.adminApprovalRegistration = async (ctx) => {
  let { regid, status } = ctx.request.body;
  if (!regid || !status) throw new eError(ctx, ERROR_CODE + 1);
  // 获取注册信息
  let reg_info = await User.getRegistrationByRegID(regid, 0);
  if (!reg_info) throw new eError(ctx, ERROR_CODE + 3);
  // 审批通过
  if (status == 2) {
    let { ciphertext, pubkey } = ctx.request.body;
    if (!ciphertext) throw new eError(ctx, ERROR_CODE + 1);
    await User.genAccount(reg_info.applyer_account, reg_info.applyer_id, pubkey, ciphertext, null, 0, reg_info.id, 1, 0)
  }
  // 记录上级审批结果
  await User.updateCaptainApprovalInfo(regid, status);
  return ctx.body = new rData(ctx, 'APPROVAL_REGISTRATION');
}

/**
 * @function 获取指定注册申请信息
 * @author david 
 */
exports.getRegistrationApprovalInfo = async (ctx) => {
  let { reg_id } = ctx.query;
  if (!reg_id) throw new eError(ctx, ERROR_CODE + 1);
  let reg_data = await User.getRegistrationByRegID(reg_id);
  if (!reg_data) throw new eError(ctx, ERROR_CODE + 3);
  let data = await User.getRegistrationByRegIDWithAcc(reg_id);
  return ctx.body = new rData(ctx, 'GET_REGISTRATION', data);
}

/**
 * @function 根节点获取非直属下属的公钥信息 
 * @author david 
 */
exports.getEmployeePubKeyInfoList = async (ctx) => {
  let app_account_id = ctx.query.app_account_id;
  logger.info('根节点获取下属公钥列表', app_account_id);
  if (!app_account_id) throw new eError(ctx, ERROR_CODE + 1);
  // 获取账号信息
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, ERROR_CODE + 11);
  if (account_info.depth != 0) throw new eError(ctx, ERROR_CODE + 7);
  // 获取未被上传的下属公钥信息列表
  let result = await User.getEmployeeEnPubKeyInfoList(app_account_id);
  if (result.account_ids.length) {
    await User.updateAccountsPubkeyUploadInfo(result.account_ids);
  }
  return ctx.body = new rData(ctx, 'EMPLOYEE_PUB_KEY', result.result);
}

/**
 * @function 获取指定下属公钥信息
 * @author dvid
 */
exports.getEmployeePubKeyInfo = async (ctx) => {
  let { manager_account_id, employee_account_id } = ctx.query;
  if (!manager_account_id || !employee_account_id) throw new eError(ctx, ERROR_CODE + 1);
  let manager_account_info = await User.getAccountInfoByAppAccountID(manager_account_id);
  if (!manager_account_info) throw new eError(ctx, ERROR_CODE + 4);
  if (manager_account_info.departured) throw new eError(ctx, ERROR_CODE + 11);
  if (manager_account_info.depth != 0) throw new eError(ctx, ERROR_CODE + 7);
  let employee_account_info = await User.getAccountInfoByAppAccountID(employee_account_id);
  if (!employee_account_info) throw new eError(ctx, ERROR_CODE + 8);
  if (employee_account_info.departured) throw new eError(ctx, ERROR_CODE + 13);
  let result = await User.getEmployeeEnPubKeyInfo(employee_account_id);
  if (result) {
    // 更新状态，标记公钥已上传根节点
    await User.updateAccountsPubkeyUploadInfo(result.applyer);
  }
  return ctx.body = new rData(ctx, 'EMPLOYEE_PUBKEY_INFO', result);
}

/**
 * @function 获取下属账号列表
 * @author david
 */
exports.getEmployeeAccountsList = async (ctx) => {
  let { app_account_id, key_words } = ctx.query;
  if (!app_account_id) throw new eError(ctx, ERROR_CODE + 1);
  let page = ctx.query.page || 1;
  let limit = ctx.query.limit || 20;
  if (typeof page == 'string') page = parseInt(page);
  if (typeof limit == 'string') limit = parseInt(limit);
  let employee_accounts_list = {};
  // 获取上级账号信息
  let manager_account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!manager_account_info) throw new eError(ctx, ERROR_CODE + 4);
  if (manager_account_info.departured) throw new eError(ctx, ERROR_CODE + 11);
  // 如果是搜索
  if (key_words) {
    employee_accounts_list = await User.searchAccountInfoByAccount(key_words, page, limit);
  } else {
    let depth = manager_account_info.depth + 1;
    // 获取下属账号信息
    employee_accounts_list = await User.getEmployeeAccountsByCaptainID(depth, manager_account_info.lft, manager_account_info.rgt, page, limit);
  }
  let result = {
    count: employee_accounts_list.count,
    total_pages: employee_accounts_list.total_pages,
    current_page: page,
    list: employee_accounts_list.data
  }
  return ctx.body = new rData(ctx, 'ACCOUNTS_LIST', result);
}

/**
 * @function 获取下属账号详情
 * @author david 
 */
exports.getEmployeeAccountsInfo = async (ctx) => {
  let { manager_account_id, employee_account_id } = ctx.query;
  if (!manager_account_id || !employee_account_id) throw new eError(ctx, ERROR_CODE + 1);
  // 获取上级账号信息
  let manager_account_info = await User.getAccountInfoByAppAccountID(manager_account_id);
  if (!manager_account_info) throw new eError(ctx, ERROR_CODE + 4);
  if (manager_account_info.departured) throw new eError(ctx, ERROR_CODE + 11);
  // 下级账号信息
  let employee_account_info = await User.getAccountInfoByAppAccountID(employee_account_id);
  if (!employee_account_info) throw new eError(ctx, ERROR_CODE + 8);
  if (employee_account_info.departured) throw new eError(ctx, ERROR_CODE + 13);
  // 是否有权获取
  if (manager_account_info.depth >= employee_account_info.depth) throw new eError(ctx, ERROR_CODE + 7);
  // 获取下属账户详情
  let employee_info = await User.getUnderlingInfoByManagerAccountID(employee_account_info.depth + 1, employee_account_info.lft, employee_account_info.rgt)
  let result = {
    app_account_id: employee_account_info.app_account_id,
    cipher_text: employee_account_info.cipher_text,
  }
  if (employee_info) result.employee_accounts_info = employee_info;
  return ctx.body = new rData(ctx, 'EMPLOYEE_ACCOUNT_INFO', result);
}

/**
 * @function 删除员/替换工账号
 * @author david
 */
exports.changeEmployeeAccount = async (ctx) => {
  let { employee_account_id, manager_account_id, sign, cipher_texts, replacer_account_id } = ctx.request.body;
  let msg = 'DEL_EMPLOYEE';
  logger.info('删除/替换员工账号', {
    employee_account_id: employee_account_id,
    manager_account_id: manager_account_id,
    sign: sign,
    cipher_texts: cipher_texts
  });
  if (!employee_account_id || !manager_account_id || !sign) throw new eError(ctx, ERROR_CODE + 1);
  // 获取上级账号信息
  let manager_account_info = await User.getAccountInfoByAppAccountID(manager_account_id);
  if (!manager_account_info) throw new eError(ctx, ERROR_CODE + 4);
  if (manager_account_info.departured) throw new eError(ctx, ERROR_CODE + 11);
  // 被删除/替换者账号信息
  let employee_account_info = await User.getAccountInfoByAppAccountID(employee_account_id);
  if (!employee_account_info) throw new eError(ctx, ERROR_CODE + 8);
  if (employee_account_info.departured) throw new eError(ctx, ERROR_CODE + 13);
  // 是否有权删除/替换
  if (manager_account_info.depth >= employee_account_info.depth) throw new eError(ctx, ERROR_CODE + 7);
  // 验证签名
  let sign_pass = await Verify.signInfo(employee_account_id, manager_account_info.pub_key, sign);
  if (!sign_pass) throw new eError(ctx, ERROR_CODE + 5);
  // 获取被删除或被替换者直属下级账号信息
  let employee_info = await User.getUnderlingInfoByManagerAccountID(employee_account_info.depth + 1, employee_account_info.lft, employee_account_info.rgt);
  // 更新摘要信息
  let data = await User.changeCipherInfo(employee_info, cipher_texts);
  if (data == -1) throw new eError(ctx, ERROR_CODE + 1);
  // 删除,更新摘要信息
  // await User.changeEmployee(employee_account_id, employee_account_info.lft, employee_account_info.rgt, data, employee_account_info.depth);
  await User.changeEmployee(employee_account_id, data);
  // 更新替换后的上下级关系
  if (replacer_account_id) {
    // 替换
    msg = 'REPLACE_EMPLOYEE';
    let replacer_account_info = await User.getAccountInfoByAppAccountID(replacer_account_id);
    if (!replacer_account_info) throw new eError(ctx, ERROR_CODE + 8)
    if (replacer_account_info.departured) throw new eError(ctx, ERROR_CODE + 13);
    if (replacer_account_info.depth != employee_account_info.depth) throw new eError(ctx, ERROR_CODE + 15);
    if (employee_info.length) {
      for (let r of employee_info) {
        await User.replaceEmployee(r.app_account_id, replacer_account_info.id);
      }
    }
  }
  return ctx.body = new rData(ctx, msg);
}
