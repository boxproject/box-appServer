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
const Capital = require('../models/capital');
const User = require('../models/user');
const Business = require('../models/business');
const Verify = require('../models/verify');
const BigNumber = require('bignumber.js');
const UUID = require('uuid/v4');
const crypto = require('crypto');
const UNIVERSAL_ERROR_CODE = 1000;
const ERROR_CODE = 2000;

/**
 * @function 获取转账列表
 * @author david
 */
exports.getTransferRecordsList = async (ctx) => {
  let app_account_id = ctx.query.app_account_id;
  if (!app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let type = ctx.query.type || 0;
  let progress = ctx.query.progress || 0;
  let page = ctx.query.page || 1;
  let limit = ctx.query.limit || 20;
  if (typeof page == 'string') page = parseInt(page);
  if (typeof limit == 'string') limit = parseInt(limit);
  // 获取账号信息
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  let data = await Capital.getTransferRecordsListByAppID(account_info.id, type, progress, page, limit);
  return ctx.body = new rData(ctx, 'TRANSFER_LIST', data);
}

/**
 * @function 提交转账申请
 * @author david
 */
exports.applyTransfer = async (ctx) => {
  let { app_account_id, apply_info, flow_id, sign } = ctx.request.body;
  logger.info('用户提交转账申请', {
    app_account_id: app_account_id,
    apply_info: apply_info,
    flow_id: flow_id,
    sign: sign
  });
  if (!app_account_id || !apply_info || !flow_id || !sign) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  // 获取申请者账号信息
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  // 验证签名信息
  let pub_key = account_info.pub_key;
  let pass = await Verify.signInfo(apply_info, pub_key, sign);
  logger.info('申请转账验签', pass);
  if (!pass) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 5);
  // 解析转账内容
  if (typeof apply_info != 'string') throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let apply_info_json = JSON.parse(apply_info);
  let { tx_info, to_address, miner, amount, currency, timestamp } = apply_info_json
  if (!apply_info || !tx_info || !to_address || !miner || !amount || !currency || !timestamp) throw new eError(ctx, ERROR_CODE + 1);
  // 获取币种信息
  let currency_info = await Capital.getCurrencyInfoByName(currency);
  if (!currency_info) throw new eError(ctx, ERROR_CODE + 2);
  // 获取对应的审批流
  let flow_info = await Business.getBusinessFlowInfo(flow_id, 2);
  if (!flow_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 6);
  // 查询审批流上链状态
  let flow_on_chain_status = await Business.businessFlowStatus(flow_info.flow_hash);
  logger.info('提交转账申请获取审批流上链状态', {hash: flow_info.flow_hash, status: flow_on_chain_status});
  // 更新审批流状态
  await Business.updateFlowStatus([flow_info]);
  if (flow_on_chain_status != 3) {
    throw new eError(ctx, UNIVERSAL_ERROR_CODE + 6);
  } else {
    // 提交转账申请
    let transfer_id = await Capital.applyTransfer(UUID(), tx_info, account_info.id, currency_info.currency_id, amount, flow_info.id, apply_info, sign, flow_info.content.approval_info[0].approvers);
    logger.info('提交转账申请_生成订单号', transfer_id);
    let transfer_info = await Capital.getTransferInfo(transfer_id, 0);
    if (!transfer_info) throw new eError(ctx, ERROR_CODE + 4);
    return ctx.body = new rData(ctx, 'APPLY_TRANSFER', { order_number: transfer_info.order_number })
  }
}

/**#
 * @function 获取指定转账记录详情
 * @author david
 */
