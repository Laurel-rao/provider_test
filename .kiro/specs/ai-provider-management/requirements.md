# 需求文档

## 简介

AI 供应商管理模块是 API 监控管理系统的扩展功能，用于集中管理不同 AI 服务商（如 OpenAI、Claude 等）的配置信息。管理员可通过 Web 界面对 AI 供应商进行增删改查操作，系统根据供应商配置自动创建对应的监控端点，实现对 AI 服务可用性的持续健康探测。该模块复用现有系统的 Fernet 加密机制保护 API Key，并与现有的端点管理、监控调度、告警等模块无缝集成。

## 术语表

- **AI_Provider（AI 供应商）**: 一条 AI 服务商配置记录，包含类型、BaseURL、API Key、模型、名称和备注等信息
- **Provider_Type（供应商类型）**: AI 服务商的类别标识，如 openai、claude_code、azure_openai、custom 等
- **BaseURL（基础地址）**: AI 服务商 API 的根地址，用于拼接具体的 API 路径
- **Provider_Service（供应商服务）**: 负责 AI 供应商配置的业务逻辑处理，包括 CRUD 操作和自动创建监控端点
- **Dashboard（仪表盘）**: 系统前端界面，本模块中特指 AI 供应商管理页面
- **API_Endpoint（API 端点）**: 现有系统中的被监控端点实体，AI 供应商配置可自动生成对应的 API_Endpoint
- **Monitor_Service（监控服务）**: 现有系统中负责定时健康检查的后端服务模块
- **KeyEncryptor（密钥加密器）**: 现有系统中基于 Fernet 对称加密的密钥加解密服务

## 需求

### 需求 1：AI 供应商数据模型

**用户故事：** 作为管理员，我希望系统能持久化存储 AI 供应商的配置信息，以便统一管理多个 AI 服务商的接入参数。

#### 验收标准

1. THE AI_Provider SHALL 包含以下必填字段：名称（name）、供应商类型（provider_type）、基础地址（base_url）、API Key（api_key）、模型（model）
2. THE AI_Provider SHALL 包含以下可选字段：备注（description）
3. THE Provider_Service SHALL 使用 KeyEncryptor 对 AI_Provider 的 api_key 字段进行 Fernet 加密后存储到数据库
4. THE Provider_Service SHALL 在存储 api_key 时同时生成脱敏值（masked_key），仅保留部分可见字符
5. THE AI_Provider SHALL 记录创建时间（created_at）和更新时间（updated_at）字段
6. WHEN 管理员提交的 base_url 不以 http:// 或 https:// 开头时，THE Provider_Service SHALL 返回 422 状态码和格式校验错误信息

### 需求 2：AI 供应商 CRUD 管理接口

**用户故事：** 作为管理员，我希望通过 RESTful API 对 AI 供应商配置进行增删改查操作，以便灵活管理 AI 服务商的接入。

#### 验收标准

1. THE Provider_Service SHALL 提供 GET /api/ai-providers 接口，返回所有 AI_Provider 列表，api_key 字段以脱敏形式展示
2. THE Provider_Service SHALL 提供 POST /api/ai-providers 接口，创建新的 AI_Provider 配置
3. THE Provider_Service SHALL 提供 GET /api/ai-providers/{id} 接口，返回单个 AI_Provider 的详细信息，api_key 字段以脱敏形式展示
4. THE Provider_Service SHALL 提供 PUT /api/ai-providers/{id} 接口，更新已有的 AI_Provider 配置
5. THE Provider_Service SHALL 提供 DELETE /api/ai-providers/{id} 接口，删除指定的 AI_Provider 配置
6. WHEN 未认证用户访问 AI_Provider 相关接口时，THE Provider_Service SHALL 返回 401 状态码
7. WHEN 管理员请求不存在的 AI_Provider 时，THE Provider_Service SHALL 返回 404 状态码和错误提示信息
8. WHEN 管理员更新 AI_Provider 且未提供 api_key 字段时，THE Provider_Service SHALL 保留原有的加密密钥不变


### 需求 3：AI 供应商管理前端页面

**用户故事：** 作为管理员，我希望通过 Web 界面直观地管理 AI 供应商配置，以便无需直接调用 API 即可完成日常管理操作。

#### 验收标准

1. THE Dashboard SHALL 在侧边栏导航中新增"AI 供应商"菜单项，路由路径为 /ai-providers
2. THE Dashboard SHALL 提供 AI_Provider 列表视图，以表格形式展示所有供应商配置，包含名称、类型、模型、基础地址和操作列
3. WHEN 管理员点击"添加供应商"按钮时，THE Dashboard SHALL 显示一个模态表单，包含名称、供应商类型（下拉选择）、基础地址、API Key、模型和备注字段
4. THE Dashboard SHALL 为供应商类型字段提供预定义选项：openai、claude_code、azure_openai、custom
5. WHEN 管理员编辑已有的 AI_Provider 时，THE Dashboard SHALL 预填充当前配置值，api_key 字段显示为空占位符以保护密钥安全
6. WHEN 管理员确认删除一个 AI_Provider 时，THE Dashboard SHALL 弹出确认对话框，确认后执行删除操作
7. THE Dashboard SHALL 在 API_Provider 列表中对 api_key 以脱敏形式展示
8. THE Dashboard SHALL 遵循现有系统的暗黑风格设计，与其他管理页面保持视觉一致性

