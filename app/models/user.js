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
const RPC = require('../../utils/rpc');

/**
 * @function 记录注册申请
 * @param   {string} msg              // 员工APP提交的加密信息
 * @param   {string} applyer          // 申请者账号唯一标识符
 * @param   {string} captain          // 直属上级账号唯一标识符
 * @param   {string} applyer_account  // 新注册员工账号
 * @return  {string} 注册申请表ID
 * @author  david
 */
exports.addRegistration = async (applyer, captain, msg, applyer_account) => {
  let regid;
  let conn = await P(pool, 'getConnection');
  try {
    let query = queryFormat('insert into tb_registration_history set regID = uuid(), applyer = ?, captain = ?, msg = ?, applyerAcc = ?', [applyer, captain, msg, applyer_account]);
    let data = await P(conn, 'query', query);
    let reg_id = data.insertId;
    query = queryFormat('select regID from tb_registration_history where id = ?', [reg_id]);
    data = await P(conn, 'query', query);
    if (data.length) regid = data[0].regID;
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
  }
  return regid;
}

/**
 * @function 获取注册申请
 * @param   {string} captain  // 直属上级账号唯一标识符
 * @param   {string} applyer  // 申请者账号唯一标识符
 * @returns {array} [{
 *              registration_id:  // 服务端申请表ID
 *              applyer:          // 申请者
 *              captain:          // 直属上级
 *              msg:              // 加密后的注册信息
 *              consent:          // 审批结果 1拒绝 2同意
 *            }]
 * @author david
 */
exports.getRegistration = async (captain, applyer) => {
  let query = queryFormat(`
  select regID as reg_id, applyer as applyer_id, captain as manager_id, 
    msg, consent, UNIX_TIMESTAMP(createdAt) as apply_at, applyerAcc as applyer_account
  from tb_registration_history
  where captain = ? and isDeleted = 0`, [captain])
  if (!applyer) {
    query = query + queryFormat(` order by apply_at desc `);
  } else {
    // 管理员涉及的注册申请
    query = query + queryFormat(` and applyer = ? `, [applyer]);
  }
  let result = await P(pool, 'query', query);
  return result.length ? result : null;
}

/**
 * @function 根据registration_id获取注册申请
 * @param   {string} reg_id      // 申请表regID
 * @param   {string} is_deleted  // 按订单是否被删除状态获取
 * @return  {obj}
 * @author  david
 */
