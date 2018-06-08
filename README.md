## appServer

The Staff-Manager App Server for Enterprise Token Safe BOX 

## Before Use

- Modify the configuration file `config.js.example` fill in the `PROXY_HOST` and your MySQL configuration information.
- Rewrite the file name  `config.js.example` to `config.js`.
- Init your MySQL with the file `/scripts/box.sql`.

## Quickstart

### Get source code

~~~
$ git clone https://github.com/boxproject/box-appServer.git
~~~

## Install

~~~
$ cd appServer && npm install
~~~

## Start

~~~
$ npm run start
~~~

## API

### 1 下级员工APP递交加密后的注册申请

+ router:  /api/v1/registrations
+ 请求方式： POST
+ 参数：

|      字段       |  类型  |         备注          |
| :-------------: | :----: | :-------------------: |
|       msg       | string | 员工APP提交的加密信息 |
|   applyer_id    | string |   申请者唯一识别码    |
|   captain_id    | string |  直属上级唯一识别码   |
| applyer_account | string |    新注册员工账号     |

+ 返回值

~~~javascript
{
    "code": 0,
    "message": "提交信息成功。",
    "data": {
        "reg_id": 		// 服务端申请表ID, string 
    }
}
~~~

+ 错误代码

| code |            message             |
| :--: | :----------------------------: |
| 1001 |          参数不完整。            |
| 1002 |  您已提交注册申请，请耐心等待。     |
| 1009 | 注册失败，请稍候重试。 |
| 1010 | 您的账号已经存在，请勿重复提交注册申请。 |
| 1011 | 您的账号已被停用。 |

### 2 上级APP轮询注册申请

- router:  /api/v1/registrations/pending
- 请求方式： GET
- 参数：

| 字段        | 类型   | 备注               |
| :--------: | :----: | :---------------: |
| captain_id | string | 直属上级唯一识别码 |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取注册申请信息成功。",
    	// 如果当前无注册申请，则data值为null
    "data": {
        [{	
            "reg_id":			// 服务端申请表ID, string
            "msg":				// 加密后的注册信息, string
            "applyer_id":		// 申请者唯一标识符, string
            "applyer_account":  // 申请者账号, string
            "manager_id":		// 直属上级唯一标识符, stirng
            "consent":			// 审批结果, number 0待审批 1拒绝 2同意
            "apply_at":			// 申请提交时间戳, number
            "applyer_account":	// 申请者账号
    	}]
    }
}
```

- 错误代码

|  code  |   message      |
| :----: | :------------: |
| 1001   |   参数不完整。   |

### 3 下级员工APP轮询注册审批结果

- router:  /api/v1/registrations/approval/result
- 请求方式： GET
- 参数：

|   字段   |   类型   |    备注           |
| :-----: | :------: | :--------------: |
| reg_id  |  string  |    服务端申请表ID  |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取授权结果成功。",
    "data": {
        "reg_id":				// 服务端申请表ID, string
        "applyer_id": 			// 申请者唯一标识符，string
        "captain_id":			// 直属上级唯一标识符, string
        "msg":					// 扫码注册是提交的加密信息, string
        "consent":				// 审批结果 1拒绝 2同意, number
        "depth":				// 直属上级是否为私钥APP，0是, number
        "applyer_account":      // 申请者账号, string
        "cipher_text"           // 上级对该账号的公钥的摘要信息,string
    }
}
```

- 错误代码

|  code  |   message            |
| :----: | :------------------: |
|  1001  |     参数不完整。       |
|  1003  |    未找到该注册申请。   |

### 4 上级APP提交对注册申请的审批信息

- router:  /api/v1/registrations/approval
- 请求方式： POST
- 参数：

