# 实现计划：API 监控管理系统

## 概述

基于 FastAPI + MySQL + 原生前端的全栈 API 监控管理系统。按照后端基础设施 → 数据模型 → 核心服务 → API 路由 → 前端页面 → 容器化部署的顺序逐步实现，确保每一步都可增量验证。

## 任务

- [x] 1. 项目结构与基础配置
  - [x] 1.1 创建项目目录结构和基础配置文件
    - 创建 `backend/`、`frontend/`、`nginx/` 目录结构
    - 创建 `backend/requirements.txt`，包含 fastapi、uvicorn、sqlalchemy、alembic、apscheduler、httpx、python-jose、passlib、cryptography、aiomysql、python-dotenv 等依赖
    - 创建 `.env.example` 文件，定义 DATABASE_URL、JWT_SECRET_KEY、FERNET_KEY 等环境变量模板
    - 创建 `backend/app/config.py`，使用 pydantic-settings 读取环境变量配置
    - _需求: 10.3_

  - [x] 1.2 配置 SQLAlchemy 数据库连接和会话管理
    - 创建 `backend/app/database.py`，配置异步 SQLAlchemy 引擎和 AsyncSession
    - 创建 `get_db` 依赖注入函数
    - _需求: 10.2_

  - [x] 1.3 创建 FastAPI 应用入口
    - 创建 `backend/app/main.py`，初始化 FastAPI 应用实例
    - 配置 CORS 中间件
    - 注册各模块路由
    - 配置应用启动和关闭事件（调度器启停）
    - _需求: 10.1_

- [x] 2. 数据模型与数据库迁移
  - [x] 2.1 创建 SQLAlchemy ORM 模型
    - 创建 `backend/app/models/` 目录
    - 实现 User、APIEndpoint、APIKey、CheckRecord、AlertRule、Alert、ErrorLog 模型
    - 定义表关系、索引（idx_endpoint_checked、idx_logs_filter）和约束
    - _需求: 1.4, 2.3, 3.2, 6.5, 8.3, 9.1, 9.2_

  - [x] 2.2 配置 Alembic 数据库迁移
    - 初始化 Alembic 配置
    - 创建初始迁移脚本，生成所有数据表
    - 在迁移脚本中包含默认管理员用户的种子数据（bcrypt 哈希密码）
    - _需求: 1.4, 10.2_

  - [x] 2.3 创建 Pydantic 请求/响应模型
    - 创建 `backend/app/schemas/` 目录
    - 为每个模块定义请求体和响应体 Schema（LoginRequest、EndpointCreate、EndpointUpdate、KeyCreate、AlertRuleCreate 等）
    - _需求: 1.1, 2.2, 3.1, 8.1_

- [x] 3. 认证模块
  - [x] 3.1 实现 JWT 认证服务
    - 创建 `backend/app/services/auth.py`
    - 实现密码哈希验证（bcrypt）、JWT 令牌生成与验证
    - 创建 `get_current_user` 依赖注入函数，用于路由保护
    - _需求: 1.2, 1.4, 1.6_

  - [x] 3.2 实现认证 API 路由
    - 创建 `backend/app/routers/auth.py`
    - 实现 `POST /api/auth/login` 登录接口，返回 JWT 令牌
    - 实现 `GET /api/auth/me` 获取当前用户信息接口
    - 登录失败返回 401 状态码和错误提示
    - _需求: 1.1, 1.2, 1.3_

  - [x] 3.3 编写认证模块单元测试
    - 测试有效凭据登录返回 JWT
    - 测试无效凭据返回 401
    - 测试 JWT 过期返回 401
    - 测试受保护路由无令牌返回 401
    - _需求: 1.2, 1.3, 1.6_

- [x] 4. 检查点 - 确保认证模块正常工作
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 5. 密钥管理模块
  - [x] 5.1 实现密钥加密服务
    - 创建 `backend/app/services/key_encryptor.py`
    - 实现 KeyEncryptor 类：encrypt、decrypt、mask 方法
    - 使用 Fernet 对称加密，密钥从环境变量读取
    - _需求: 3.2, 3.3_

  - [x] 5.2 实现密钥管理 API 路由
    - 创建 `backend/app/routers/keys.py`
    - 实现 `GET /api/keys` 获取密钥列表（脱敏显示）
    - 实现 `POST /api/keys` 创建密钥（加密存储）
    - 实现 `DELETE /api/keys/{id}` 删除密钥（解除关联端点绑定）
    - _需求: 3.1, 3.2, 3.3, 3.5_

  - [x] 5.3 编写密钥管理模块单元测试
    - 测试加密解密往返一致性
    - 测试脱敏显示格式正确
    - 测试删除密钥后关联端点的 api_key_id 被置空
    - _需求: 3.2, 3.3, 3.5_

