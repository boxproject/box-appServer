# ****************************************************************
# Copyright 2018. box.la authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# *****************************************************************

#注册申请记录
drop table if exists `tb_registration_history`;
CREATE TABLE `tb_registration_history` (
  id                        int(10) PRIMARY KEY AUTO_INCREMENT                  comment '自增ID, 主键'
, regID                     varchar(40) NOT NULL                                comment 'UUID'
, applyer                   varchar(20) NOT NULL                                comment '申请者'
, captain                   varchar(20) NOT NULL                                comment '直属上级'
, applyerAcc                varchar(20) NOT NULL                                comment '申请者账号'
, msg                       varchar(1000) NOT NULL                              comment '注册信息'
, isDeleted                 tinyint(1) NOT NULL DEFAULT 0                       comment '该条记录是否被删除'
, consent                   varchar(10) NOT NULL DEFAULT 0                      comment '上级审批结果 1拒绝 2同意'
, createdAt                 timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP        comment '申请创建时间'
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

#用户帐号
drop table if exists `tb_accounts_info`;
CREATE TABLE `tb_accounts_info` (
  id                        int(10) PRIMARY KEY AUTO_INCREMENT                  comment '账号ID'
, regID                     varchar(40) NOT NULL                                comment '对应的注册申请表ID'
, appAccountID              varchar(20) NOT NULL                                comment 'app端记录的账号ID'  
, account                   varchar(20) NOT NULL                                comment '帐号'
, pubKey                    varchar(1000) NOT NULL DEFAULT ''                   comment '公钥'
, enPubKey                  varchar(1000) NULL DEFAULT NULL                     comment '上级对下级公钥的加密信息'
, cipherText                varchar(100) NULL DEFAULT NULL                      comment '上级对该账号公钥生成的信息摘要'
, isDepartured              tinyint(1) NOT NULL DEFAULT 0                       comment '是否离职'
, lft                       int(10) NOT NULL                                    comment '左值'
, rgt                       int(10) NOT NULL                                    comment '右值'
, isUploaded                tinyint(1) NOT NULL DEFAULT 0                       comment '该账户公钥是否已发送至根节点账户'
, depth                     int(10) NOT NULL                                    comment '该账号所处的节点深度'
, createdAt                 timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP        comment '帐号创建时间'
, updatedAt                 timestamp NULL DEFAULT NULL                         comment '更新时间'
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;
#更新tb_accounts_info的 updatedAt
drop trigger if exists trg_accounts_info_update;
CREATE TRIGGER `trg_accounts_info_update` BEFORE UPDATE ON `tb_accounts_info` FOR EACH ROW set new.updatedAt=CURRENT_TIMESTAMP;

#转账申请记录
drop table if exists `tb_transfer`;
CREATE TABLE `tb_transfer` (
  id                        bigint(20) PRIMARY KEY AUTO_INCREMENT                     comment '自增ID'
, orderNum                  varchar(40) NOT NULL                                      comment '转账记录ID'
, txInfo                    varchar(100) NULL DEFAULT NULL                            comment '订单信息'
, transBoxHash              varchar(100) NULL                                         comment 'transBox上链的哈希值'                    
, applyerID                 varchar(20) NOT NULL                                      comment '申请员工帐号ID'
, currencyID                int(10) NOT NULL                                          comment '交易币种ID'
, amount                    varchar(10) NOT NULL                                      comment '转账金额'
, flowID                    bigint(10) NOT NULL DEFAULT 1                             comment '对应于哪个业务结构'
, progress                  tinyint(1) NOT NULL  DEFAULT 0                            comment '最终审批意见，0待审批 1审批中 2驳回 3审批同意'
, txID                      varchar(100) NULL DEFAULT NULL                            comment '对应公链的txid'
, applyContent              varchar(1000) NOT NULL                                    comment '申请者提交的转账信息'
, applyerSign               varchar(1000) NOT NULL                                    comment '申请者对该笔转账申请的签名'
, arrived                   tinyint(1) NOT NULL DEFAULT 0                             comment '是否到账 1-打包中 2-到账 -1-转账失败'
, createdAt                 timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP  			      comment '申请创建时间'
, updatedAt                 timestamp NULL DEFAULT NULL                               comment '更新时间'
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;
#更新tb_transfer的 updatedAt
drop trigger if exists trg_transfer_update;
CREATE TRIGGER `trg_transfer_update` BEFORE UPDATE ON `tb_transfer` FOR EACH ROW set new.updatedAt=CURRENT_TIMESTAMP;

#审批转账记录
drop table if exists `tb_review_transfer`;
CREATE TABLE `tb_review_transfer` (
  transID                   bigint(20) NOT NULL                                       comment '转账申请表的ID'
, managerAccID              int(10) NOT NULL                                          comment '账号ID'
, comments                  tinyint(1) NOT NULL DEFAULT 0                             comment '审批意见，1驳回 2审批同意 -1未提交审批意见，但本级已经同意审批'
, sign                      varchar(1000) NULL DEFAULT NULL                           comment '审批者签名'  
, createdAt                 timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP              comment '审批创建时间'
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

#币种配置列表
drop table if exists `tb_currency`;
CREATE TABLE `tb_currency` (
  id                        int(10) PRIMARY KEY                                       comment '自增ID'
, currency                  varchar(10) NOT NULL                                      comment '充值地址'
, factor                    varchar(100) NULL DEFAULT NULL                            comment '货币转换因子'
, balance                   varchar(20) NOT NULL DEFAULT 0                            comment '余额'
, isToken                   tinyint(1) NOT NULL DEFAULT 0                             comment '是否是代币'
, address                   varchar(66) NULL                                          comment '充值地址'
, available                 tinyint(1) NOT NULL DEFAULT 1                             comment '该币种是否可用'
, updatedAt                 timestamp NULL DEFAULT CURRENT_TIMESTAMP                  comment '充值时间'
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;
BEGIN;
INSERT INTO `tb_currency` VALUES (1, 'ETH', 18, '0', 0, null, 1, CURRENT_TIMESTAMP);
COMMIT;

#审批业务结构
drop table if exists `tb_business_flow`;
CREATE TABLE `tb_business_flow` (
  id                        bigint(20) PRIMARY KEY AUTO_INCREMENT                     comment '自增ID'
, flowID                    varchar(40) NOT NULL                                      comment '业务流ID'  
, flowHash                  varchar(100) NULL DEFAULT NULL                            comment '上链哈希值'                         
, flowName                  varchar(100) NOT NULL                                     comment '业务结构名称'
, founderID                 int(10) NOT NULL                                          comment '创建者账号ID'
, founderSign               varchar(1000) NOT NULL                                    comment '创建者对模板内容的签名'
, content                   text                                                      comment '业务结构内容'
, singleLimit               varchar(10) NOT NULL                                      comment '单笔转账限额' 
, progress                  tinyint(1) NOT NULL DEFAULT 0                             comment '审批流模板审批进度 0待审批 2审批拒绝 3审批通过'                    
, createdAt                 timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP              comment '业务结构创建时间'
, updatedAt                 timestamp NULL DEFAULT NULL                               comment '审批更新时间' 
-- , updatedAt                 timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP   comment '审批更新时间' 
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;
#更新tb_business_flow的 updatedAt
drop trigger if exists trg_business_flow_update;
CREATE TRIGGER `trg_business_flow_update` BEFORE UPDATE ON `tb_business_flow` FOR EACH ROW set new.updatedAt=CURRENT_TIMESTAMP;

#充值记录表
drop table if exists `tb_deposit_history`;
CREATE TABLE `tb_deposit_history` (
  id                        bigint(20) PRIMARY KEY  AUTO_INCREMENT                    comment '充值记录ID，主键'
, orderNum                  varchar(50) NOT NULL                                      comment '订单号'
, fromAddr                  varchar(66) NOT NULL                                      comment '付款方地址'
, toAddr                    varchar(66) NOT NULL                                      comment '收款方地址'
, currencyID                int(10) NOT NULL                                          comment '币种ID'                         
, amount                    varchar(100) NULL DEFAULT NULL                            comment '充值金额'
, txID                      varchar(100) NULL DEFAULT NULL                            comment '对应公链的txid' 
, updatedAt                 timestamp NULL DEFAULT CURRENT_TIMESTAMP                  comment '充值时间'
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;