|    字段            |   类型   |    备注                  |
| :---------------: | :------: | :---------------------: |
|   reg_id          |  string  |     注册申请的ID          |
|   consent         |  string  |    是否同意 1拒绝，2同意    |
|   applyer_pub_key |  string  |      新注册员工公钥        |
|    cipher_text    |  string  | 该账号对申请者公钥生成的信息摘要 |
|    en_pub_key     |  string  | 该账号对申请者公钥的签名信息  |

- 返回值

```javascript
{
    "code": 0,
    "message": "提交授权结果成功。"
}
```

- 错误代码

|  code  |   message            |
| :----: | :------------------: |
|  1001  |    参数不完整。        |
|  1003  |    未找到该注册申请。   |
| 1004 | 指定账号不存在。 |
| 1005 | 签名信息错误。 |
| 1014 | 直属上级账号已被停用。 |

### 5. 提交转账申请

- router:  /api/v1/transfer/application
- 请求方式： POST
- 参数：

|    字段           |   类型   |    备注                 |
| :--------------: | :------: | :--------------------: |
|  app_account_id  |  string  |    根节点账号唯一标识符    |
|   apply_info     |  string  |         申请理由         |
|   flow_id        |  string  |        审批流编号        |
|     sign         |  string  |      申请者的签名值       |

- 备注

其中`apply_info`的结构为：

```javascript
{
    "tx_info":             // 申请理由
    "to_address":          // 目的地址
    "miner":               // 矿工费
    "amount":              // 转账金额
    "currency":            // 币种
    "timestamp":           // 申请时间戳
}
```
- 返回值

```javascript
{
    "code": 0,
    "message": "提交转账申请成功。",
    "data": {
        "order_number":         // 转账记录编号, string
    }
}
```

- 错误代码

|  code  |            message            |
| :----: | :---------------------------: |
|  1001  |            参数不完整。         |
|  1004  |           指定账号不存在。       |
|  1005  |           签名信息错误。         |
|  1006  |       未找到对应的业务流程。       |
| 1011   |           您的账号已被停用。      |
|  2001  |   转账信息有误，请查验后重新提交。  |
|  2002  |         未找到对应币种。          |
|  2004  |   转账申请提交失败，请稍候重试。    |
|  2009  |             余额不足。           |

### 6. 获取转账记录列表

- router:  /api/v1/transfer/records/list
- 请求方式： GET
- 参数：

| 字段           | 类型          | 备注                                                         |
| :--------------: | :-------------: | :------------------------------------------------------------: |
| app_account_id | string        | 账号唯一标识符                                               |
| type           | string/number | 转账记录类型，0作为发起者 1作为审批者 ；默认0                |
| progress       | string/number | 审批进度  -1所有记录 0待审批 1审批中 2被驳回 3审批成功；默认0 |
| page           | number        | 列表分页，默认1                                              |
| limit          | number        | 单页显示记录条数，默认20                                     |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取转账列表成功。",
    "data": {
        "count": 		// 总数据量, number
        "total_pages":  // 总页码, number
        "current_page":	// 当前页码, number
        "list": [{
            "order_number":	// 转账记录编号, string
            "tx_info":	    // 申请理由, string
            "amount":       // 转账金额, string
            "currency":     // 币种, string
            "single_limit": // 单笔转账限额, string
            "progress": 	// 审批进度 0待审批 1审批中 2被驳回 3审批成功, number
            "apply_at": 	// 该笔转账申请时间戳, number
        }]
    }
}
```

- 错误代码

|  code  |   message      |
| :----: | :------------: |
|  1001  |   参数不完整。   |
|  1004  |  指定账号不存在。 |
| 1011 | 您的账号已被停用。 |

### 7. 获取转账记录详情

- router:  /api/v1/transfer/records
- 请求方式： GET
- 参数：

|    字段         |   类型   |    备注         |
| :------------: | :------: | :------------: |
|  order_number  |  string  |   转账记录编号   |
| app_account_id |  string  |  账号唯一标识符  |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取转账信息成功。",
    "data": {
            "transfer_hash":    // 该笔转账对应私链的哈希值, string
            "order_number":	    // 转账记录编号, string
            "tx_info":	        // 申请理由, string
            "applyer":          // 转账申请提交者账号
            "applyer_uid":      // 申请者账号唯一标识符
            "progress":		    // 订单审批总进度 0待审批 1审批中 2被驳回 3审批成功, number
            "apply_at": 	    // 申请提交时间戳, number
            "approval_at": 	    // 审批通过时间戳，默认null, string
            "reject_at": 	    // 审批拒绝时间戳，默认null, string
            "apply_info":       // 申请者提交的转账信息, string
            "single_limit":     // 本次转账单笔限额, string
            "approvaled_info": [{
                "require": 			    // 该层级需要审批通过的最少人数, number
                "total":                // 参与该层审批人员总数, number
                "current_progress":     // 该层当前审批进度, 0待审批 1审批中 2驳回 3同意 number
            	"approvers": [{		  // 审批信息
            		"account":			    // 该审批者账号, string
            		"app_account_id":	    // 该账号唯一标识符, string
            		"sign":				    // 该账号对该笔转账的签名信息, string
            		"progress":			    // 该账号对该笔转账的审批结果 0待审批 2驳回 3同意, number
        		}]
        	},
        	...
    		]
    }
}
```

