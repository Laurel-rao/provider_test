# 实现计划：AI 供应商管理模块

## 概述

在现有 API 监控管理系统基础上扩展 AI 供应商管理功能。按照数据模型 → 服务层 → API 路由 → 单元测试 → 前端页面 → 系统集成的顺序，逐步实现完整功能。

## 任务

- [x] 1. 数据模型层：AIProvider ORM 模型 + Alembic 迁移 + Pydantic Schema
  - [x] 1.1 创建 AIProvider ORM 模型
    - 创建 `backend/app/models/ai_provider.py`
    - 定义 AIProvider 类，继承 Base，表名 `ai_providers`
    - 字段：id(PK), name(VARCHAR 100), provider_type(VARCHAR 30), base_url(VARCHAR 500), encrypted_api_key(TEXT), masked_key(VARCHAR 30), model(VARCHAR 100), description(VARCHAR 500, nullable), endpoint_id(INT, FK → api_endpoints.id, nullable, unique), created_at, updated_at
    - 外键约束：`endpoint_id REFERENCES api_endpoints(id) ON DELETE SET NULL`
    - 添加与 APIEndpoint 的 relationship（可选反向引用）
    - 更新 `backend/app/models/__init__.py`，导出 AIProvider
    - _需求: 1.1, 1.2, 1.5, 4.8_

  - [x] 1.2 创建 Alembic 数据库迁移脚本
    - 创建 `backend/alembic/versions/002_add_ai_providers.py`
    - 迁移内容：创建 `ai_providers` 表，包含所有字段和外键约束
    - 添加 `endpoint_id` 的唯一索引
    - 编写 downgrade 方法（drop table）
    - _需求: 1.1, 1.2, 1.5, 4.8_

  - [x] 1.3 创建 Pydantic Schema
    - 创建 `backend/app/schemas/ai_provider.py`
    - 定义 AIProviderCreate：name, provider_type, base_url(带 URL 格式校验), api_key, model, description(可选)
    - 定义 AIProviderUpdate：所有字段可选，base_url 带条件格式校验
    - 定义 AIProviderResponse：包含 id, name, provider_type, base_url, masked_key, model, description, endpoint_id, current_status, last_check_at, created_at, updated_at（使用 from_attributes=True）
    - 定义仪表盘 Schema：DashboardSummary, TrendPoint, ProviderTrend, AvailabilitySlot, ProviderAvailability
    - 更新 `backend/app/schemas/__init__.py`，导出新 Schema
    - _需求: 1.1, 1.2, 1.6, 6.2, 6.3, 6.5, 6.6_

- [x] 2. 供应商服务层：AIProviderService
  - [x] 2.1 实现 AIProviderService 核心 CRUD 方法
    - 创建 `backend/app/services/ai_provider_service.py`
    - 实现 `list_providers()`：查询所有 AIProvider，关联加载 endpoint 获取 current_status 和 last_check_at
    - 实现 `get_provider(provider_id)`：查询单个供应商，不存在抛出 404
    - 实现 `create_provider(data)`：加密 api_key、生成 masked_key、拼接健康检查 URL、创建关联 API_Endpoint（名称格式 `[AI] {name}`，监控频率 300 秒）、注册到 MonitorScheduler、保存 endpoint_id
    - 实现 `update_provider(provider_id, data)`：未提供 api_key 时保留原值；base_url 或 api_key 变更时同步更新关联 API_Endpoint 的 url 和 headers_json
    - 实现 `delete_provider(provider_id)`：从 MonitorScheduler 移除任务、删除关联 API_Endpoint（级联删除 CheckRecord 等）、删除 AIProvider
    - 复用现有 `key_encryptor` 单例进行加密/解密/脱敏
    - _需求: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 4.1, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 2.2 实现 URL 映射和请求头构建方法
    - 在 AIProviderService 中实现 `build_health_url(provider_type, base_url)`
    - URL 映射规则：openai → `/v1/models`，claude_code → `/v1/models`，azure_openai → `/openai/models?api-version=2024-02-01`，custom → 直接使用 base_url
    - 处理 base_url 末尾斜杠的情况
    - 实现 `build_headers(provider_type, decrypted_key)`
    - 请求头规则：openai/azure_openai/custom → `Authorization: Bearer {key}`，claude_code → `x-api-key: {key}`
    - 返回 JSON 字符串格式（与 APIEndpoint.headers_json 兼容）
    - _需求: 4.2, 4.3_

  - [x] 2.3 实现仪表盘聚合查询方法
    - 在 AIProviderService 中实现 `get_dashboard_summary()`：统计总数、正常/异常/未知数量、健康率
    - 实现 `get_response_trend(provider_type=None)`：查询最近 24h 各供应商关联端点的 CheckRecord，按小时聚合平均响应时间
    - 实现 `get_availability_timeline(provider_type=None)`：查询最近 24h 各供应商关联端点的 CheckRecord，按小时聚合可用性状态
    - 支持按 provider_type 筛选
    - _需求: 6.2, 6.3, 6.5, 6.6, 6.9_

