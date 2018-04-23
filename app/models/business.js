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
const config = global.config;
const P = require(global.config.info.DIR + '/utils/promise').P;
const dbhelper = require(global.config.info.DIR + '/utils/dbhelper');
const pool = dbhelper.pool;
const queryFormat = dbhelper.queryFormat;
const User = require('./user');
const RPC = require('../../utils/rpc');

/**
 * @function 新建业务流模板
 * @param  {string} flow_name:      // 业务流模板名称 
 * @param  {string} flow_content    // 业务流模板内容
 * @param  {string} flow_hash       // 哈希
 * @param  {string} founder_id      // 创建者账号ID
 * @param  {number} single_limit    // 单笔转账限额
 * @return {number} 业务流模板ID
 * @author david
 */
exports.genBusinessFlow = async (flow_name, flow_content, flow_hash, founder_id, sign, single_limit) => {
  let query = queryFormat(`
  insert into tb_business_flow 
  set flowID = uuid(), flowHash = ?, flowName = ?, founderID = ?, content = ?, founderSign = ?, singleLimit = ?`, [flow_hash, flow_name, founder_id, flow_content, sign, single_limit]);
  let result = await P(pool, 'query', query);
  return result.insertId
}
/**
 * @function 获取审批流信息
 * @param type == 0: 根据tb_business_flow.id获取
 *         type == 1: 根据tb_business_flow.flowID
 * @return {obj} 审批流模板详情
 * @author david
 */
exports.getBusinessFlowInfo = async (param, type) => {
  let where_str;
  if (type == 0) {
    // 根据tb_business_flow.id获取
    where_str = ' where id = ? ';
  } else {
    // 根据tb_business_flow.flowID
    where_str = ' where flowID = ? ';
  }
  let query = queryFormat(`
  select id, flowID as flow_id, flowHash as flow_hash, flowName as flow_name, progress,
    UNIX_TIMESTAMP(createdAt) as created_at, content, singleLimit as single_limit,
    UNIX_TIMESTAMP(updatedAt) as updated_at, null approval_at
  from tb_business_flow 
  ` + where_str, [param]);
  let rows = await P(pool, 'query', query);
  if (!rows.length) return null;
  let result = rows[0];
  if (result.progress == 2) {
    result.approval_at = result.updated_at;
  }
  delete result.updated_at;
  result.content = JSON.parse(result.content);
  return result;
}

/**
 * @function：获取用户转账申请的审批信息
 * @param:  {string} app_account_id   // 用户账号唯一标识符
 *          {string} trans_id         // 订单号
 * @author：david
 */
exports.getTransApprovalInfoByAppAccountID = async (app_account_id, trans_id) => {
  let query = queryFormat(`
    select rt.sign, rt.comments as progress
    from tb_accounts_info as acc
      left join tb_review_transfer as rt
        on rt.managerAccID = acc.id
    where acc.appAccountID = ? and rt.transID = ?`, [app_account_id, trans_id]);
  let data = await P(pool, 'query', query);
  return data[0];
}

/**
 * @function 获取转账申请的审批信息
 * @param {string} flow_content     // 审批流模板内容
 * @param {string} trans_id         // 订单号
 * @author：david
 */
exports.getTxApprovalInfoByFlowContentTransID = async (flow_content, trans_id) => {
  let result = [];
  let approval_info = flow_content.approval_info
  for (let i = 0; i < approval_info.length; i++) {
    let data = {};
    let total_approvers = 0;
    let total_rejects = 0;
    let the_approval_info = {};
    data.require = approval_info[i].require;
    let approvers = approval_info[i].approvers;
    data.total = approvers.length
    for (let j = 0; j < approvers.length; j++) {
      approvers[j].progress = 0;
      approvers[j].sign = null;
      the_approval_info = await this.getTransApprovalInfoByAppAccountID(approvers[j].app_account_id, trans_id);
      if (the_approval_info) {
        approvers[j].progress = the_approval_info.progress;
        approvers[j].sign = the_approval_info.sign;
      }
      if (approvers[j].progress == 3) {
        total_approvers++;
      } else if (approvers[j].progress == 2) {
        total_rejects++;
      }
      delete approvers[j].pub_key;
    }
    if (total_approvers >= approval_info[i].require) {
      total_approvers = 3;
    } else if (total_rejects > approvers.length - approval_info[i].require) {
      total_approvers = 2;
    } else if (total_rejects == 0 && total_approvers == 0) {
      total_approvers = 0;
    } else {
      total_approvers = 1;
    }
    data.approvers = approvers;
    data.current_progress = total_approvers;
    result[i] = data;
  }
  return result;
}

/**
 * @function 获取审批流模板列表
 * @param  {number} page
 * @param  {number} limit
 * @author david
 */
exports.getFlowList = async (manager_id, page, limit) => {
  let start = (page - 1) * limit;
  let end = limit;
  let query_count = queryFormat(`select count(*) as count from tb_business_flow where founderID = ?`, [manager_id]);
  let query = queryFormat(`
  select id, flowID as flow_id, flowName as flow_name, content, flowHash as flow_hash, progress
  from tb_business_flow
  where founderID = ?
  order by createdAt desc
  limit ?, ?`, [manager_id, start, end]);
  let data = await P(pool, 'query', query);
  let data_count = await P(pool, 'query', query_count);
  if (data.length) {
    for (let r of data) {
      let flow_content = r.content;
      if (typeof flow_content != 'object') flow_content = JSON.parse(flow_content);
      r.single_limit = flow_content.single_limit;
      delete r.content;
    }
  }
  return {
    count: data_count[0].count,
    total_pages: Math.ceil(data_count[0].count / limit),
    current_page: page,
    list: data
  }
}

