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
const logger = require(global.config.info.DIR + '/utils/logger').logger;
const dbhelper = require(global.config.info.DIR + '/utils/dbhelper');
const pool = dbhelper.pool;
const queryFormat = dbhelper.queryFormat;
const crypto = require('crypto');
const User = require('./user');
const RPC = require('../../utils/rpc');
const Business = require('./business');

/**
 * @function 根据账号app端唯一标识符获取转账列表
 * @param  {string} account_id   // 账号唯一标识符   
 * @param  {number} type         // 0作为申请者 1作为审批者
 * @param  {number} progress     // 订单审批进度 -1所有记录 0待审批 1审批中 2被驳回 3审批成功
 * @param  {number} page, limit  // 分页
 * @author david
 */
exports.getTransferRecordsListByAppID = async (account_id, type, progress, page, limit) => {
  let query_total, query;
  let start = (page - 1) * limit;
  let end = limit;
  let str = '';
  if (type == 0) {
    query = queryFormat(`
      select t.orderNum as order_number, t.txInfo as tx_info, t.progress, t.amount, c.currency,
        UNIX_TIMESTAMP(t.createdAt) as apply_at, t.arrived
      from tb_transfer as t
        left join tb_currency as c
          on c.id = t.currencyID 
      where applyerID = ? order by apply_at desc limit ?, ?`, [account_id, start, end]);
    query_total = queryFormat(`select count(*) as total from tb_transfer where applyerID = ?`, [account_id]);
    // 申请者
    if (progress != -1) {
      str = queryFormat(' and progress = ?', [progress]);
    }
  } else if (type == 1) {
    query = queryFormat(`
      select t.orderNum as order_number, t.txInfo as tx_info, 
      UNIX_TIMESTAMP(t.createdAt) as apply_at, t.amount, c.currency,
      (case t.progress when 0 then 1 else t.progress end) as progress, t.arrived
      from tb_transfer as t
        left join tb_review_transfer as rt
          on rt.transID = t.id 
        left join tb_currency as c
          on c.id = t.currencyID
      where rt.managerAccID = ? `, [account_id]);
    query_total = queryFormat(`
      select count(*) as total 
      from tb_transfer as t
        left join tb_review_transfer as rt
          on rt.transID = t.id 
      where rt.managerAccID = ?`, [account_id]);
    // 审批者
    if (progress == -1) {
      // str = queryFormat(' and rt.comments <> 0 ');
      str = queryFormat('');
      // 获取所有类型的转账记录
    } else if (progress == 0) {
      str = queryFormat(` and rt.comments = ? and t.progress < 2 `, [progress]);
    } else {
      // 该审批者已审批过的转账列表
      str = queryFormat(` and t.progress = ? and rt.comments <> 0 `, [progress]);
    }
    query = query + str + queryFormat('order by apply_at desc limit ?, ?', [start, end]);
    query_total += str;
  }
  let total_result = await P(pool, 'query', query_total);
  let total = total_result[0].total;
  let total_pages = Math.ceil(total / limit) || 1;
  let list = await P(pool, 'query', query);
  return {
    count: total,
    total_pages: total_pages,
    current_page: page,
    list: list
  }
}

/**
 * @function：员工提交转账申请
 * @param:  {string} tx_info              // 申请理由
 *          {string} applyer_id   
 *         // 提交申请者账号ID
 *          {string} currency             // 币种名称，缩写 
 *          {string} amount               // 转账金额
 *          {string} flow_id              // 审批流编号 
 *          {string} apply_content        // 转账内容 
 *          {string} applyer_sign         // 申请者对该笔转账签名 
 *          {array} captain_account_ids   // 第一级审批者账号唯一标识符
 * @return: transfer_info.id
 * @author：david
 */