- 错误代码

|  code  |   message         |
| :----: | :------------:    |
|  1001  |   参数不完整。      |
|  1004  |   指定账号不存在。   |
|  1006  | 未找到对应的业务流程。|
| 1011 | 您的账号已被停用。 |
|  2005  | 未找到对应的转账申请。|

### 8. 提交审批意见

- router:  /api/v1/transfer/approval
- 请求方式： POST
- 参数：

|    字段           |   类型          |    备注                  |
| :--------------: | :-------------: | :---------------------: |
|  order_number    |   string        |     转账记录编号          |
|  app_account_id  |   string        |     账号唯一标识符        |
|   progress       |  string/number  |    审批意见  2驳回 3同意   |
|   sign           |   string        |     签名信息              |

- 返回值

```javascript
{
    "code": 0,
    "message": "提交审批意见成功。"
}
```

- 错误代码

|  code  |   message      |
| :----: | :------------: |
|  1001  |    参数不完整。  |
|  1004  |  指定账号不存在。 |
| 1011 | 您的账号已被停用。 |

### 9. 获取审批流模板列表

- router:  /api/v1/business/flows/list
- 请求方式： GET
- 参数：

|    字段           |   类型          |    备注                  |
| :--------------: | :-------------: | :---------------------: |
|  app_account_id  |   string        |     账号唯一标识符        |
|    key_words     |   string        |       搜索关键字         |
|       type       |   string        |  审批流状态 1已通过审批    |
|      page        |   string        |     分页，页码           |
|      limit       |   string        |   分页，单页显示数据量     |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取审批流模板列表成功。",
    "data": {
        "count": 		// 总数据量, number
        "total_pages":  // 总页码, number
        "current_page":	// 当前页码, number
        "list": [
            {
                "flow_id":          // 审批流模板编号, string
                "flow_name":        // 审批流模板名称, string
                "progress":         // 审批流模板审批进度 0待审批 2审批拒绝 3审批通过, number
                "single_limit":     // 单笔转账上限, string
            }
        ]
    }
}
```

- 错误代码

|  code  |           message             |
| :----: | :---------------------------:  |
|  1001  |           参数不完整。          |
|  1004  |          指定账号不存在。        |
|  1011  | 您的账号已被停用。         |

### 10. 获取审批流模板详情

- router:  /api/v1/business/flow/info
- 请求方式： GET
- 参数：

|    字段           |   类型          |    备注                  |
| :--------------: | :-------------: | :---------------------: |
|  app_account_id  |    string       |     账号唯一标识符        |
|     flow_id      |    string       |       审批流模板编号       |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取审批流模板详情成功。",
    "data": {
        "progress":          // 私钥APP对该模板的审批进度 0待审批 2审批拒绝 3审批同意, number
        "single_limit":      // 单笔转账限额，string
        "flow_name":         // 审批流模板名称
        "approval_info": [
            {
                "require":          // 该层所需最小审批通过人数, number
                "total":            // 参与该层审批者总数, number
                "approvers": [
                 {
                    "account":          // 审批者账号, string
                    "app_account_id":   // 审批者账号唯一标识符, string
                    "pub_key":          // 账号公钥
                 }
                ]
            }
        ]
    }
    
}
```

