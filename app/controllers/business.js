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
const Business = require('../models/business');
const Verify = require('../models/verify');
const crypto = require('crypto');
const UNIVERSAL_ERROR_CODE = 1000;
const ERROR_CODE = 3000;

/**
 * @function: 创建审批流模板
 * @author: david 
 */
exports.genFlow = async (ctx) => {
  let { app_account_id, flow, sign } = ctx.request.body;
  logger.info('创建业务流模板', { appid: app_account_id, flow: flow, sign: sign });
  if (!app_account_id || !sign || !flow) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  // 是否有权限创建审批流
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  logger.info('有权创建审批流', { depth: account_info.depth });
  if (account_info.depth != 0) throw new eError(ctx, ERROR_CODE + 1);
  let flow_json = flow;
  if (typeof flow_json != 'object') flow_json = JSON.parse(flow);
  let flow_content = flow_json.approval_info;
  let approvers = flow_content[0].approvers;
  if (!flow_json.single_limit || !flow_json.flow_name || !flow_content || !flow_content[0].require || !approvers || !approvers[0].account || !approvers[0].app_account_id || !approvers[0].pub_key) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  // 验证签名
  let sign_pass = await Verify.signInfo(flow, account_info.pub_key, sign);
  logger.info('创建业务流验证签名', sign_pass);
  if (!sign_pass) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 5);
  // 是否创建过相同业务流模板
  let flow_hash = '0x' + crypto.createHash('sha256').update(flow).digest('hex');
  logger.info('新创建的业务流模板hash', flow_hash);
  let flow_exists = await Verify.flowHashExists(flow_hash);
  if (flow_exists) throw new eError(ctx, ERROR_CODE + 2);
  // 获取该账号对应的注册申请信息
  let reg_info = await User.getRegistrationByID(account_info.reg_id, 1);
  // 向代理服务器上报新增的审批流模板
  let pass = await Business.addFlowToServer(flow_json.flow_name, app_account_id, flow, sign, flow_hash, reg_info.captain_id);
  logger.info('向代理服务器上报新增审批流申请', pass);
  if (!pass) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 12);
  // 创建业务流模板
  let flow_insert_id = await Business.genBusinessFlow(flow_json.flow_name, flow, flow_hash, account_info.id, sign, flow_json.single_limit);
  logger.info('新建审批流模板ID', flow_insert_id);
  let flow_info = await Business.getBusinessFlowInfo(flow_insert_id, 0);
  if (!flow_info) throw new eError(ctx, ERROR_CODE + 4);
  return ctx.body = new rData(ctx, 'GEN_FLOW', { flow_id: flow_info.flow_id });
}

/**
 * @function 获取审批流模板列表
 * @author david
 */
exports.getFlowList = async (ctx) => {
  let { app_account_id, key_words, type } = ctx.query;
  if (!app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let limit = ctx.query.limit || 20;
  let page = ctx.query.page || 1;
  if (typeof page == 'string') page = parseInt(page);
  if (typeof limit == 'string') limit = parseInt(limit);
  // 获取账号信息
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  // 查找某账号所属的根节点账号
  let manager_account_info;
  if (account_info.depth == 0) {
    manager_account_info = account_info;
  } else {
    manager_account_info = await User.getRootAccountByUnderlingAcc(account_info.lft, account_info.rgt)
  }
  let manager_id = manager_account_info.id;
  let data;
  // 将除了未审批的审批流外的其他审批流状态更新为2
  await Business.disableFlows();
  // 获取已经通过审批的审批流
  let update_ok = await Business.getApprovaledFlow();
  if (!update_ok) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 12);
  if (key_words) {
    data = await Business.searchFlowByName(manager_id, key_words, page, limit, type);
  } else {
    data = await Business.getFlowList(manager_id, page, limit, type);
  }
  if (type == 1 && data) await Business.updateFlowStatus(data.list);
  return ctx.body = new rData(ctx, 'FLOW_LIST', data);
}

/**
 * @function 获取审批流模板详情
 * @author david 
 */
exports.getFlowInfo = async (ctx) => {
  let { flow_id, app_account_id } = ctx.query;
  if (!flow_id || !app_account_id) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 1);
  let account_info = await User.getAccountInfoByAppAccountID(app_account_id);
  if (!account_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 4);
  if (account_info.departured) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 11);
  // 查找某账号所属的根节点账号
  let manager_account_info;
  if (account_info.depth == 0) {
    manager_account_info = account_info;
  } else {
    manager_account_info = await User.getRootAccountByUnderlingAcc(account_info.lft, account_info.rgt)
  }
  let manager_id = manager_account_info.id;
  let flow_info = await Business.getFlowInfoByID(flow_id, manager_id);
  if (!flow_info) throw new eError(ctx, UNIVERSAL_ERROR_CODE + 6);
  return ctx.body = new rData(ctx, 'FLOW_INFO', flow_info);
}