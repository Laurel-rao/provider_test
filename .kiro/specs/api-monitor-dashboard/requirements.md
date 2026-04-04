# 需求文档

## 简介

API 监控管理系统是一个面向管理员的 Web 应用，用于集中管理和监控多个 API 端点的健康状态。系统后端采用 FastAPI 框架配合 MySQL 数据库，前端采用暗黑风格设计，通过 docker-compose 进行容器化部署。核心功能包括用户认证、API 配置管理、实时状态监控、历史记录查询、告警配置、响应时间统计和错误日志记录。

## 术语表

- **Dashboard（仪表盘）**: 系统主界面，展示所有被监控 API 的实时状态概览
- **API_Endpoint（API 端点）**: 一个被监控的外部或内部 API 地址，包含 URL、请求方法、请求头等配置信息
- **Auth_Service（认证服务）**: 负责用户登录认证和会话管理的后端服务模块
- **Monitor_Service（监控服务）**: 负责按配置频率定期探测 API 端点健康状态的后端服务模块
- **Alert_Service（告警服务）**: 负责根据告警规则检测异常并发送通知的后端服务模块
- **API_Key（API 密钥）**: 用于访问受保护 API 端点的认证凭证
- **Health_Check（健康检查）**: 对 API 端点发起的一次探测请求，记录响应时间、状态码等信息
- **Alert_Rule（告警规则）**: 定义触发告警的条件，如连续失败次数、响应时间阈值等
- **Check_Record（检查记录）**: 一次 Health_Check 的完整结果，包含时间戳、响应时间、状态码、错误信息等

## 需求

### 需求 1：管理员登录认证

**用户故事：** 作为管理员，我希望通过安全的登录认证访问系统，以确保只有授权用户能管理和查看监控数据。

#### 验收标准

1. THE Auth_Service SHALL 提供基于用户名和密码的登录接口
2. WHEN 管理员提交有效的用户名和密码时，THE Auth_Service SHALL 返回一个 JWT 访问令牌
3. WHEN 管理员提交无效的用户名或密码时，THE Auth_Service SHALL 返回 401 状态码和错误提示信息
4. THE Auth_Service SHALL 使用 bcrypt 算法对用户密码进行哈希存储
5. WHILE 用户未持有有效的 JWT 令牌时，THE Dashboard SHALL 将用户重定向到登录页面
6. WHEN JWT 令牌过期时，THE Auth_Service SHALL 返回 401 状态码，THE Dashboard SHALL 引导用户重新登录

### 需求 2：API 端点配置管理

**用户故事：** 作为管理员，我希望通过 Web 界面添加、编辑和删除被监控的 API 端点配置，以便灵活管理监控目标。

#### 验收标准

1. THE Dashboard SHALL 提供 API 端点的列表视图，展示所有已配置的 API_Endpoint
2. WHEN 管理员点击"添加"按钮时，THE Dashboard SHALL 显示一个表单，包含 URL、请求方法、请求头、期望状态码和描述字段
3. WHEN 管理员提交有效的 API 端点配置时，THE API_Endpoint SHALL 被持久化存储到 MySQL 数据库
4. WHEN 管理员提交的 URL 格式无效时，THE Dashboard SHALL 显示格式校验错误提示
5. WHEN 管理员编辑已有的 API_Endpoint 配置时，THE Dashboard SHALL 预填充当前配置值
6. WHEN 管理员确认删除一个 API_Endpoint 时，THE Monitor_Service SHALL 停止对该端点的监控，THE 系统 SHALL 从数据库中移除该配置

### 需求 3：API 密钥管理

**用户故事：** 作为管理员，我希望为需要认证的 API 端点配置密钥，以便监控服务能正确访问受保护的 API。

#### 验收标准

1. THE Dashboard SHALL 提供 API_Key 的管理界面，支持创建、查看和删除操作
2. WHEN 管理员创建一个新的 API_Key 时，THE 系统 SHALL 将密钥加密存储到数据库
3. THE Dashboard SHALL 在列表中对 API_Key 的值进行脱敏显示，仅展示前四位和后四位字符
4. WHEN 管理员将 API_Key 关联到某个 API_Endpoint 时，THE Monitor_Service SHALL 在执行 Health_Check 时携带该密钥
5. WHEN 管理员删除一个 API_Key 时，THE 系统 SHALL 解除该密钥与所有关联 API_Endpoint 的绑定关系

### 需求 4：监控频率配置

**用户故事：** 作为管理员，我希望为每个 API 端点配置独立的监控频率，以便根据 API 的重要程度灵活调整检查间隔。

#### 验收标准

1. THE Dashboard SHALL 为每个 API_Endpoint 提供监控频率配置选项
2. THE 系统 SHALL 支持以下监控频率选项：30秒、1分钟、5分钟、10分钟、30分钟、1小时
3. WHEN 管理员未为 API_Endpoint 指定监控频率时，THE Monitor_Service SHALL 使用默认频率 5 分钟
4. WHEN 管理员修改某个 API_Endpoint 的监控频率时，THE Monitor_Service SHALL 在下一个检查周期开始时应用新频率
5. THE Monitor_Service SHALL 按照配置的频率对每个 API_Endpoint 执行 Health_Check