exports.getTransInfoByOrderNumber = async (ctx) => {
  let { app_account_id, order_number } = ctx.query;
  if (!order_number || !app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  // 获取账户信息
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  // 获取转账信息
  let tx_info = await Capital.getTransferInfo(order_number, 1);
  if (!tx_info) throw new eError(ctx, ERROR_CODE + 5);
  let tx_content = JSON.parse(tx_info.apply_content);
  let result = {
    transfer_hash: tx_info.trans_hash,
    order_number: tx_info.order_number,
    tx_info: tx_content.tx_info,
    applyer: tx_info.applyer_acc,
    applyer_uid: tx_info.applyer_uid,
    progress: tx_info.progress,
    arrived: tx_info.arrived,
    apply_at: tx_info.apply_at,
    approval_at: tx_info.approval_at,
    reject_at: tx_info.reject_at,
    apply_info: tx_info.apply_content
  }
  // 获取审批流信息
  let flow_info = await Business.getBusinessFlowInfo(tx_info.flow_id, 0);
  if (!flow_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 6);
  let flow_content = flow_info.content;
  if (typeof flow_content != 'object') flow_content = JSON.parse(flow_content);
  result.single_limit = flow_content.single_limit;
  // 获取各级人员对该订单的审批情况
  let approval_info = await Business.getTxApprovalInfoByFlowContentTransID(flow_content, tx_info.trans_id);
  result.approvaled_info = approval_info;
  return ctx.body = new rData(ctx, 'TRANSFER_INFO', result);

}

/**
 * @function 审批转账申请
 * @author david
 */
exports.approvalTransfer = async (ctx) => {
  let { order_number, app_account_id, progress, sign } = ctx.request.body;
  if (!order_number || !app_account_id || !progress || !sign) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  // 获取账户信息
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  // 获取订单信息
  let tx_info = await Capital.getTransferInfo(order_number, 1);
  if (!tx_info) throw new eError(ctx, ERROR_CODE + 5);
  // 验证是否有审批权限
  let approvers_comments = await Capital.getTxInfoByApprover(app_account_id, tx_info.trans_id);
  if (approvers_comments == -1) {
    throw new eError(ctx, ERROR_CODE + 3);
  } else if (approvers_comments != 0) {
    throw new eError(ctx, ERROR_CODE + 6);
  }
  // 验证签名
  let sign_pass = await Verify.signInfo(tx_info.apply_content, account_info.pub_key, sign);
  logger.info('审批转账验签', sign_pass);
  if (!sign_pass) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 5);
  // 提交审批意见
  await Capital.approvalTransfer(tx_info.trans_id, account_info.id, progress, sign);
  // 获取订单对应的审批流模板内容
  let tx_flow = await Business.getBusinessFlowInfo(tx_info.flow_id, 0);
  if (!tx_flow) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 6);
  // 获取审批流上链状态
  let flow_on_chain_status = await Business.businessFlowStatus(tx_flow.flow_hash);
  // 更新本地审批流状态
  logger.info('审批转账_获取审批流上链状态', flow_on_chain_status);
  await Business.updateFlowStatus([tx_info]);
  if (flow_on_chain_status != 3) {
    // 审批流哈希未上链，转账失败
    await Capital.updateTxProgress(tx_info.trans_id, 2);
    throw new eError(ctx, UNIVERSAL_ERROR_CODE + 6);
  }
  // 获取审批者在审批流中的位置
  let location = await Business.getManagerLocation(tx_flow.content, app_account_id);
  // 获取订单审批进度
  let tx_progress = await Capital.getTxProgress(tx_flow.content, tx_info.trans_id);
  if (tx_progress == 1 && location.level + 1 < tx_flow.content.approval_info.length) {
    await Capital.initManagerComments(tx_flow.content, tx_info.trans_id, location);
  }
  // 获取订单审批最新进度
  tx_progress = await Capital.getTxProgress(tx_flow.content, tx_info.trans_id);
  logger.info('审批后的订单进度', {progress: tx_progress, trans_id: tx_info.trans_id});
  // 获取各级审批人员签名信息
  let approval_info = await Capital.getTxApproversSign(tx_flow.content, tx_info.trans_id)
  // 审批通过，转账
  if (tx_progress == 3) {
    let apply_json = tx_info.apply_content;
    if (typeof apply_json != 'object') apply_json = JSON.parse(apply_json);
    // 获取币种信息
    let currency_info = await Capital.getCurrencyInfoByName(apply_json.currency);
    if (!currency_info) throw new eError(ctx, ERROR_CODE + 8);
    // 订单全部审批通过, 上链
    let amount = new BigNumber(apply_json.amount);
    let miner = new BigNumber(apply_json.miner);
    let times = new BigNumber(Math.pow(10, currency_info.factor));
    let fixed = config.info.FIED;
    let wd_hash = '0x' + crypto.createHash('sha256').update(tx_info.apply_content).digest('hex');
    let obj = {
      hash: tx_flow.flow_hash,
      // wdhash: tx_info.trans_hash,
      wdhash: wd_hash,
      category: currency_info.currency_id,
      amount: amount.multipliedBy(times).toFixed(fixed),
      fee: miner.multipliedBy(times).toFixed(fixed),
      recaddress: apply_json.to_address,
      apply: tx_info.apply_content,
      applysign: JSON.stringify(approval_info)
    }
    let upload_pass = await Capital.uploadTxChain(obj);
    if (!upload_pass) {
      // 提交转账失败, 更改订单状态
      tx_progress = 2;
      throw new eError(ctx, ERROR_CODE + 7);
    }
  }
  // 更新订单审批进度
  logger.info('订单最终审批进度', {trans_id: tx_info.trans_id, progress: tx_progress});
  await Capital.updateTxProgress(tx_info.trans_id, tx_progress);
  return ctx.body = new rData(ctx, 'APPROVAL_TX');
}