exports.getRegistrationByRegID = async (reg_id, is_deleted) => {
  let query = queryFormat(`
  SELECT id, regID as reg_id, applyer as applyer_id, captain as captain_id,
    msg, consent, applyerAcc as applyer_account
  FROM tb_registration_history
  WHERE regID = ? ` , [reg_id]);
  if (is_deleted == 0 || is_deleted == 1) {
    query = query + queryFormat(' and isDeleted = ?', [is_deleted]);
  }
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

/**
 * @function 获取用户账号对应的注册信息
 * @author david
 */
exports.getRegistrationByRegIDWithAcc = async (reg_id) => {
  let query = queryFormat(`
  SELECT rh.id, rh.regID as reg_id, rh.applyer as applyer_id, rh.captain as captain_id,
    rh.msg, rh.consent, ifnull(acc.depth, -1) as depth, rh.applyerAcc as applyer_account, acc.cipherText as cipher_text
  FROM tb_registration_history rh
    LEFT JOIN tb_accounts_info acc ON acc.regID = rh.id
  WHERE rh.regID = ? ` , [reg_id]);
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

/**
 * @function 根据registration_id获取注册申请
 * @param {string} reg_id      // 申请表id
 * @param {string} is_deleted  // 按订单是否被删除状态获取
 * @return {obj}
 * @author david
 */
exports.getRegistrationByID = async (id, is_deleted) => {
  let query = queryFormat(`
  SELECT rh.id, rh.regID as reg_id, rh.applyer as applyer_id, rh.captain as captain_id,
    rh.msg, rh.consent, ifnull(acc.depth, -1) as depth, rh.applyerAcc as applyer_account, acc.cipherText as cipher_text
  FROM tb_registration_history rh
    LEFT JOIN tb_accounts_info acc ON acc.regID = rh.id
  WHERE rh.id = ? ` , [id]);
  if (is_deleted == 0 || is_deleted == 1) {
    query = query + queryFormat(' and isDeleted = ?', [is_deleted]);
  }
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

/**
 * @function 记录上级审批结果
 * @param   {string} reg_id     // 注册表regID
 * @param   {string} consent    // 直属上级审批结果 1拒绝 2同意
 * @returns {bool}
 * @author  david
 */
exports.updateCaptainApprovalInfo = async (reg_id, consent) => {
  let query = queryFormat('update tb_registration_history set consent = ?, isDeleted = ? where regID = ?', [consent, 1, reg_id]);
  await P(pool, 'query', query);
}

/**
 * @function 按时间戳更新注册信息的isDeleted状态为1
 * @param {string} min_date_time   // 开始时间戳
 * @param {string} max_date_time   // 结束时间戳
 * @author david
 */
exports.delRegistrationInfoByDateTime = async (min_date_time, max_date_time) => {
  let query = queryFormat('update tb_registration_history set consent = ?, isDeleted = ? where UNIX_TIMESTAMP(createdAt) between ? and ?', [1, 1, min_date_time, max_date_time]);
  await P(pool, 'query', query);
}

/**
 * @function 根据appAccountID获取用户账户信息
 * @param {string} app_account_id  // 账号唯一标识符
 * @author david
 */
exports.getAccountInfoByAppAccountID = async (app_account_id) => {
  let query = queryFormat(`
  SELECT acc.id, acc.account, acc.pubKey as pub_key, acc.appAccountID as app_account_id, acc.regID as reg_id, 
    acc.lft, acc.rgt, acc.depth, acc.cipherText as cipher_text, acc.isDepartured as departured
  FROM tb_accounts_info acc
  	left join tb_registration_history rh on rh.applyer = acc.appAccountID 
  WHERE acc.appAccountID = ? and rh.consent = 2`, [app_account_id]);
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

/**
 * @function 获取下级账号列表
 * @param {string} captain_account_id    // 上级管理员账号唯一标识符
 * @param {number} depth                 // 下属账号所在的层级
 * @param {number} page, limit           // 分页
 * @author david
 */
exports.getEmployeeAccountsByCaptainID = async (depth, lft, rgt, page, limit) => {
  let start = (page - 1) * limit;
  let end = limit;
  let query_count = queryFormat(`
  SELECT count(*) as count
  FROM tb_accounts_info 
  WHERE depth = ? AND isDepartured = 0 AND lft BETWEEN ? AND ?`, [depth, lft, rgt]);
  let query = queryFormat(`
  SELECT acc.account, acc.isUploaded as is_uploaded, acc.cipherText as cipher_text,
    acc.appAccountID as app_account_id, rh.captain as manager_account_id
  FROM tb_accounts_info as acc
    left join tb_registration_history as rh
      on rh.id = acc.regID
  WHERE acc.depth = ? AND acc.isDepartured = 0 AND acc.lft BETWEEN ? AND ?
  ORDER BY acc.lft
  limit ?, ?`, [depth, lft, rgt, start, end]);
  let data_count = await P(pool, 'query', query_count);
  let data = await P(pool, 'query', query);
  for (let r of data) {
    let account_info = await this.getAccountInfoByAppAccountID(r.app_account_id);
    if (account_info) {
      query_count = queryFormat(`
      SELECT count(*) as count
      FROM tb_accounts_info 
      WHERE depth = ? AND isDepartured = 0 AND lft BETWEEN ? AND ?`, [account_info.depth + 1, account_info.lft, account_info.rgt]);
      let child_count = await P(pool, 'query', query_count);
      r.employee_num = child_count[0].count;
    }
  }
  return {
    count: data_count[0].count,
    total_pages: Math.ceil(data_count[0].count / limit),
    data: data.length ? data : []
  }
}

/**
 * @function 根据account搜索用户账号信息
 * @param {string} account    // 用户账号
 * @author david
 */
exports.searchAccountInfoByAccount = async (account, page, limit) => {
  let start = (page - 1) * limit;
  let end = limit;
  let query_count = queryFormat(`
    select count(*) as count from tb_accounts_info where account like ?`, ['%' + account + '%']);
  let query = queryFormat(`
    select acc.account, acc.isUploaded as is_uploaded, acc.appAccountID as app_account_id,
      acc.cipherText as cipher_ext, rh.captain as manager_account_id
    from tb_accounts_info as acc
      left join tb_registration_history as rh
        on rh.id = acc.regID
    where rh.consent = 2 and acc.account like ?
    limit ?, ?`, ['%' + account + '%', start, end]);
  let data = await P(pool, 'query', query);
  let data_count = await P(pool, 'query', query_count);
  return {
    count: data_count[0].count,
    total_pages: Math.ceil(data_count[0].count / limit),
    data: data.length ? data : []
  }
}

/**
 * @function 根据account_id获取用户账号信息
 * @param {string} account_id     // 账号ID
 * @returns {
 *              account:            // 审批者账号
 *              app_account_id:     // 审批者账号唯一标识符
 *              pub_key:            // 审批者公钥
 *              sign:               // 审批者对该笔订单签名值
 *              progress:           // 
 *            }
 * @author david
 */
exports.getAccountInfoByAccountID = async (account_id) => {
  let query = queryFormat(`
  select acc.account, acc.appAccountID as app_account_id, acc.pubKey as pub_key, acc.lft, acc.rgt, acc.depth
  from tb_accounts_info as acc
    left join tb_registration_history as rh
      on rh.applyer = acc.appAccountID
  where acc.id = ? and rh.consent = 2`, [account_id]);
  let data = await P(pool, 'query', query);
  return data.length ? data[0] : null;
}

/**
 * @function 获取用户账号直属下级账号信息
 * @param {number} depth 
 * @param {number} lft 
 * @param {number} rgt 
 * @author david
 */
exports.getUnderlingInfoByManagerAccountID = async (depth, lft, rgt) => {
  let query = queryFormat(`
    select appAccountID as app_account_id, account, cipherText as cipher_text 
    from tb_accounts_info
    where depth = ? and lft between ? and ?`, [depth, lft, rgt]);
  let data = await P(pool, 'query', query);
  return data.length ? data : null;
}

/**
 * @function 插入新用户账户信息
 * @param {string} account                 // 用户账户 
 * @param {string} app_account_id          // 账号唯一标识符
 * @param {string} pub_key                 // 公钥
 * @param {string} cipher_text             // 上级对该账户公钥生成的摘要信息 
 * @param {string} en_pub_key              // 上级对下级公钥的加密信息 
 * @param {number} captain_account_rgt     // 直属上级账号的rgt 
 * @param {number} registration_id         // 注册表id 
 * @param {bool} is_uploaded               // 该用户公钥是否上传到根节点账户 
 * @param {number} depth                   // 该账号所在的节点深度
 * @author david
 */
exports.genAccount = async (account, app_account_id, pub_key, cipher_text, en_pub_key, captain_account_rgt, registration_id, is_uploaded, depth) => {
  logger.info('生成账号', {
    account: account,
    app_account_id: app_account_id,
    pub_key: pub_key,
    cipher_text: cipher_text,
    en_pub_key: en_pub_key,
    captain_account_rgt: captain_account_rgt,
    registration_id: registration_id,
    is_uploaded: is_uploaded,
    depth: depth
  })
  let conn = await P(pool, 'getConnection');
  try {
    if (captain_account_rgt == 0) {
      let query = queryFormat('select ifnull(max(rgt), 0) as max_rgt from tb_accounts_info');
      let data = await P(conn, 'query', query);
      captain_account_rgt = data[0].max_rgt + 1;
    }
    await P(conn, 'beginTransaction');
    let query_rgt = queryFormat('update tb_accounts_info set rgt = rgt + 2 where rgt >= ?', [captain_account_rgt]);
    let query_lft = queryFormat('update tb_accounts_info set lft = lft + 2 where lft > ?', [captain_account_rgt]);
    let query_add = queryFormat('insert into tb_accounts_info set account = ?, appAccountID = ?, regID = ?, pubKey = ?, enPubKey = ?, cipherText = ?, lft = ?, rgt = ?, isUploaded = ?, depth = ?', [account, app_account_id, registration_id, pub_key, en_pub_key, cipher_text, captain_account_rgt, captain_account_rgt + 1, is_uploaded, depth]);
    await P(conn, 'query', query_lft);
    await P(conn, 'query', query_rgt);
    await P(conn, 'query', query_add);
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @function 根据下属账号获取对应的根节点账号信息
 * @param {number} lft rgt      // 下属账号 lft和rgt
 * @author david
 */
exports.getRootAccountByUnderlingAcc = async (lft, rgt) => {
  let query = queryFormat('select id from tb_accounts_info where lft < ? and rgt > ? and depth = 0', [lft, rgt]);
  let data = await P(pool, 'query', query);
  return data.length ? data[0] : null;
}

/**
 * @function 根节点获取未被上传的下属的公钥信息列表
 * @param {string} app_account_id   // 根节点账号唯一标识符
 * @returns [{
 *              applyer:      // 待上传公钥的员工账号唯一标识符
 *              pub_key:      // 该员工账号的公钥
 *              captain:      // 该员工账号直属上级账号唯一标识符
 *              msg:          // 直属上级对其公钥的加密信息
 *              apply_at      // 该员工账号申请创建时间戳
 *           }]
 * @author david
 */
exports.getEmployeeEnPubKeyInfoList = async (app_account_id) => {
  let str = `
  SELECT t.applyer, acc.pubKey as pub_key, rh.captain as captain, 
    acc.enPubKey as msg, acc.cipherText as cipher_text, 
    UNIX_TIMESTAMP(acc.createdAt) as apply_at, acc.account as applyer_account
  FROM(
    SELECT node.appAccountID as applyer
  FROM tb_accounts_info AS node,
	tb_accounts_info AS parent
	left join tb_registration_history as rh
		on rh.applyer = parent.appAccountID
  WHERE node.lft BETWEEN parent.lft AND parent.rgt
	  AND rh.captain = ?
  ORDER BY node.lft) AS t
  LEFT JOIN tb_accounts_info AS acc 
	  ON acc.appAccountID = t.applyer
  LEFT JOIN tb_registration_history AS rh 
	  ON rh.id = acc.regID
  WHERE acc.isUploaded = 0 AND acc.isDepartured = 0 and rh.consent = 2`;
  let query = queryFormat(str, [app_account_id]);
  let result = await P(pool, 'query', query);
  let account_ids = []
  if (result.length) {
    for (let r of result) {
      account_ids.push(r.applyer);
    }
  }
  return {
    result: result,
    account_ids: account_ids
  }
}

/**
 * @function 标记指定下属的公钥已上传根节点账号
 * @param {array} account_ids   // 下属账号唯一标识符
 * @author david
 */
exports.updateAccountsPubkeyUploadInfo = async (account_ids) => {
  let query;
  if (account_ids.length > 1) {
    query = queryFormat('update tb_accounts_info set isUploaded = 1 where appAccountID in (?, ', account_ids[0]);
    for (let i = 1; i < account_ids.length - 1; i++) {
      query = query + queryFormat('?, ', account_ids[i]);
    }
    query = query + queryFormat('?)', account_ids[account_ids.length - 1]);
  } else {
    query = queryFormat('update tb_accounts_info set isUploaded = 1 where appAccountID = ?', account_ids);
  }
  await P(pool, 'query', query);
}

/**
 * @function 获取指定下属加密后的公钥信息
 * @param {string} app_account_id   // 指定下属账号唯一标识符
 * @author david
 */
exports.getEmployeeEnPubKeyInfo = async (app_account_id) => {
  let query = queryFormat(`
  select acc.appAccountID as applyer, acc.pubKey as pub_key, rh.captain as captain, 
    acc.enPubKey as msg, acc.cipherText as cipher_text, 
    UNIX_TIMESTAMP(acc.createdAt) as apply_at, acc.account as applyer_account
  from tb_accounts_info as acc
    left join tb_registration_history as rh 
      on rh.id = acc.regID
  where acc.appAccountID = ? and rh.consent = 2`, [app_account_id]);
  let result = await P(pool, 'query', query);
  return result.length ? result[0] : null;
}

/**
 * @function 删除/替换下属账号
 * @param {string} app_account_id   // 指定下属账号唯一标识符
 * @param {array} employee_info    // 下属账号信息
 *        employee_info的结构为
 *        [{
 *            app_account_id: 
 *            cipher_text:
 *          },
 *          ...
 *        ]
 */
exports.changeEmployee = async (app_account_id, employee_info) => {
  let elder_leader = await this.getAccountInfoByAppAccountID(app_account_id);
  let query_del = queryFormat('update tb_accounts_info set isDepartured = ? where appAccountID = ?', [1, app_account_id]);
  let query_in = queryFormat(`update tb_accounts_info set lft = lft -1, rgt = rgt - 1, depth = ? where lft between ? and ?`, [elder_leader.depth, elder_leader.lft + 1, elder_leader.rgt - 1]);
  let query_out_rgt = queryFormat('update tb_accounts_info set rgt = rgt -2 where rgt > ?', [elder_leader.rgt]);
  let query_out_lft = queryFormat('update tb_accounts_info set lft = lft - 2 where lft > ?', [elder_leader.rgt]);
  let when_str = '';
  let query_upd, where_str;
  if (employee_info.length) {
    query_upd = queryFormat(`
      UPDATE tb_accounts_info 
      SET cipherText = CASE appAccountID 
        WHEN ? THEN ?`, [employee_info[0].app_account_id, employee_info[0].cipher_text]);
    where_str = queryFormat(`WHERE appAccountID IN (?`, [employee_info[0].app_account_id]);
    for (let i = 1; i < employee_info.length; i++) {
      when_str = when_str + queryFormat(`
        WHEN ? THEN ?
      `, [employee_info[i].app_account_id, employee_info[i].cipher_text]);
      where_str = where_str + queryFormat(`, ?`, [employee_info[i].app_account_id]);
    }
    query_upd = query_upd + when_str + `
    END 
    ` + where_str + ')';

  }
  let conn = await P(pool, 'getConnection');
  let tx_id;
  try {
    await P(conn, 'beginTransaction');
    await P(conn, 'query', query_del);
    await P(conn, 'query', query_in);
    await P(conn, 'query', query_out_rgt);
    await P(conn, 'query', query_out_lft);
    if (query_upd) await P(conn, 'query', query_upd);
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @function 替换账号,更新上下级关系
 * @param {string} member_app_account_id    // 新下属账号唯一标识符
 * @param {string} leader_id                // 上级账号唯一标识符
 * @author david
 */
exports.replaceEmployee = async (member_app_account_id, leader_id) => {
  let leader_info = await this.getAccountInfoByAccountID(leader_id);
  let member = await this.getAccountInfoByAppAccountID(member_app_account_id);
  if (leader_info.lft > member.lft) {
    let query_mov_lft = queryFormat('update tb_accounts_info set lft = lft - 2 where isDepartured = 0 and lft > ?', [member.rgt]);
    let query_mov_rgt = queryFormat('update tb_accounts_info set rgt = rgt - 2 where isDepartured = 0 and rgt > ?', [member.rgt]);
    await P(pool, 'query', query_mov_lft);
    await P(pool, 'query', query_mov_rgt);
    leader_info = await this.getAccountInfoByAccountID(leader_id);
    member = await this.getAccountInfoByAppAccountID(member_app_account_id);
  }
  let conn = await P(pool, 'getConnection');
  try {
    await P(conn, 'beginTransaction');
    let query_rgt = queryFormat('update tb_accounts_info set rgt = rgt + 2 where rgt >= ? and isDepartured = 0', [leader_info.rgt]);
    let query_lft = queryFormat('update tb_accounts_info set lft = lft + 2 where lft > ? and isDepartured = 0', [leader_info.rgt]);
    let query_add = queryFormat('update tb_accounts_info set lft = ?, rgt = ?, depth = ? where appAccountID = ?', [leader_info.rgt, leader_info.rgt + 1, leader_info.depth + 1, member.app_account_id]);
    await P(conn, 'query', query_rgt);
    await P(conn, 'query', query_lft);
    await P(conn, 'query', query_add);
    await P(conn, 'commit');
  } catch (err) {
    await P(conn, 'rollback');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @function 向代理服务器提交注册申请信息
 * @param   {string} msg              // 员工APP提交的加密信息
 * @param   {string} applyer_id       // 申请者账号唯一标识符
 * @param   {string} captain_id       // 直属上级账号唯一标识符
 * @param   {string} applyer_account  // 新注册员工账号
 * @return  void
 * @author  david
 */
exports.applyTegistrationToServer = async (reg_id, msg, applyer_id, captain_id, applyer_account, status) => {
  let host = config.info.PROXY_HOST;
  let url = config.info.SERVER_URL.REGISTRATION;
  let params_obj = {
    regid: reg_id,
    msg: msg,
    applyerid: applyer_id,
    captainid: captain_id,
    applyeraccount: applyer_account,
    status: status
  }
  let result = await P(RPC, 'rpcRequest', 'POST', host, url, params_obj);
  return result && result.RspNo == 0 ? true : false;
}

/**
 * @function 更新摘要信息
 * @param {array} employee_account_info   // 用户信息
 * @param {array} cipher_texts            // 需要更新的用户摘要信息
 * @author david
 */
exports.changeCipherInfo = async (employee_info, cipher_texts) => {
  let data = [];
  if (typeof cipher_texts != 'object') cipher_texts = JSON.parse(cipher_texts);
  if (employee_info) {
    if (!cipher_texts.length) return -1;
    for (let r of cipher_texts) {
      for (let c of employee_info) {
        if (r.app_account_id == c.app_account_id) {
          data.push({
            app_account_id: r.app_account_id,
            cipher_text: r.cipher_text
          });
        }
      }
    }
  }
  return data;
}

/**
 * @function 获取审批者账号信息
 * @author david
 */
exports.getApproversInfoByAccount = async (approvers_accounts_list) => {
  let query;
  if (approvers_accounts_list.length == 1) {
    query = queryFormat("select id from tb_accounts_info where appAccountID = ?", approvers_accounts_list[0].app_account_id);
  } else if (approvers_accounts_list.length > 1) {
    query = queryFormat("select id from tb_accounts_info where appAccountID in ( ? ", approvers_accounts_list[0].app_account_id);
    for (let i = 1; i < approvers_accounts_list.length; i++) {
      query = query + queryFormat(" , ? ", approvers_accounts_list[i].app_account_id);
    }
    query = query + queryFormat(" ) ");
  }
  let result = await P(pool, 'query', query);
  return result.length ? result : []
}