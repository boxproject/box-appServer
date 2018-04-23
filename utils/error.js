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

class ExtendableError extends Error {
  constructor(ctx, code, msg) {
    let lang = ctx.header['content-language'] || 'zh_cn';
    super(obj[lang][code]);

    Object.defineProperty(this, 'code', {
      enumerable : false,
      value : code
    })

    Object.defineProperty(this, 'ctx', {
      enumerable : false,
      value : ctx
    })

    // extending Error is weird and does not propagate `message`
    Object.defineProperty(this, 'message', {
      enumerable : false,
      value : msg?obj[lang][code]+msg+obj[lang][code+1]:obj[lang][code],
      writable : true
    });

    if (Error.hasOwnProperty('captureStackTrace')) {
      Error.captureStackTrace(this, this.constructor);
      return;
    }

    Object.defineProperty(this, 'stack', {
      enumerable : false,
      value : (new Error(obj[lang][code])).stack
    });
  }
}

module.exports = ExtendableError;