- [x] 6. 端点管理模块
  - [x] 6.1 实现端点管理 API 路由
    - 创建 `backend/app/routers/endpoints.py`
    - 实现 CRUD 接口：GET 列表、POST 创建、GET 详情、PUT 更新、DELETE 删除
    - 创建端点时验证 URL 格式
    - 删除端点时同步移除调度器中的检查任务
    - 支持配置监控频率（30s/1m/5m/10m/30m/1h），默认 5 分钟
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3_

  - [x] 6.2 编写端点管理模块单元测试
    - 测试创建端点成功持久化
    - 测试无效 URL 返回校验错误
    - 测试删除端点级联清理
    - _需求: 2.3, 2.4, 2.6_

- [x] 7. 监控调度与健康检查模块
  - [x] 7.1 实现健康检查器
    - 创建 `backend/app/services/health_checker.py`
    - 实现 HealthChecker 类：check 和 check_with_key 方法
    - 使用 httpx 异步发起 HTTP 请求，记录响应时间（毫秒精度）
    - 比对实际状态码与期望状态码判断是否成功
    - 检查失败时记录错误信息到 CheckRecord 和 ErrorLog
    - _需求: 5.1, 7.4, 9.1_

  - [x] 7.2 实现监控调度器
    - 创建 `backend/app/services/monitor_scheduler.py`
    - 实现 MonitorScheduler 类：start、stop、add_endpoint、remove_endpoint、update_interval 方法
    - 使用 APScheduler 管理定时任务
    - 应用启动时为所有活跃端点创建检查任务
    - 端点创建/更新/删除时动态调整调度任务
    - _需求: 4.4, 4.5, 2.6_

  - [x] 7.3 实现监控状态 API 路由
    - 创建 `backend/app/routers/monitor.py`
    - 实现 `GET /api/monitor/status` 获取所有端点当前状态
    - 实现 `GET /api/monitor/status/{endpoint_id}` 获取单个端点状态
    - 实现 `GET /api/monitor/health-rate` 获取整体健康率
    - _需求: 5.1, 5.4_

  - [x] 7.4 编写监控模块单元测试
    - 测试健康检查成功和失败场景
    - 测试调度器添加/移除/更新任务
    - 测试健康率计算
    - _需求: 4.5, 5.4, 7.4_

- [x] 8. 检查点 - 确保核心监控功能正常工作
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 9. 告警模块
  - [x] 9.1 实现告警评估服务
    - 创建 `backend/app/services/alert_evaluator.py`
    - 实现 AlertEvaluator 类：evaluate 方法
    - 支持连续失败次数阈值和响应时间阈值两种规则类型
    - 在每次健康检查完成后调用评估，满足条件时生成告警记录
    - 评估失败时记录错误日志
    - _需求: 8.2, 8.3, 8.6_

  - [x] 9.2 实现告警管理 API 路由
    - 创建 `backend/app/routers/alerts.py`
    - 实现告警规则 CRUD：GET/POST/PUT/DELETE `/api/alerts/rules`
    - 实现告警记录查询：GET `/api/alerts`
    - 实现告警状态更新：PUT `/api/alerts/{id}/status`（未处理/已确认/已解决）
    - _需求: 8.1, 8.4, 8.5_

  - [x] 9.3 编写告警模块单元测试
    - 测试连续失败触发告警
    - 测试响应时间超阈值触发告警
    - 测试告警状态流转
    - _需求: 8.2, 8.3, 8.5_

- [x] 10. 历史记录与统计模块
  - [x] 10.1 实现历史记录 API 路由
    - 创建 `backend/app/routers/records.py`
    - 实现 `GET /api/records` 查询检查记录，支持按端点和时间范围筛选
    - 实现 `GET /api/records/export` 导出 CSV 文件
    - _需求: 6.1, 6.2, 6.4_

  - [x] 10.2 实现统计分析 API 路由
    - 创建 `backend/app/routers/stats.py`
    - 实现 `GET /api/stats/{endpoint_id}` 返回平均、最大、最小、P95 响应时间
    - 实现 `GET /api/stats/{endpoint_id}/histogram` 返回响应时间分布数据
    - 支持按时间范围（1小时/24小时/7天/30天）查询
    - _需求: 7.1, 7.2, 7.3_

  - [x] 10.3 编写历史记录与统计模块单元测试
    - 测试筛选查询返回正确结果
    - 测试 CSV 导出格式正确
    - 测试统计指标计算准确性
    - _需求: 6.1, 6.4, 7.1_

- [x] 11. 错误日志与数据清理模块
  - [x] 11.1 实现错误日志 API 路由
    - 创建 `backend/app/routers/logs.py`
    - 实现 `GET /api/logs` 查询错误日志，支持按时间范围、错误类型、端点筛选
    - 实现分页功能，每页默认 20 条
    - _需求: 9.3, 9.4_

  - [x] 11.2 实现数据清理服务
    - 创建 `backend/app/services/data_cleaner.py`
    - 实现 DataCleaner 类：clean_old_records 和 clean_old_logs 方法
    - 在调度器中注册每日定时清理任务，清理 90 天前的数据
    - _需求: 6.5, 9.5_

  - [x] 11.3 编写错误日志与数据清理模块单元测试
    - 测试日志筛选和分页
    - 测试数据清理正确删除过期记录
    - _需求: 9.3, 9.4, 6.5_