- [x] 3. API 路由层
  - [x] 3.1 实现 AI 供应商 CRUD 路由
    - 创建 `backend/app/routers/ai_providers.py`
    - 实现 `GET /` → 列表（返回 List[AIProviderResponse]）
    - 实现 `POST /` → 创建（返回 AIProviderResponse，状态码 201）
    - 实现 `GET /{provider_id}` → 详情
    - 实现 `PUT /{provider_id}` → 更新
    - 实现 `DELETE /{provider_id}` → 删除（状态码 204）
    - 所有路由使用 `Depends(get_current_user)` 进行认证保护
    - 使用 `Depends(get_db)` 注入数据库会话
    - 在路由中实例化 AIProviderService 并调用对应方法
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.2 实现 AI 仪表盘聚合 API 路由
    - 在 `backend/app/routers/ai_providers.py` 中添加仪表盘子路由
    - 实现 `GET /dashboard/summary` → 返回 DashboardSummary
    - 实现 `GET /dashboard/response-trend?provider_type=xxx` → 返回 List[ProviderTrend]
    - 实现 `GET /dashboard/availability?provider_type=xxx` → 返回 List[ProviderAvailability]
    - 所有路由使用认证保护
    - _需求: 6.2, 6.3, 6.5, 6.6, 6.9_

- [x] 4. 检查点 - 后端功能验证
  - 确保所有后端代码无语法错误，模块导入正常
  - 确保所有测试通过，如有问题请询问用户

- [ ] 5. 单元测试
  - [ ]* 5.1 编写 AIProviderService 服务层单元测试
    - 创建 `backend/tests/test_ai_provider_service.py`
    - 测试 `build_health_url()` 各类型映射（openai, claude_code, azure_openai, custom）
    - 测试 `build_headers()` 各类型请求头构建
    - 测试创建供应商时自动创建端点的完整流程（mock db）
    - 测试更新供应商时同步更新端点（mock db）
    - 测试删除供应商时级联删除端点（mock db）
    - 测试更新时不提供 api_key 保留原值
    - _需求: 1.3, 1.4, 2.8, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

  - [ ]* 5.2 编写 AI 供应商 API 路由单元测试
    - 创建 `backend/tests/test_ai_provider_routes.py`
    - 测试 CRUD 各接口正常流程（mock AIProviderService）
    - 测试未认证访问返回 401
    - 测试请求不存在的供应商返回 404
    - 测试 base_url 格式校验返回 422
    - 测试仪表盘聚合 API 数据正确性
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.2_

  - [ ]* 5.3 编写属性测试：API Key 加密解密往返一致性
    - 在 `backend/tests/test_ai_provider_service.py` 中添加
    - **Property 1: API Key 加密解密往返一致性**
    - 使用 hypothesis 生成任意有效字符串，验证 encrypt → decrypt 往返一致
    - **验证: 需求 1.3**

  - [ ]* 5.4 编写属性测试：API Key 脱敏保留部分可见字符
    - 在 `backend/tests/test_ai_provider_service.py` 中添加
    - **Property 2: API Key 脱敏保留部分可见字符**
    - 使用 hypothesis 生成任意非空字符串，验证 mask() 输出包含 `****`，且保留的可见字符与原始字符串对应位置一致
    - **验证: 需求 1.4**

  - [ ]* 5.5 编写属性测试：输入校验正确拒绝无效数据
    - 在 `backend/tests/test_ai_provider_service.py` 中添加
    - **Property 3: 输入校验正确拒绝无效数据**
    - 使用 hypothesis 生成各种 base_url 字符串，验证不以 http:// 或 https:// 开头时 AIProviderCreate 校验失败
    - **验证: 需求 1.1, 1.6**

  - [ ]* 5.6 编写属性测试：健康检查 URL 映射正确性
    - 在 `backend/tests/test_ai_provider_service.py` 中添加
    - **Property 5: 健康检查 URL 映射正确性**
    - 使用 hypothesis 生成有效的 (provider_type, base_url) 组合，验证 build_health_url 返回值符合映射规则
    - **验证: 需求 4.2**

  - [ ]* 5.7 编写属性测试：请求头按供应商类型正确构建
    - 在 `backend/tests/test_ai_provider_service.py` 中添加
    - **Property 6: 请求头按供应商类型正确构建**
    - 使用 hypothesis 生成有效的 (provider_type, api_key) 组合，验证 build_headers 返回正确的认证头
    - **验证: 需求 4.3**

  - [ ]* 5.8 编写属性测试：仪表盘汇总统计正确性
    - 创建 `backend/tests/test_ai_dashboard.py`
    - **Property 10: 仪表盘汇总统计正确性**
    - 使用 hypothesis 生成任意 (healthy, unhealthy, unknown) 计数组合，验证 total = healthy + unhealthy + unknown，health_rate = healthy / total
    - **验证: 需求 6.2**

  - [ ]* 5.9 编写属性测试：供应商按类型分组与筛选正确性
    - 在 `backend/tests/test_ai_dashboard.py` 中添加
    - **Property 11: 供应商按类型分组与筛选正确性**
    - 使用 hypothesis 生成供应商列表和筛选条件，验证分组后每组 provider_type 一致，筛选结果仅包含匹配类型
    - **验证: 需求 6.4, 6.9**

