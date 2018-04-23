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
const en_us = require('../static/lang/en_us.json');
const zh_cn = require('../static/lang/zh_cn.json');
const zh_hk = require('../static/lang/zh_hk.json');

const obj = {
  'en_us' : en_us,
  'zh_cn' : zh_cn,
  'zh_hk': zh_hk
}
class rData {

  constructor(ctx, message, data) {
    let lang = ctx.header['content-language'] || 'zh_cn';
    this.code = 0;
    this.message = obj[lang][message];
    this.data = data;
  }
}

module.exports = rData;