/**
 * @function 搜索获取审批流模板列表
 * @param  {string} key_words    // 搜索关键字
 * @param  {number} page         // 分页
 * @param  {number} limit
 * @author david
 */
exports.searchFlowByName = async (manager_id, key_words, page, limit) => {
  let start = (page - 1) * limit;
  let end = limit;
  let query_count = queryFormat(`select count(*) as count from tb_business_flow where founderID = ? flowName like ?`, [manager_id, '%' + key_words + '%']);
  let query = queryFormat(`
  select id, flowID as flow_id, flowName as flow_name, content, flowHash as flow_hash, progress
  from tb_business_flow
  where founderID = ? and flowName like ?
  order by createdAt desc
  limit ?, ?`, [manager_id, '%' + key_words + '%', start, end]);
  let data = await P(pool, 'query', query);
  let data_count = await P(pool, 'query', query_count);
  if (data.length) {
    for (let r of data) {
      let flow_content = r.content;
      if (typeof flow_content != 'object') flow_content = JSON.parse(flow_content);
      r.single_limit = flow_content.single_limit;
      delete r.content;
    }
  }
  return {
    count: data_count[0].count,
    total_pages: Math.ceil(data_count[0].count / limit),
    current_page: page,
    list: data
  }
}

/**
 * @function 获取审批流模板详情
 * @param {string} flow_id    // 审批流编号
 * @param {number} manager_id // 该审批流创建者账号ID
 * @author david
 */
exports.getFlowInfoByID = async (flow_id, manager_id) => {
  let result = [];
  let query = queryFormat(`
  select flowName as flow_name, content, progress
  from tb_business_flow
  where flowID = ? and founderID = ?`, [flow_id, manager_id]);
  let data = await P(pool, 'query', query);
  if (!data) return null;
  let flow_content = data[0].content;
  if (typeof flow_content != 'object') flow_content = JSON.parse(flow_content);
  let approval_info = flow_content.approval_info;
  for (let i = 0; i < approval_info.length; i++) {
    let data = {};
    data.require = approval_info[i].require;
    data.total = approval_info[i].approvers.length
    data.approvers = approval_info[i].approvers;
    result[i] = data;
  }
  return {
    flow_name: data[0].flow_name,
    progress: data[0].progress,
    single_limit: flow_content.single_limit,
    approval_info: result
  };
}

/**
 * @function 获取业务流结构上链状态
 * @param {string} flow_hash  // 业务流模板对应的哈希值
 * @return {number} 1审批中 2审批决绝 3审批通过
 * @author david
 */
exports.businessFlowStatus = async (flow_hash) => {
  let param = {
    hash: flow_hash
  }
  let flow_on_chain = await P(RPC, 'rpcRequest', 'GET', config.info.PROXY_HOST, config.info.SERVER_URL.FLOW_STATUS, param);
  if (flow_on_chain && flow_on_chain.RspNo == 0) {
    if (flow_on_chain.ApprovalInfo.Status == 7) {
      return 3;
    } else if (flow_on_chain.ApprovalInfo.Status == 0 || flow_on_chain.ApprovalInfo.Status == 1 || flow_on_chain.ApprovalInfo.Status == 3 || flow_on_chain.ApprovalInfo.Status == 4 || flow_on_chain.ApprovalInfo.Status == 6) {
      return 1;
    }
  } 
  return 2
}

/**
 * @function 更新审批流状态
 * @param {array} flow_list     // 审批流列表
 * @author david
 */
exports.updateFlowStatus = async (flow_list) => {
  for(let r of flow_list) {
    if(r.progress < 2) {
      let flow_on_chain_status = await this.businessFlowStatus(r.flow_hash);
      if(flow_on_chain_status) {
        // 更新审批流审批状态
        let query = queryFormat('update tb_business_flow set progress = ? where id = ?', [flow_on_chain_status, r.id]);
        await P(pool, 'query', query);
        r.progress = flow_on_chain_status;
      }
    }
  } 
}

/**
 * @function 向代理服务器上报新增的审批流模板
 * @param  {string} appid    // 创建者账号唯一标识符 
 *          {string} flow     // 序列化后的审批流模板内容
 *          {string} sign     // 创建者对flow的签名 
 *          {string} hash     // flow对应的哈希值
 * @author david
 */
exports.addFlowToServer = async (flow_name, appid, flow, sign, hash, captain_id) => {
  let param = {
    name: flow_name,
    appid: appid,
    flow: flow,
    sign: sign,
    hash: hash,
    captainid: captain_id
  }
  let host = config.info.PROXY_HOST;
  let url = config.info.SERVER_URL.ADD_FLOW;
  let result = await P(RPC, 'rpcRequest', 'GET', host, url, param);
  return result && result.RspNo == 0 ? true : false;
}

/**
 * @function 获取管理员在对应审批流中所处的位置
 * @param  {obj} flow_content       // 审批流内容
 * @param  {string}  app_account_id // 审批者账号唯一标识符
 * @author david
 */
exports.getManagerLocation = async (flow_content, app_account_id) => {
  let location = {};
  let flow_approval_info = flow_content.approval_info;
  for (let i = 0; i < flow_approval_info.length; i++) {
    let approvers = flow_approval_info[i].approvers;
    for (let j = 0; j < approvers.length; j++) {
      if (approvers[j].app_account_id == app_account_id) {
        location = {
          level: i,
          num: j,
          require: flow_approval_info[i].require
        }
        break;
      }
    }
  }
  return location;
}