// 获取余额
exports.getBalance = async (ctx) => {
  let { app_account_id, currency } = ctx.query;
  if (!currency || !app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info || account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 7);
  // 获取币种信息
  let currency_info = await Capital.getCurrencyInfoByName(currency);
  if (!currency_info) throw new eError(ctx, ERROR_CODE + 8);
  let balance = currency_info.balance;
  return ctx.body = new rData(ctx, 'GET_BALANCE', { currency: currency, balance: balance });
}

// 获取币种列表
exports.getCurrencyList = async (ctx) => {
  let { app_account_id, key_words } = ctx.query;
  if (!app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  let currency_list = await Capital.getCurrencyList(key_words)
  return ctx.body = new rData(ctx, 'CURRENCY_LIST', { currency_list: currency_list });
}

// 伴生程序通知最终提现结果
exports.withdrawResult = async function (ctx, next) {
  let { wd_hash, tx_id } = ctx.request.body;
  logger.info('伴生程序通知最终提现结果: ', {
    wd_hash: wd_hash,
    tx_id: tx_id
  });
  // 获取该笔转账记录详情
  let tx_info = await Capital.getTransferInfoByTxBoxHash(wd_hash);
  if (tx_info) {
    // 插入本地数据库 tb_transfer_history,set progress = 2
    await Capital.addTransferArrivedInfo(wd_hash, tx_id, 2);
    // 更新余额
    await Capital.updateBalance(tx_info.amount, tx_info.currencyID, 1);
  }
  return ctx.body = new rData(ctx, 'NOTICE');
}

// 代理服务器通知提现结果
exports.withdrawResultOfID = async (ctx, next) => {
  let { wd_hash, tx_id } = ctx.request.body;
  logger.info('代理服务器通知提现结果: ', {
    wd_hash: wd_hash,
    tx_id: tx_id
  });
  if (!wd_hash || !tx_id) throw new eError(ctx, UNIVERSAL_ERRORCODE + 1);
  // 获取该笔转账记录详情
  let tx_info = await Capital.getTransferInfoByTxBoxHash(wd_hash);
  if (tx_info) {
    // 插入本地数据库 tb_transfer_history,set progress = 0
    await Capital.addTransferArrivedInfo(wd_hash, tx_id, 1);
  }
  return ctx.body = new rData(ctx, 'NOTICE');
}

// 代理服务器上报充值记录
exports.depositSuccess = async (ctx) => {
  let { from, to, amount, tx_id, category } = ctx.request.body;
  logger.info('代理服务器通知充值结果: ', {
    fromAddr: from,
    toAddr: to,
    amount: amount,
    tx_id: tx_id,
    category: category
  });
  if (!from || !to || !amount || !tx_id || (category != 0 && !category)) throw new eError(ctx, UNIVERSAL_ERRORCODE + 1);
  // 获取币种单位
  let currency_id = category;
  let currency_info = await Capital.getCurrencyByID(currency_id);
  if (!currency_info) throw new eError(ctx, ERROR_CODE + 8);
  amount = new BigNumber(amount);
  let times = new BigNumber(Math.pow(10, currency_info.factor));
  amount = amount.div(times).toFixed(8);
  let from_array
  if (from.indexOf(',')) {
    from_array = from.split(',');
  } else {
    from_array[0] = from;
  }
  logger.info('充值记录落库', {
    from_array: from_array,
    to: to,
    currency: currency_info.id,
    amount: amount,
    tx_id: tx_id
  })
  let order_num = UUID();
  await Capital.depositHistory(order_num, from_array, to, currency_info.id, amount, tx_id);
  // 更新余额
  await Capital.updateBalance(amount, category, 0);
  // 更新充值地址
  if (currency_info) {
    await Capital.initContractAddress(category, to);
  }
  return ctx.body = new rData(ctx, 'NOTICE');
}

/**
 * @function 代理服务器提示新增币种/代币
 * @param {string/number} type // 0币种 1代币
 * @author david
 */
exports.addCurrency = async (ctx) => {
  let type = ctx.request.body.type;
  if (type != 0 && type != 1) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1)
  let new_currency_list = await Capital.getNewCurrencyList(type);
  // 更新币种列表
  if (new_currency_list && new_currency_list.length) {
    await Capital.updateCurrencyList(new_currency_list, type);
  }
  return ctx.body = new rData(ctx, 'NOTICE');
}

/**
 * @function 获取资产
 * @author david
 */
exports.getBalanceList = async (ctx) => {
  let { app_account_id } = ctx.query;
  let page = ctx.query.page || 1;
  let limit = ctx.query.limit || 20;
  if (!app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info || account_info.departured || account_info.depth != 0) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 7);
  let assets = await Capital.getAssets(page, limit);
  return ctx.body = new rData(ctx, 'GET_BALANCE', assets);
}