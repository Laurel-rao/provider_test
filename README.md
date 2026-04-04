# API Monitor Dashboard

一个用于 API 与 AI Provider 监控的全栈项目，包含：

- `backend/`：FastAPI + SQLAlchemy + Alembic
- `ui/`：React + Vite 新版前端
- `frontend/`：旧版静态前端
- `nginx/`：前端容器配置
- `docker-compose.yml`：本地/远端部署编排
- `update.sh`：部署脚本，支持读取 `.env` 中的部署配置

## 本地开发

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 前端

```bash
cd ui
npm ci
npm run dev
```

## 部署

部署配置写在根目录 `.env` 中的 `DEPLOY_*` 变量里，例如：

```env
DEPLOY_HOST=root@example.com
DEPLOY_REMOTE_DIR=/opt/api_monitor
DEPLOY_BRANCH=main
DEPLOY_GIT_REMOTE_URL=https://github.com/Laurel-rao/provider_test.git
```

执行部署：

```bash
bash update.sh
```

## 常用命令

```bash
npm -C ui run lint
npm -C ui run build
bash -n update.sh
```
