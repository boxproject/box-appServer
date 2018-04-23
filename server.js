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
let config = require('./config');
global.config = config;
Object.freeze(global.config);

const koa = require('koa');
const bodyParser = require('koa-bodyparser');
const router = require('koa-router')();
const httpLogger = require('./utils/logger').httpLogger;
const logger = require('./utils/logger').logger;
const Utils = require('./utils/utils');
// const cors = require('cors');
require('colors');
const app = new koa();
// http access logger
app.use(httpLogger);
// bodyParser for json and form
app.use(bodyParser({
  jsonLimit:'5mb',
  textLimit:'5mb',
  formLimit:'5mb'
}));
// global error handle
app.use(Utils.handleError);
// hang router
router.use("", require(config.info.APP_DIR).routes());
app.use(router.routes())
  .use(router.allowedMethods({throw:true}));

// 500 handler
app.on('error', function *(error){
  logger.error(error);
});

let port = config.info.PORT || 3000;
if(config.info.ENV === 'test'){
  module.exports = app;
}else{
  app.listen(port);
  console.info('Application running in'.green,config.info.ENV.red,'environment.'.green);
  console.info('You can now visit '.green +
               ('http://localhost:'+config.info.PORT).underline.blue +
               ' via your browser.'.green);
}
