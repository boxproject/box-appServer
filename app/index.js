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

const Router = require('koa-router');
const config = global.config;
const User = require('./controllers/user');
const Capital = require('./controllers/capital');
const Business = require('./controllers/business');
const multer = require('../utils/utils').multer;
const router = new Router();
router.prefix('/api/' + config.info.API_VERSION);

router
  // 下属注册提交扫码后的信息
  .post('/registrations', User.applyForAccount)
  // 上级APP获取待审核的注册信息
  .get('/registrations/pending', User.getRegistrationInfo)
  // 下属获取注册申请审批结果
  .get('/registrations/approval/result', User.getRegistrationApprovalInfo)
  // 上级APP审批下级的注册申请
  .post('/registrations/approval', User.approvalRegistration)
  // 员工APP反馈上级审批结果出错
  .post('/registrations/approval/cancel', User.cancelApprovalRegistration)
  // 提交转账申请
  .post('/transfer/application', Capital.applyTransfer)
  // 获取转账记录列表(待审批/已审批、作为发起者/作为审批者)
  .get('/transfer/records/list', Capital.getTransferRecordsList)
  // 获取指定的转账记录详情
  .get('/transfer/records', Capital.getTransInfoByOrderNumber)
  // 提交审批意见
  .post('/transfer/approval', Capital.approvalTransfer)
  // 获取业务流模板列表
  .get('/business/flows/list', Business.getFlowList)
  // 获取业务流模板详情
  .get('/business/flow/info', Business.getFlowInfo)
  // 根节点获取非直属下属的公钥信息列表
  .get('/employee/pubkeys/list', User.getEmployeePubKeyInfoList)
  // 根节点获取指定非直属下属的公钥信息
  .get('/employee/pubkeys/info', User.getEmployeePubKeyInfo)
  // 上级管理员获取下属员工账号列表
  .get('/accounts/list', User.getEmployeeAccountsList)
  // 上级管理员获取下属员工账号详情
  .get('/accounts/info', User.getEmployeeAccountsInfo)
  // 创建业务流模板
  .post('/business/flow', Business.genFlow)
  // 删除/替换员工账号
  .post('/employee/account/change', User.changeEmployeeAccount)
  // 获取余额
  .get('/capital/balance', Capital.getBalanceList)
  // 获取币种列表
  .get('/capital/currency/list', Capital.getCurrencyList)
  // 获取交易记录列表
  .get('/capital/trade/history/list', Capital.getTradeHistoryList)
  // 获取交易记录详情
  // .get('/capital/trade/history/info', Capital.getTradeHistoryInfo)
  // 代理服务器上报转账结果
    // 最终结果
  .post('/capital/withdraw', Capital.withdrawResult)
    // 临时结果
  .post('/capital/withdraw/id', Capital.withdrawResultOfID)
  // 代理服务器上报充值记录
  .post('/capital/deposit', Capital.depositSuccess)
  // 代理服务器上报私钥APP审批注册结果
  .post('/registrations/admin/approval', User.adminApprovalRegistration)
  // 代理服务器通知新增币种，代币
  .post('/capital/curency/add', Capital.addCurrency)
module.exports = router;