### 需求 5：API 状态实时监控

**用户故事：** 作为管理员，我希望在仪表盘上实时查看所有 API 端点的当前状态，以便快速发现异常。

#### 验收标准

1. THE Dashboard SHALL 以卡片或表格形式展示所有 API_Endpoint 的当前状态，包含端点名称、URL、状态（正常/异常/未知）和最近一次检查时间
2. THE Dashboard SHALL 使用绿色表示正常状态、红色表示异常状态、灰色表示未知状态
3. WHEN Monitor_Service 完成一次 Health_Check 时，THE Dashboard SHALL 在 10 秒内更新对应 API_Endpoint 的状态显示
4. THE Dashboard SHALL 显示所有 API_Endpoint 的整体健康率统计（正常数量 / 总数量）
5. THE Dashboard SHALL 遵循暗黑风格设计，使用深色背景配合高对比度文字和状态指示色

### 需求 6：历史记录查询

**用户故事：** 作为管理员，我希望查询 API 端点的历史检查记录，以便分析 API 的稳定性和性能趋势。

#### 验收标准

1. THE Dashboard SHALL 提供历史记录查询页面，支持按 API_Endpoint、时间范围进行筛选
2. WHEN 管理员查询历史记录时，THE Dashboard SHALL 以表格形式展示 Check_Record 列表，包含时间戳、状态码、响应时间和错误信息
3. THE Dashboard SHALL 提供响应时间趋势图表，以折线图形式展示选定 API_Endpoint 在指定时间范围内的响应时间变化
4. THE Dashboard SHALL 支持将历史记录导出为 CSV 格式文件
5. THE 系统 SHALL 保留最近 90 天的 Check_Record 数据，超过 90 天的记录 SHALL 被自动清理

### 需求 7：响应时间统计

**用户故事：** 作为管理员，我希望查看 API 端点的响应时间统计数据，以便评估 API 的性能表现。

#### 验收标准

1. THE Dashboard SHALL 为每个 API_Endpoint 展示以下响应时间统计指标：平均响应时间、最大响应时间、最小响应时间、P95 响应时间
2. THE Dashboard SHALL 支持按时间范围（最近1小时、最近24小时、最近7天、最近30天）查看统计数据
3. WHEN 管理员选择某个 API_Endpoint 时，THE Dashboard SHALL 展示该端点的响应时间分布直方图
4. THE Monitor_Service SHALL 在每次 Health_Check 中记录从发起请求到收到完整响应的耗时（毫秒精度）

### 需求 8：告警配置与通知

**用户故事：** 作为管理员，我希望配置告警规则并在 API 异常时收到通知，以便及时响应和处理故障。

#### 验收标准

1. THE Dashboard SHALL 提供告警规则配置界面，支持为每个 API_Endpoint 创建 Alert_Rule
2. THE Alert_Rule SHALL 支持以下触发条件类型：连续失败次数阈值、响应时间超过指定阈值
3. WHEN Alert_Rule 的触发条件被满足时，THE Alert_Service SHALL 生成一条告警记录
4. THE Dashboard SHALL 提供告警记录列表页面，展示所有历史告警，包含触发时间、API_Endpoint 名称、触发条件和当前状态（未处理/已确认/已解决）
5. WHEN 管理员确认或解决一条告警时，THE 系统 SHALL 更新该告警记录的状态
6. IF Alert_Service 无法发送告警通知，THEN THE Alert_Service SHALL 将发送失败记录写入错误日志

### 需求 9：错误日志记录

**用户故事：** 作为管理员，我希望查看系统的错误日志，以便排查问题和了解系统运行状况。

#### 验收标准

1. THE 系统 SHALL 记录所有 Health_Check 失败的详细信息，包含时间戳、API_Endpoint、错误类型、错误消息和 HTTP 状态码
2. THE 系统 SHALL 记录所有系统内部错误，包含时间戳、模块名称、错误类型和堆栈信息
3. THE Dashboard SHALL 提供错误日志查询页面，支持按时间范围、错误类型和 API_Endpoint 进行筛选
4. THE Dashboard SHALL 以分页表格形式展示错误日志，每页默认显示 20 条记录
5. THE 系统 SHALL 保留最近 90 天的错误日志数据，超过 90 天的记录 SHALL 被自动清理

### 需求 10：容器化部署

**用户故事：** 作为运维人员，我希望通过 docker-compose 一键部署整个系统，以便快速搭建和维护监控环境。

#### 验收标准

1. THE 系统 SHALL 提供 docker-compose.yml 文件，定义 FastAPI 后端服务、MySQL 数据库服务和前端服务的容器编排
2. WHEN 运维人员执行 `docker-compose up` 命令时，THE 系统 SHALL 自动启动所有服务并完成数据库初始化
3. THE 系统 SHALL 通过环境变量文件（.env）管理数据库连接信息、JWT 密钥等敏感配置
4. THE 系统 SHALL 为 MySQL 数据库配置持久化数据卷，确保容器重启后数据不丢失
5. IF 任一服务容器异常退出，THEN docker-compose SHALL 自动重启该服务容器
