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
const BigNumber = require('bignumber.js');

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
exports.applyTransfer = async (order_number, tx_info, applyer_id, currency_id, amount, flow_id, apply_content, applyer_sign, captain_ids) => {
  let trans_hash = '0x' + crypto.createHash('sha256').update(apply_content).digest('hex');
  let query = queryFormat('insert into tb_transfer set orderNum = ?, txInfo = ?, transBoxHash = ?, applyerID = ?, currencyID = ?, amount = ?, flowID = ?, applyContent = ?, applyerSign = ?',
    [order_number, tx_info, trans_hash, applyer_id, currency_id, amount, flow_id, apply_content, applyer_sign]);
  let tx_id
  let conn = await P(pool, 'getConnection');
  try {
    await P(conn, 'beginTransaction');
    let transfer_info = await P(conn, 'query', query);
    tx_id = transfer_info.insertId;
    let captain_review_query = queryFormat('insert into tb_review_transfer (transID, managerAccID) values (?, ?)', [tx_id, captain_ids[0].id]);
    if (captain_ids.length > 1) {
      for (let i = 1; i < captain_ids.length; i++) {
        captain_review_query += queryFormat(', (?, ?)', [tx_id, captain_ids[i].id]);
      }
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
  } else if(progress == 2) {
    query = queryFormat('update tb_transfer set progress = ?, arrived = -1 where id = ?', [progress, trans_id])
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
  // 更新可用的币种列表
  let host = config.info.PROXY_HOST;
  let deposit_addr = config.info.SERVER_URL.TOKEN_DEPOSIT_ADDRESS;
  let coinlist_url = config.info.SERVER_URL.COINLIST;
  let tokenlist_url = config.info.SERVER_URL.TOKENLIST
  let depo_data = await P(RPC, 'rpcRequest', 'GET', host, deposit_addr, null);
  let coin_list_data = await P(RPC, 'rpcRequest', 'GET', host, coinlist_url, null);
  let token_list_data = await P(RPC, 'rpcRequest', 'GET', host, tokenlist_url, null);
  // BTC充值地址
  let btc_address = '';
  if(depo_data.Status.BtcAddress) {
    btc_address = depo_data.Status.BtcAddress;
  }
  // ETH合约充值地址
  let eth_address = '';
  if (depo_data.Status.ContractAddress) {
    eth_address = depo_data.Status.ContractAddress;
  }
  // 更新可用的代币信息
  let conn = await P(pool, 'getConnection');
  try {
    await P(conn, 'beginTransaction');
    let eth_query = queryFormat('select address from tb_currency where id = 1');
    let eth_data = await P(conn, 'query', eth_query);
    if (!eth_data[0].address) {
      eth_query = queryFormat('update tb_currency set address = ? where id = 1', [eth_address]);
      await P(conn, 'query', eth_query);
    }
    // 将所有币种置为不可用状态
    let disable_currency = queryFormat('update tb_currency set available = 0 where id <> 1');
    await P(conn, 'query', disable_currency)
    // 更新可用的代币列表
    if (token_list_data.TokenInfos) {
      let token_list = token_list_data.TokenInfos;
      if (token_list.length) {
        for (let r of token_list) {
          let query = queryFormat('update tb_currency set available = 1 where id = ?', [r.Category]);
          let result = await P(conn, 'query', query);
          if (result.changedRows == 0) {
            query = queryFormat('insert into tb_currency (id, currency, factor, isToken, address) values (?, ?, ?, ?, ?)', [r.Category, r.TokenName, r.Decimals, 1, r.ContractAddr]);
            await P(conn, 'query', query)
          }
        }
      }
    }
    // 更新可用的币种列表
    if (coin_list_data.CoinStatus) {
      let coin_list = coin_list_data.CoinStatus;
      for (let r of coin_list) {
        if (r.Used) {
          let addr;
          if (r.Name == 'BTC') {
            addr = btc_address
          }
          let query = queryFormat('update tb_currency set available = 1, address = ? where id = ?', [addr, r.Category]);
          let result = await P(conn, 'query', query);
          if (result.changedRows == 0) {
            query = queryFormat('insert into tb_currency (id, currency, factor, address) values (?, ?, ?, ?)', [r.Category, r.Name, r.Decimals, addr]);
            await P(conn, 'query', query)
          }
        }
      }
    }
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
  }
  let query_result = queryFormat(`select currency, address from tb_currency where available = 1`);
  if (key_words) {
    query_result = queryFormat('select currency, address from tb_currency where available = 1 and currency like ?', ['%' + key_words + '%']);
  }
  let result = await P(pool, 'query', query_result);
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
  let conn = await P(pool, 'getConnection');
  let upd_list = [];
  let add_list = [];
  let query_upd, query_add;
  try {
    await P(conn, 'beginTransaction');
    if (type == 0) {
      let query_update = queryFormat('update tb_currency set available = 0 where isToken = ? and id <> 1', [type]);
      await P(conn, 'query', query_update);
    }
    // 获取已有的币种列表
    let query_old_coin = queryFormat('select id from tb_currency where isToken = ?', type);
    let old_coin_list = await P(conn, 'query', query_old_coin);
    for (let i = 0; i < new_list.length; i++) {
      for (let j = 0; j < old_coin_list.length; j++) {
        if (new_list[i].Category == old_coin_list[j].id) {
          upd_list.push(new_list[i].Category);
        }
      }
      if (type == 0) {
        add_list.push({ id: new_list[i].Category, address: null, currency: new_list[i].Name, factor: new_list[i].Decimals, isToken: type });
      } else if (type == 1) {
        add_list.push({ id: new_list[i].Category, address: token_addr, currency: new_list[i].TokenName, factor: new_list[i].Decimals, isToken: type });
      }
    }
    if (upd_list.length) {
      query_upd = queryFormat('update tb_currency set available = 1 where id in ( ? ');
      if (upd_list.length > 1) {
        query_upd = query_upd + queryFormat(', ? ');
      }
      query_upd = query_upd + queryFormat(')', upd_list);
      await P(conn, 'query', query_upd);
    }

    if (add_list.length) {
      query_add = queryFormat('insert into tb_currency (id, currency, factor, isToken, address) values (?, ?, ?, ?, ?) ', [add_list[0].id, add_list[0].currency, add_list[0].factor, type, add_list[0].address]);
      if (add_list.length > 1) {
        query_add = query_add + queryFormat(' (?, ?, ?, ?, ?) ', [add_list[i].id, add_list[i].currency, add_list[i].factor, type, add_list[i].address]);
      }
      await P(conn, 'query', query_add);

    }
    let eth_query = queryFormat('select address from tb_currency where id = 1');
    let eth_data = await P(conn, 'query', eth_query);
    if (!eth_data.address) {
      eth_query = queryFormat('update tb_currency set address = ? where id = 1', [token_addr]);
      await P(conn, 'query', eth_query);
    }
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
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
  // 获取余额
  let query_balance = queryFormat('select balance from tb_currency where id = ?', [currency_id]);
  let balanceInfo = await P(pool, 'query', query_balance);
  let balance = 0;
  if(balanceInfo.length) {
    balance = balanceInfo[0].balance;
  }
  balance = new BigNumber(balance);
  amount = new BigNumber(amount)
  if (type == 1) {
    balance = balance.minus(amount).toFixed()
  } else {
    balance = balance.plus(amount).toFixed()
  }
  if (typeof currency_id != 'number') currency_id = Number(currency_id);
  let query = queryFormat('update tb_currency set balance = ? where id = ?', [balance, currency_id]);
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
    let conn = await P(pool, 'getConnection');
    let tx_id;
    try {
      await P(conn, 'beginTransaction');
      let transfer_info = await P(conn, 'query', query_s);
      if (transfer_info.length == 0) {
        let query_over_approval = queryFormat('update tb_review_transfer set comments = -1 where transID = ? and sign IS NULL', trans_id);
        await P(conn, 'query', query_over_approval)
        await P(conn, 'query', query);
      }
      await P(conn, 'commit');
    } catch (err) {
      await P(conn, 'rollback');
      throw err;
    } finally {
      conn.release();
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
  for (let i = 0; i < flow_approval_info.length; i++) {
    let appr = 0;
    let rej = 0;
    let require = flow_approval_info[i].require;
    let approvers = flow_approval_info[i].approvers;
    for (let r of approvers) {
      let comments = await this.getTxInfoByApprover(r.app_account_id, trans_id);
      if (comments == 2) {
        rej++;
      } else if (comments == 3) {
        appr++;
      }
    }
    if (rej > approvers.length - require) {
      return 2;
    } else if (appr + rej < require) {
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
  for (let r of approvers_info) {
    let approvers = r.approvers;
    for (let a of approvers) {
      let sign = await this.getApproversSignByAppID(a.app_account_id, trans_id);
      if (sign && sign.length) data.push({
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
exports.getTradeHistoryListByAppID = async (currency_name, currency_id, page, limit) => {
  let start = (page - 1) * limit;
  let end = limit;
  let data = [];
  let query_total = queryFormat(`
  select count(*) as total from (
    select distinct(orderNum) from tb_deposit_history where currencyID = ?
  union all
    select distinct(orderNum) from tb_transfer where currencyID = ?) as t`, [currency_id, currency_id]);
  let query = queryFormat(`
  select * from (
      select distinct(orderNum) as order_number, amount, ? tx_info, 3 progress, 2 arrived, ? currency, UNIX_TIMESTAMP(updatedAt) as apply_at, 1 type from tb_deposit_history where currencyID = ?
    union all
      select distinct(orderNum) as order_number, amount, txInfo as tx_info , progress, arrived, ? currency,UNIX_TIMESTAMP(createdAt) as apply_at, 0 type from tb_transfer where currencyID = ?) as a 
  order by a.apply_at desc limit ?, ?`, ['deposit', currency_name, currency_id, currency_name, currency_id, start, end]);
  let total_info = await P(pool, 'query', query_total);
  if (total_info.length && total_info[0].total > 0) {
    data = await P(pool, 'query', query);
  }
  return {
    count: total_info[0].total,
    total_pages: Math.ceil(total_info[0].total / limit) || 1,
    current_page: page,
    // currency: currency_name,
    list: data
  }
}

/**
 * @function 转账失败
 * @author david
 */
exports.transferFailed = async (trans_id) => {
  let query = queryFormat('update tb_transfer set progress = 3, arrived = -1 where id = ?', trans_id);
  await P(pool, 'query', query);
}