- 错误代码

|  code  |      message       |
| :----: |:------------------:|
|  1001  |      参数不完整。    |
|  1004  |     指定账号不存在。  |
|  1006  | 未找到对应的业务流程。 |
| 1011 | 您的账号已被停用。 |

### 11 根节点获取非直属下属的公钥信息列表

- router:  /api/v1/employee/pubkeys/list
- 请求方式： GET
- 参数：

|    字段           |   类型   |    备注                 |
| :--------------: | :------: | :--------------------: |
|  app_account_id  |  string  |    根节点账号唯一标识符    |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取员工公钥信息成功。",
    "data": [
        {
            "applyer": 		    // 待上传公钥的员工账号唯一标识符, string
            "applyer_account":  // 该员工账号，string
            "pub_key": 		    // 该员工账号的公钥, string
            "captain": 		    // 该员工账号直属上级账号唯一标识符, string
            "msg": 			    // 直属上级对其公钥的加密信息, string
            "cipher_text":      // 直属上级对该账号公钥生成的信息摘要
            "apply_at": 	    // 该员工账号申请创建时间戳, number
        }
    ]
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1004  |       指定账号不存在。       |
|  1007  |          权限不足。         |
| 1011 | 您的账号已被停用。 |

### 12 根节点获取指定非直属下属的公钥信息

- router:  /api/v1/employee/pubkeys/info
- 请求方式： GET
- 参数：

|        字段           |   类型   |    备注                 |
| :------------------: | :------: | :--------------------: |
|  manager_account_id  |  string  |    根节点账号唯一标识符    |
|  employee_account_id |  string  |     员工账号唯一标识符     |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取员工公钥信息成功。",
    "data": {
        "applyer": 		    // 待上传公钥的员工账号唯一标识符, string
        "applyer_account":  // 该员工账号，string
        "pub_key": 		    // 该员工账号的公钥, string
        "captain": 		    // 该员工账号直属上级账号唯一标识符, string
        "msg": 			    // 直属上级对其公钥的加密信息, string
        "cipher_text":      // 直属上级对该账号公钥生成的信息摘要
        "apply_at": 	    // 该员工账号申请创建时间戳, number
    }
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1004  |       指定账号不存在。       |
|  1007  |          权限不足。         |
|  1008  |    指定下级账号不存在。       |
| 1011 | 您的账号已被停用。 |
| 1013 | 指定下属账号已被停用。 |

### 13 上级管理员获取下属账号列表

- router:  /api/v1/accounts/list
- 请求方式： POST
- 参数：