exports.applyTransfer = async (order_number, tx_info, applyer_id, currency_id, amount, flow_id, apply_content, applyer_sign, captain_account_ids) => {
  let trans_hash = '0x' + crypto.createHash('sha256').update(apply_content).digest('hex');
  let query = queryFormat('insert into tb_transfer set orderNum = ?, txInfo = ?, transBoxHash = ?, applyerID = ?, currencyID = ?, amount = ?, flowID = ?, applyContent = ?, applyerSign = ?',
    [order_number, tx_info, trans_hash, applyer_id, currency_id, amount, flow_id, apply_content, applyer_sign]);
  let conn = await P(pool, 'getConnection');
  let tx_id;
  try {
    await P(conn, 'beginTransaction');
    let transfer_info = await P(conn, 'query', query);
    tx_id = transfer_info.insertId;
    let captain_account_info = await User.getAccountInfoByAppAccountID(captain_account_ids[0].app_account_id);
    let captain_review_query = queryFormat('insert into tb_review_transfer (transID, managerAccID) values (?, ?)', [tx_id, captain_account_info.id]);
    for (let i = 1; i < captain_account_ids.length; i++) {
      let captain = await User.getAccountInfoByAppAccountID(captain_account_ids[i].app_account_id);
      captain_review_query += queryFormat(', (?, ?)', [tx_id, captain.id]);
    }
    await P(conn, 'query', captain_review_query);
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
  }
  return tx_id;
}

/**
 * @function 获取转账信息
 * @param  type == 0: 根据trans_id获取
 *         type == 1: 根据order_number获取
 * @author david
 */
exports.getTransferInfo = async (param, type) => {
  let where_str;
  if (type == 0) {
    // 根据tb_transfer.id获取
    where_str = queryFormat(' where t.id = ? ');
  } else if (type == 1) {
    // 根据order_number获取
    where_str = queryFormat(' where t.orderNum = ? ');
  }
  let query = queryFormat(`
  select t.id as trans_id, t.orderNum as order_number, t.transBoxHash as trans_hash, a.account as applyer_acc, 
    t.progress, t.applyContent as apply_content, t.applyerSign as applyer_sign, a.appAccountID as applyer_uid,
    t.flowID as flow_id, UNIX_TIMESTAMP(t.createdAt) as apply_at, null approval_at, t.arrived,
    null reject_at, UNIX_TIMESTAMP(t.updatedAt) as updated_at, t.id as trans_id
  from tb_transfer as t
    left join tb_accounts_info as a
      on a.id = t.applyerID
  ` + where_str, [param]);
  let data = await P(pool, 'query', query);
  if (data.length) {
    if (data[0].progress == 2) {
      data[0].reject_at = data[0].updated_at;
    } else if (data[0].progress == 3) {
      data[0].approval_at = data[0].updated_at
    }
    delete data[0].updated_at;
  }
  return data.length ? data[0] : null;
}

/**
 * @function 获取员工待审批的转账信息
 * @param {string} app_account_id   // 账号唯一标识符
 * @param {string} trans_id     // 订单号
 */
exports.getTxInfoByApprover = async (app_account_id, trans_id) => {
  let query = queryFormat(`
  select rt.comments as progress
  from tb_transfer as t 
    left join tb_review_transfer as rt
      on rt.transID = t.id
    left join tb_accounts_info as acc
      on acc.id = rt.managerAccID
  where acc.appAccountID = ? and t.id = ?`, [app_account_id, trans_id]);
  let result = await P(pool, 'query', query);

  return result.length ? result[0].progress : -1;
}


/**
 * @function 提交审批意见
 * @param {string} trans_id               // 订单号
 * @param {string} manager_account_id     // 审批者账号唯一标识符 
 * @param {number} progress               // 审批意见
 * @param {string} sign                   // 审批者签名
 */
exports.approvalTransfer = async (trans_id, manager_account_id, progress, sign) => {
  let query = queryFormat('update tb_review_transfer set comments = ?, sign = ? where transID = ? and managerAccID = ?', [progress, sign, trans_id, manager_account_id]);
  await P(pool, 'query', query);
}

/**
 * @function 更新订单审批进度
 * @param {string} trans_id       // 订单ID
 * @param {number} progress       // 审批意见 1审批中 2驳回 3同意
 * @author david
 */
exports.updateTxProgress = async (trans_id, progress) => {
  let query = queryFormat('update tb_transfer set progress = ? where id = ?', [progress, trans_id]);
  if (progress == 3) {
    query = queryFormat('update tb_transfer set progress = ?, arrived = 1 where id = ?', [progress, trans_id]);
  }
  await P(pool, 'query', query);
}