- [ ] 6. 检查点 - 后端测试验证
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 前端 AI 供应商管理页面
  - [x] 7.1 创建 AI 供应商管理页面
    - 创建 `frontend/js/pages/ai-providers.js`
    - 实现 `renderAIProviders()` 函数：返回页面 HTML，包含标题、"添加供应商"按钮、供应商列表表格
    - 表格列：名称、类型、模型、基础地址、API Key（脱敏）、状态（颜色标识）、最近检查时间、操作（编辑/删除）
    - 实现 `initAIProviders()` 函数：调用 `GET /api/ai-providers` 加载数据并渲染表格
    - 状态列使用与现有系统一致的颜色标识（绿色=正常、红色=异常、灰色=未知）
    - 点击状态标识跳转到关联端点的详细监控页面
    - _需求: 3.1, 3.2, 3.7, 3.8, 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 实现添加/编辑供应商模态表单
    - 在 `frontend/js/pages/ai-providers.js` 中实现模态表单
    - 表单字段：名称、供应商类型（下拉选择：openai/claude_code/azure_openai/custom）、基础地址、API Key、模型、备注
    - 添加模式：所有字段为空
    - 编辑模式：预填充当前值，api_key 字段显示为空占位符（placeholder 提示"留空则保留原密钥"）
    - 客户端校验：必填字段、base_url 格式
    - 提交后调用 POST 或 PUT API，成功后刷新列表
    - _需求: 3.3, 3.4, 3.5_

  - [x] 7.3 实现删除确认功能
    - 在 `frontend/js/pages/ai-providers.js` 中实现删除功能
    - 点击删除按钮弹出确认对话框
    - 确认后调用 `DELETE /api/ai-providers/{id}`
    - 删除成功后刷新列表
    - _需求: 3.6_

- [x] 8. 前端 AI 仪表盘页面
  - [x] 8.1 创建 AI 仪表盘页面 - 汇总统计和供应商卡片
    - 创建 `frontend/js/pages/ai-dashboard.js`
    - 实现 `renderAIDashboard()` 函数：返回页面 HTML 骨架
    - 实现 `initAIDashboard()` 函数：
      - 调用 `GET /api/ai-providers/dashboard/summary` 渲染顶部汇总统计卡片（总数、正常、异常、未知、健康率）
      - 调用 `GET /api/ai-providers` 获取供应商列表，按 provider_type 分组渲染卡片网格
      - 每张卡片包含：供应商名称、类型标签、模型名称、状态颜色标识、最近检查时间、最近响应时间
      - 点击卡片跳转到关联端点的历史记录和统计详情页面
    - 实现类型筛选器（下拉选择：全部/openai/claude_code/azure_openai/custom）
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.8, 6.9, 6.10_

  - [x] 8.2 实现响应时间趋势图表和可用性时间线
    - 在 `frontend/js/pages/ai-dashboard.js` 中添加图表
    - 调用 `GET /api/ai-providers/dashboard/response-trend` 渲染折线图（Chart.js）
    - 每个供应商一条线，使用不同颜色区分，X 轴为时间（最近 24h），Y 轴为响应时间（ms）
    - 调用 `GET /api/ai-providers/dashboard/availability` 渲染水平条形图
    - 每个供应商一行，颜色编码：绿色=正常、红色=异常、灰色=无数据
    - _需求: 6.5, 6.6_

  - [x] 8.3 实现自动刷新和页面销毁
    - 在 `frontend/js/pages/ai-dashboard.js` 中实现 10 秒自动刷新
    - 使用 setInterval 定时刷新汇总统计和供应商卡片数据
    - 实现 `destroyAIDashboard()` 函数：清除定时器、销毁 Chart.js 实例
    - _需求: 6.7_

- [x] 9. 系统集成
  - [x] 9.1 注册后端路由
    - 更新 `backend/app/main.py`
    - 添加 `from app.routers import ai_providers`
    - 注册路由：`app.include_router(ai_providers.router, prefix="/api/ai-providers", tags=["ai-providers"])`
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 9.2 更新前端导航和路由
    - 更新 `frontend/index.html`：在侧边栏"仪表盘"链接之后添加"AI 仪表盘"和"AI 供应商"导航链接
    - 添加 `<script>` 标签引入 `js/pages/ai-dashboard.js` 和 `js/pages/ai-providers.js`
    - 更新 `frontend/js/app.js`：在 routes 对象中注册 `/ai-dashboard` 和 `/ai-providers` 路由
    - `/ai-dashboard` 路由需包含 destroy 函数以清理定时器和图表
    - _需求: 3.1, 6.1_

- [x] 10. 最终检查点 - 全功能验证
  - 确保所有后端代码无语法错误，模块导入正常
  - 确保所有测试通过
  - 如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了对应的需求编号，确保需求可追溯
- 检查点任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证设计文档中定义的正确性属性
- 单元测试和属性测试互为补充