|    字段           |   类型          |               备注             |
| :--------------: | :-------------: | :---------------------------: |
|  app_account_id  |   string        |       上级管理员账号唯一标识符    |
|    key_words     |   string        |              搜索字段          |
|      page        |   string        |        分页，页码，默认1        |
|      limit       |   string        |    分页，单页显示数据量，默认20    |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取下属账号列表成功。",
    "data": {
        "count": 		// 总数据量, number
        "total_pages":  // 总页码, number
        "current_page":	// 当前页码, number
        "list":[        // 账号列表信息
            {
                "account":              // 账号，string
                "app_account_id":       // 账号唯一标识符，string
                "manager_account_id":   // 对应上级账号唯一标识符，string
                "cipher_text":          // 上级对该账号公钥生成的信息摘要，string
                "is_uploaded":          // 公钥是否上传到根节点账户, 1是 0否，number
                "employee_num":         // 该账号下属个数，number
            }
        ]
    }
}
```

- 错误代码

|   code |   message      |
| :----: | :------------: |
|  1001  |   参数不完整。   |
|  1004  |  指定账号不存在。 |
| 1011 | 您的账号已被停用。 |

### 14. 创建审批流模板

- router:  /api/v1/business/flow
- 请求方式： POST
- 参数：

|    字段           |   类型          |    备注                  |
| :--------------: | :-------------: | :---------------------: |
|  app_account_id  |   string        |     账号唯一标识符        |
|      flow        |   string        |     审批流模板内容        |
|      sign        |   string        |创建者对审批流模板内容的签名值|

- 备注

其中`flow`的结构为：

```javascript
{
    "flow_name":            // 审批流模板名称
    "single_limit":         // 单笔限额
    "approval_info":[
        {
            "require":          // 该层所需最小审批同意人数
            "total":			// 该层审批者人数
            "approvers"[        // 审批者信息
                {
                    "account":          // 审批者账号
                    "app_account_id":   // 审批者账号唯一标识符
                    "pub_key":          // 审批者公钥
            		"itemType"
                }
            ]
        }
    ]
}
```

- 返回值

```javascript
{
    "code": 0,
    "message": "创建审批流模板成功。",
    "data": {
        "flow_id":              // 创建后的审批流编号
    }
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1004  |       指定账号不存在。       |
|  1005  |        签名信息错误。        |
| 1011 | 您的账号已被停用。 |
| 1012 | 请求代理服务器失败。 |
|  3001  | 您的账号暂无权限创建审批流模板。|
|  3002  | 指定业务流模板已存在，请勿重复提交。|
|  3004  |      创建审批流模板失败。     |

### 15. 获取余额

- router:  /api/v1/capital/balance
- 请求方式： GET
- 参数：

|    字段           |   类型          |    备注                  |
| :--------------: | :-------------: | :---------------------: |
|  app_account_id  |      string     |      账号唯一标识符       |
|      page        |   string        |     分页，页码           |
|      limit       |   string        |   分页，单页显示数据量     |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取余额成功。",
    "data": [{
        "currency":             // 币种, string
        "balance":              // 余额，string
    }]
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1007  |       权限不足。       |

### 16. 获取币种列表

- router:  /api/v1/capital/currency/list
- 请求方式： GET
- 参数：

|    字段           |   类型          |    备注                  |
| :--------------: | :-------------: | :---------------------: |
|  app_account_id  |      string     |      账号唯一标识符       |
| key_words | string | 搜索字段，币种名称，若为空则显示全部列表 |
|      page        |   string        |     分页，页码           |
|      limit       |   string        |   分页，单页显示数据量     |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取余额成功。",
    "data": {
        "currency_list": [
            "currency":         // 币种名称, string
            "address":          // 收款地址, string
        ]         
    }
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1004  |       指定账号不存在。       |
| 1011 | 您的账号已被停用。 |

### 17. 获取下属账号详情

- router:  /api/v1/accounts/info
- 请求方式： GET
- 参数：

|    字段              |   类型          |    备注                  |
| :-----------------: | :-------------: | :---------------------: |
|  manager_account_id |      string     |     上级账号唯一标识符     |
| employee_account_id |      string     |     下属账号唯一标识符     |

- 返回值

```javascript
{
    "code": 0,
    "message": "获取员工账号详情成功。",
    "data": {
        "app_account_id":       // 下属账号唯一标识符
        "cipher_text":          // 上级对该账号公钥的摘要信息
        "employee_accounts_info": [
            {
                "app_account_id":       // 该账号直属下级账号唯一标识符
                "account":              // 账号
                "cipher_text":          // 摘要信息
            }
        ]
    }
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1004  |       指定账号不存在。       |
|  1007  |          权限不足。         |
|  1008  |     指定下级账号不存在。      |
| 1011 | 您的账号已被停用。 |
| 1013 | 指定下属账号已被停用。 |

### 18. 删除/替换员工账号

- router:  /api/v1/employee/account/del
- 请求方式： POST
- 参数：

|    字段              |   类型          |    备注                  |
| :-----------------: | :-------------: | :---------------------: |
| employee_account_id |      string     |     下属账号唯一标识符     |
| manager_account_id  |      string     |     上级账号唯一标识符     |
| replacer_account_id |      string     |    替换者账号唯一标识符    |
|     cipher_texts    |      string     |   上级对下属公钥的摘要信息  |
|        sign         |      string     |          签名值          |

- 备注

其中`cipher_texts`的结构为：

```javascript
[{
    "app_account_id":       // 被删除/替换员工直属下属账号唯一标识符
    "cipher_text":          // 新生成的摘要信息
}]
```

- 返回值

```javascript
{
    "code": 0,
    "message": "删除/替换下属账号成功。"
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
|  1004  |       指定账号不存在。       |
|  1005  |        签名信息错误。        |
|  1007  |          权限不足。         |
|  1008  |     指定下级账号不存在。      |
| 1011   | 您的账号已被停用。 |
| 1013   | 指定下属账号已被停用。 |
| 1015 | 非同级用户账号无法替换。 |

### 19.员工反馈上级审核注册结果有误

- router:  /api/v1/registrations/approval/cancel
- 请求方式： POST 
- 参数：

|    字段              |   类型          |    备注                  |
| :-----------------: | :-------------: | :---------------------: |
|       reg_id        |      string     |         审批表ID         |
|   app_account_id    |      string     |     员工账号唯一标识符     |
|         sign        |      string     |         签名信息         |


- 返回值

```javascript
{
    "code": 0,
    "message": "通知成功。"
}
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
| 1003 | 未找到该注册申请。 |
| 1004 | 指定账号不存在。 |
|  1005  |        签名信息错误。        |
|  1007  |          权限不足。         |
|  1011  |        您的账号已被停用。    |
|  1012  |      请求代理服务器失败。    |


### 20.获取交易记录列表

- router:  /api/v1/capital/trade/history/list
- 请求方式： GET 
- 参数：

|    字段              |   类型          |    备注                  |
| :-----------------: | :-------------: | :---------------------: |
|       currency      |      string     |         币种名称         |
|   app_account_id    |      string     |     账号唯一标识符        |
|        page         |      string     |     分页，页码           |
|        limit        |      string     |    分页，单页显示数据量    |


- 返回值

```javascript
{
    "code": 0,
    "message": "获取交易记录列表成功",
    "data": {
        "count":                // 总数据量
        "total_pages":          // 总页数
        "current_page":         // 当前页码
        "list": [
            {
                "order_number":     // 订单号
                "amount":           // 充值/转账金额
                "tx_info":          // 充值/转账信息
                "progress":         // 最终审批意见，0待审批 1审批中 2驳回 3审批同意 number
                "currency":         // 记录对应的币种名称
                "updated_at":       // 更新时间，时间戳
                "type":             // 交易类型 1充值 0转账
            },
            ...
        ]
    }
```

- 错误代码

|  code  |          message          |
| :----: | :-----------------------: |
|  1001  |          参数不完整。       |
| 1003 | 未找到该注册申请。 |
| 1004 | 指定账号不存在。 |
|  1005  |        签名信息错误。        |
|  1007  |          权限不足。         |
|  1011  |        您的账号已被停用。    |
|  1012  |      请求代理服务器失败。    |

## Licence

Licensed under the Apache License, Version 2.0, Copyright 2018. box.la authors.

~~~
 Copyright 2018. box.la authors.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
~~~