- [x] 12. 检查点 - 确保所有后端 API 正常工作
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 13. 前端 - 登录页与基础框架
  - [x] 13.1 创建前端基础结构和暗黑风格样式
    - 创建 `frontend/index.html` 作为 SPA 入口
    - 创建 `frontend/css/style.css`，实现暗黑风格主题（深色背景、高对比度文字）
    - 创建 `frontend/js/app.js`，实现前端路由（hash 路由）和页面切换逻辑
    - 创建 `frontend/js/api.js`，封装 HTTP 请求工具函数（自动携带 JWT、处理 401 跳转）
    - _需求: 5.5, 1.5_

  - [x] 13.2 实现登录页面
    - 创建 `frontend/js/pages/login.js`
    - 实现用户名密码登录表单
    - 登录成功后存储 JWT 并跳转到仪表盘
    - 登录失败显示错误提示
    - _需求: 1.1, 1.2, 1.3, 1.5_

- [x] 14. 前端 - 仪表盘页面
  - [x] 14.1 实现仪表盘页面
    - 创建 `frontend/js/pages/dashboard.js`
    - 以卡片形式展示所有端点状态（名称、URL、状态、最近检查时间）
    - 使用绿色/红色/灰色表示正常/异常/未知状态
    - 显示整体健康率统计
    - 实现定时轮询（10 秒间隔）自动刷新状态
    - _需求: 5.1, 5.2, 5.3, 5.4_

- [x] 15. 前端 - 端点管理与密钥管理页面
  - [x] 15.1 实现端点管理页面
    - 创建 `frontend/js/pages/endpoints.js`
    - 实现端点列表视图
    - 实现添加/编辑端点表单（URL、方法、请求头、期望状态码、描述、监控频率、关联密钥）
    - 实现 URL 格式前端校验
    - 实现删除确认对话框
    - _需求: 2.1, 2.2, 2.4, 2.5, 2.6, 4.1, 4.2_

  - [x] 15.2 实现密钥管理页面
    - 创建 `frontend/js/pages/keys.js`
    - 实现密钥列表（脱敏显示）
    - 实现创建密钥表单
    - 实现删除密钥确认
    - _需求: 3.1, 3.3_

- [x] 16. 前端 - 历史记录与统计页面
  - [x] 16.1 实现历史记录页面
    - 创建 `frontend/js/pages/records.js`
    - 实现按端点和时间范围筛选的查询表单
    - 实现检查记录表格展示
    - 使用 Chart.js 实现响应时间趋势折线图
    - 实现 CSV 导出按钮
    - _需求: 6.1, 6.2, 6.3, 6.4_

  - [x] 16.2 实现统计分析页面
    - 创建 `frontend/js/pages/stats.js`
    - 展示平均、最大、最小、P95 响应时间指标
    - 支持时间范围切换（1小时/24小时/7天/30天）
    - 使用 Chart.js 实现响应时间分布直方图
    - _需求: 7.1, 7.2, 7.3_

- [x] 17. 前端 - 告警管理与错误日志页面
  - [x] 17.1 实现告警管理页面
    - 创建 `frontend/js/pages/alerts.js`
    - 实现告警规则列表和 CRUD 表单（规则类型、阈值、关联端点）
    - 实现告警记录列表（触发时间、端点、条件、状态）
    - 实现告警状态更新操作（确认/解决）
    - _需求: 8.1, 8.2, 8.4, 8.5_

  - [x] 17.2 实现错误日志页面
    - 创建 `frontend/js/pages/logs.js`
    - 实现按时间范围、错误类型、端点筛选
    - 实现分页表格展示，每页 20 条
    - _需求: 9.3, 9.4_

- [x] 18. 检查点 - 确保前端页面功能完整
  - 确保所有页面可正常渲染和交互，如有问题请向用户确认。

- [x] 19. 容器化部署配置
  - [x] 19.1 创建后端 Dockerfile
    - 创建 `backend/Dockerfile`
    - 基于 Python 3.11 镜像，安装依赖，配置 uvicorn 启动命令
    - _需求: 10.1_

  - [x] 19.2 创建前端 Nginx 配置和 Dockerfile
    - 创建 `nginx/nginx.conf`，配置静态文件服务和 API 反向代理
    - 创建 `nginx/Dockerfile`，基于 nginx:alpine 镜像
    - _需求: 10.1_

  - [x] 19.3 创建 docker-compose.yml
    - 定义 backend、frontend、mysql 三个服务
    - 配置 MySQL 持久化数据卷
    - 配置环境变量引用 .env 文件
    - 配置服务依赖关系和重启策略（restart: always）
    - 配置后端启动时自动执行数据库迁移
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 19.4 编写部署集成测试
    - 验证 docker-compose 配置文件语法正确
    - 验证服务间网络连通性配置
    - _需求: 10.1, 10.2_

- [x] 20. 最终检查点 - 确保所有功能完整
  - 确保所有测试通过，如有问题请向用户确认。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务都引用了对应的需求编号，确保可追溯性
- 检查点任务用于阶段性验证，确保增量开发的正确性
- 单元测试和集成测试作为子任务紧跟实现任务，便于尽早发现问题