/**
 * @function 获取币种信息
 * @param  {string} currency   // 币种名称，简写
 * @author david
 */
exports.getCurrencyInfoByName = async (currency) => {
  let query = queryFormat('select id as currency_id, factor, currency, balance from tb_currency where currency = ? and available = 1', [currency]);
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

/**
 * @function 获取币种列表
 * @param {string} key_words  // 搜索关键字
 * @author david
 */
exports.getCurrencyList = async (key_words) => {
  let query = queryFormat(`select currency, address from tb_currency where available = 1`);
  if (key_words) {
    query = queryFormat('select currency, address from tb_currency where available = 1 and currency like ?', ['%' + key_words + '%']);
  }
  let result = await P(pool, 'query', query);
  // 更新充值地址
  if(result.length) {
    let host = config.info.PROXY_HOST;
    let url = config.info.SERVER_URL.TOKEN_DEPOSIT_ADDRESS;
    let data = await P(RPC, 'rpcRequest', 'GET', host, url, null);
    for(let r of result) {
      if(!r.address) {
        if(r.currency == 'ETH') {
          let query = queryFormat('update tb_currency set address = ? where currency = ?', [data.Status.ContractAddress, r.currency]);
          await P(pool, 'query', query);
        } else if(r.currency == 'BTC') {
          let query = queryFormat('update tb_currency set address = ? where currency = ?', [data.Status.BtcAddress, r.currency]);
          await P(pool, 'query', query);
        }
      }
    }
  }
  return result.length ? result : [];
}

// 根据id获取币种信息
exports.getCurrencyByID = async (currency_id) => {
  let query = queryFormat('select id, currency, factor from tb_currency where id = ? and available = 1', [currency_id]);
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

// 根据transBoxHash获取订单详情
exports.getTransferInfoByTxBoxHash = async function (tx_box_hash) {
  let query = queryFormat('select * from tb_transfer where transBoxHash = ?', [tx_box_hash]);
  let rows = await P(pool, 'query', query);
  return rows.length ? rows[0] : null;
}

// 记录提现到账信息
exports.addTransferArrivedInfo = async function (trans_hash, tx_id, progress) {
  let query = queryFormat('update tb_transfer set arrived = ?, txID = ? where transBoxHash = ?', [progress, tx_id, trans_hash]);
  await P(pool, 'query', query);
}

// 记录充值记录
exports.depositHistory = async function (order_num, from_array, to, currency, amount, tx_id) {
  let query;
  if (!from_array) {
    query = queryFormat('insert into tb_deposit_history (orderNum, fromAddr, toAddr, currencyID, amount, txID) values (?, ?, ?, ?, ?, ?)', [order_num, 0, to, currency, amount, tx_id]);
  } else {
    query = queryFormat('insert into tb_deposit_history (orderNum, fromAddr, toAddr, currencyID, amount, txID) values (?, ?, ?, ?, ?, ?)', [order_num, from_array[0], to, currency, amount, tx_id]);
    for (let i = 1; i < from_array.length; i++) {
      query += queryFormat(', (?, ?, ?, ?, ?, ?)', [order_num, from_array[i], to, currency, amount, tx_id]);
    }
  }
  await P(pool, 'query', query);
}

/**
 * @function 向代理服务器提交审批通过的转账申请
 * @param {obj} obj   // 转账内容
 * @author david
 */
exports.uploadTxChain = async function (obj) {
  let host = config.info.PROXY_HOST;
  let url = config.info.SERVER_URL.APPLY_TRANSFER;
  let result = await P(RPC, 'rpcRequest', 'POST', host, url, obj);
  return result && result.RspNo == 0 ? true : false;
}

/**
 * @function 新增币种/代币
 * @param {string/number} type    // 类型 0币种 1代币
 * @author david
 */
exports.getNewCurrencyList = async (type) => {
  let host = config.info.PROXY_HOST;
  let url = '';
  if (type == 0) {
    url = config.info.SERVER_URL.COINLIST;
  } else if (type == 1) {
    url = config.info.SERVER_URL.TOKENLIST;
  }
  let data = await P(RPC, 'rpcRequest', 'GET', host, url, null);
  // await P(pool, 'query', query_update);
  if (data.RspNo != 0) {
    return null
  } else {
    return (type == 0) ? data.CoinStatus : data.TokenInfos
  }
}
/**
 * @function 获取代币充值地址
 * @author david
 */
exports.getTokenDepositAddr = async () => {
  let host = config.info.PROXY_HOST;
  let url = config.info.SERVER_URL.TOKEN_DEPOSIT_ADDRESS;
  let data = await P(RPC, 'rpcRequest', 'GET', host, url, null);
  return data.Status.ContractAddress ? data.Status.ContractAddress : null;
}
/**
 * @function 更新币种列表
 * @param {array} elder_list    // 原始币种列表
 * @param {array} new_list      // 最新的币种列表
 * @param {string/number} type  // 0币种 1代币
 * @author david
 */
exports.updateCurrencyList = async (new_list, token_addr, type) => {
  let query_update = queryFormat('update tb_currency set available = 0 where isToken = ? and id <> 1', [type]);
  // let query = queryFormat('select id from tb_currency where isToken = ?', [type]);
  for (let r of new_list) {
    let query_selc = queryFormat('select id from tb_currency where id = ?', [r.Category]);
    let data = await P(pool, 'query', query_selc);
    if (data.length) {
      let query = queryFormat('update tb_currency set available = 1 where id = ?', [r.Category]);
      await P(pool, 'query', query);
    } else {
      let query;
      if(type == 0) {
        query = queryFormat('insert into tb_currency (id, currency, factor, isToken) values (?, ?, ?, ?) ', [r.Category, r.Name, r.Decimals, type]);
      } else {
        query = queryFormat('insert into tb_currency (id, currency, factor, address, isToken) values (?, ?, ?, ?, ?) ', [r.Category, r.TokenName, r.Decimals, token_addr, type]);
      } 
      await P(pool, 'query', query);
    }
  }
}

/**
 * @function 更新余额
 * @param {string} amount 金额
 * @param {number} currency_id 币种ID
 * @param {number} type 0-充值 1-提现
 * @author david
 */
exports.updateBalance = async (amount, currency_id, type) => {
  if (typeof amount != 'number') amount = Number(amount);
  if (type == 1) amount = -amount;
  if (typeof currency_id != 'number') currency_id = Number(currency_id);
  let query = queryFormat('update tb_currency set balance = balance + ? where id = ?', [amount, currency_id]);
  await P(pool, 'query', query);
}

/**
 * @function 向上级管理员通知待审批转账请求
 * @param {obj} flow_content  // 审批流内容
 * @param {string} trans_id   // 转账列表ID 
 * @param {obj} location      // 审批者所在的位置
 */
exports.initManagerComments = async (flow_content, trans_id, location) => {
  let approvers_info = flow_content.approval_info[location.level];
    let pass = 0;
    let reject = 0;
    for (let r of approvers_info.approvers) {
      let comments = await this.getTxInfoByApprover(r.app_account_id, trans_id);
      if (comments == 2) reject++;
      if (comments == 3) pass++;
    }
    if ((pass >= approvers_info.require) && (location.level + 1 < flow_content.approval_info.length)) {
      // 某一层approvers审批通过
      let new_approvers = flow_content.approval_info[location.level + 1].approvers;
      let manager_account_info = await User.getAccountInfoByAppAccountID(new_approvers[0].app_account_id);
      let query_s = queryFormat('select transID from tb_review_transfer where transID = ? and managerAccID in ( ?', [trans_id, manager_account_info.id]);
      let query = queryFormat('insert into tb_review_transfer (transID, managerAccID) values (?, ?)', [trans_id, manager_account_info.id]);
      for (let i = 1; i < new_approvers.length; i++) {
        manager_account_info = await User.getAccountInfoByAppAccountID(new_approvers[i].app_account_id);
        query += queryFormat(', (?, ?)', [trans_id, manager_account_info.id]);
        query_s += queryFormat(', ? ', [manager_account_info.id]);
      }
      query_s += queryFormat(')');
      let result = await P(pool, 'query', query_s);
      if(result.length == 0) {
        await P(pool, 'query', query);
      }
    }
}

/**#
 * @function 获取订单审批进度
 * @param {obj} flow_content    // 审批流内容
 * @param {string} trans_id     // 转账信息表ID
 * @author david
 */
exports.getTxProgress = async (flow_content, trans_id) => {
  let flow_approval_info = flow_content.approval_info;
  for(let i=0; i<flow_approval_info.length; i++) {
    let appr = 0;
    let rej = 0;
    let require = flow_approval_info[i].require;
    let approvers = flow_approval_info[i].approvers;
    for(let r of approvers) {
      let comments = await this.getTxInfoByApprover(r.app_account_id, trans_id);
      if(comments == 2) {
        rej++;
      } else if(comments == 3) {
        appr++;
      }
    }
    if(rej>approvers.length - require) {
      return 2;
    } else if(appr + rej < require) {
      return 1;
    }
  }
  return 3;
}

/**
 * @function 初始化以太坊合约地址
 * @author david
 */
exports.initContractAddress = async (currency_id, address) => {
  let query = queryFormat('update tb_currency set address = ? where id = ? and available = 1', [address, currency_id]);
  await P(pool, 'query', query);
}

/**
 * @function 获取资产列表
 * @author david
 */
exports.getAssets = async (page, limit) => {
  if (typeof page != 'number') page = Number(page);
  if (typeof limit != 'number') limit = Number(limit);
  let start = (page - 1) * limit;
  let end = limit;
  let query = queryFormat('select currency, balance from tb_currency where available = 1 limit ?, ?', [start, end]);
  let data = await P(pool, 'query', query);
  return data;
}

/**
 * @function 获取审批人员签名信息
 * @author david
 */
exports.getTxApproversSign = async (flow_content, trans_id) => {
  let data = [];
  let approvers_info = flow_content.approval_info;
  for(let r of approvers_info) {
    let approvers = r.approvers;
    for(let a of approvers) {
      let sign = await this.getApproversSignByAppID(a.app_account_id, trans_id);
      if(sign && sign.length) data.push({
        appid: a.app_account_id,
        sign: sign.sign
      })
    }
  }
  return data;
}

/**
 * @function 获取指定审批人员签名信息
 * @author david
 */
exports.getApproversSignByAppID = async (app_account_id, trans_id) => {
  let query = queryFormat(`
  select rt.sign from tb_review_transfer as rt 
    left join tb_accounts_info as acc 
      on acc.id = rt.managerAccID
  where acc.appAccountID = ? and rt.transID = ?`, [app_account_id, trans_id]);
  let data = await P(pool, 'query', query);
  return data.length ? data[0] : null;
}

/**
 * @function 获取交易记录列表
 * @param {string} currency_name      // 币种名称
 * @param {string} currency_id        // 币种ID
 * @param {number} page, limit
 * @author david
 */
exports.getTradeHistoryListByAppID = async (currency_name, currency_id,page,limit) => {
  let data = [];
  let query_total = queryFormat(`
  select sum(total) as total from (
    select count(*) as total, currencyID from tb_deposit_history group by currencyID
  union all
    select count(*) as total, currencyID from tb_transfer group by currencyID) t where currencyID = ?`, [currency_id]);
  let query = queryFormat(`
  select orderNum as order_number, amount, 'deposit' tx_info, 3 progress, UNIX_TIMESTAMP(updatedAt) as updated_at, 0 type from tb_deposit_history where currencyID = ?
 union all
  select orderNum as order_number, txInfo as tx_info, amount, progress, UNIX_TIMESTAMP(updatedAt) as updated_at, 1 type from tb_transfer where currencyID = ?`, [currency_id, currency_id])
  let total_info = await P(pool, 'query', query_total);
  if(total_info.length && total_info[0].total > 0) {
    data = await P(pool, 'query', query);
  }
  return {
    count: total_info[0].total,
    total_pages: Math.ceil(total_info[0].total / limit) || 1,
    current_page: page,
    currency: currency_name,
    list: data
  }
}