### 需求 4：自动创建监控端点

**用户故事：** 作为管理员，我希望系统在创建 AI 供应商配置后自动生成对应的监控端点，以便无需手动配置即可开始对 AI 服务进行健康探测。

#### 验收标准

1. WHEN 管理员创建一个新的 AI_Provider 时，THE Provider_Service SHALL 自动创建一个关联的 API_Endpoint 用于健康探测
2. THE Provider_Service SHALL 根据 AI_Provider 的 base_url 和 provider_type 拼接健康检查 URL（如对 openai 类型拼接 /v1/models 路径）
3. THE Provider_Service SHALL 为自动创建的 API_Endpoint 设置请求头，包含 Authorization: Bearer {decrypted_api_key}
4. THE Provider_Service SHALL 为自动创建的 API_Endpoint 设置默认监控频率为 5 分钟
5. THE Provider_Service SHALL 在 API_Endpoint 的名称中标注关联的 AI_Provider 名称，格式为 "[AI] {provider_name}"
6. WHEN 管理员更新 AI_Provider 的 base_url 或 api_key 时，THE Provider_Service SHALL 同步更新关联的 API_Endpoint 配置
7. WHEN 管理员删除一个 AI_Provider 时，THE Provider_Service SHALL 同时删除关联的 API_Endpoint 及其所有监控数据
8. THE AI_Provider SHALL 记录关联的 API_Endpoint 的 ID（endpoint_id），以维护供应商与监控端点的对应关系

### 需求 5：AI 供应商健康状态展示

**用户故事：** 作为管理员，我希望在 AI 供应商列表中直接查看每个供应商的健康状态，以便快速了解 AI 服务的可用性。

#### 验收标准

1. THE Dashboard SHALL 在 AI_Provider 列表中展示每个供应商关联的 API_Endpoint 的当前健康状态（正常/异常/未知）
2. THE Dashboard SHALL 使用与现有系统一致的状态颜色标识：绿色表示正常、红色表示异常、灰色表示未知
3. THE Dashboard SHALL 在 AI_Provider 列表中展示最近一次健康检查的时间
4. WHEN 管理员点击某个 AI_Provider 的状态标识时，THE Dashboard SHALL 跳转到该供应商关联的 API_Endpoint 的详细监控页面

### 需求 6：AI 供应商专属仪表盘

**用户故事：** 作为管理员，我希望有一个专属的 AI 供应商仪表盘页面，以便在一个视图中全面掌握所有 AI 服务的运行状况、响应性能和可用性趋势。

#### 验收标准

1. THE Dashboard SHALL 在侧边栏导航中新增"AI 仪表盘"菜单项，路由路径为 /ai-dashboard，位于"AI 供应商"菜单项之前
2. THE Dashboard SHALL 在 AI 仪表盘顶部展示汇总统计卡片，包含：AI 供应商总数、正常数量、异常数量、未知数量、整体健康率（百分比）
3. THE Dashboard SHALL 在 AI 仪表盘中以卡片网格形式展示每个 AI 供应商的实时状态，每张卡片包含：供应商名称、类型图标/标签、模型名称、当前状态（颜色标识）、最近检查时间、最近一次响应时间（毫秒）
4. THE Dashboard SHALL 在 AI 仪表盘中按供应商类型分组展示卡片（如 OpenAI 组、Claude 组等），每组带有类型标题
5. THE Dashboard SHALL 在 AI 仪表盘中提供一个响应时间趋势对比图表，以折线图形式展示所有 AI 供应商在最近 24 小时内的响应时间变化，每个供应商一条线，使用不同颜色区分
6. THE Dashboard SHALL 在 AI 仪表盘中提供一个可用性时间线，以水平条形图形式展示每个 AI 供应商在最近 24 小时内的可用性状态（绿色=正常、红色=异常、灰色=无数据）
7. THE Dashboard SHALL 每 10 秒自动刷新 AI 仪表盘中的状态数据和统计信息
8. WHEN 管理员点击某个 AI 供应商卡片时，THE Dashboard SHALL 跳转到该供应商关联的 API_Endpoint 的历史记录和统计详情页面
9. THE Dashboard SHALL 在 AI 仪表盘中提供供应商类型筛选器，允许管理员按类型（openai/claude_code/azure_openai/custom/全部）过滤展示的供应商
10. THE Dashboard SHALL 遵循现有系统的暗黑风格设计，AI 仪表盘与系统整体视觉风格保持一致
