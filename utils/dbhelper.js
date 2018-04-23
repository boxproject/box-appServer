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

const mysql = require('mysql');
const config = global.config;

const dbinfo = config.mysql;
const dbinfo_manage = config.mysql_manage;

exports.pool = mysql.createPool({
  connectionLimit : 10,
  host     : dbinfo.host,
  port     : dbinfo.port,
  user     : dbinfo.user,
  password : dbinfo.password,
  database : dbinfo.database,
  charset  : 'UTF8_GENERAL_CI',
  debug    : false,
  supportBigNumbers :true
});
exports.queryFormat = mysql.format;
