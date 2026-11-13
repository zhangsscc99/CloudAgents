# CloudAgents

CloudAgents 是一个自托管的、类似 Cursor Cloud Agents 的 Web 应用。它直接封装本机 `codex` CLI，在浏览器中编排 Codex 任务、查看实时 JSONL 执行轨迹、继续已有 Codex session，并按 cron 计划自动运行仓库任务。

整个应用使用 JavaScript：Fastify 后端、React 18 + Vite 前端、better-sqlite3 持久化、croner 定时调度。生产模式只监听一个端口，由 Fastify 同时提供 API、SSE 和构建后的前端资源。

## 功能

- 从 `/www` 与 `/root` 自动发现服务器上的项目目录。
- 创建手动 Agent run，选择目录、模型、reasoning effort、sandbox bypass 与非 Git 目录选项。
- 通过 JSONL 实时解析 Codex 输出，工具调用、消息、命令输出、文件改动和错误全部写入 SQLite。
- 浏览器通过 SSE 接收实时执行事件。
- 捕获 Codex session ID，支持 `codex exec resume` 继续会话。
- 停止按钮会终止整个 codex 进程组，并向子进程发送 `SIGKILL` 兜底。
- Automation CRUD、启用/暂停、多个触发器、手动运行、运行历史和统计。
- Cron 触发器支持标准 5 段表达式，也支持带秒的 6 段表达式、时区与未来运行时间预览。
- 调度器不补跑。服务器停机期间错过的触发时间会直接跳过，避免堆积。
- 自动化因禁用或已有运行而无法启动时，会记录一条 `skipped` run。
- 可选的 Memories 文本会附加到每次自动运行的 prompt。
- 可选的 Push branch 工具会在成功运行后执行 `git push`，并记录命令结果。

## 快速启动

环境要求：

- Node.js 20 或更新版本
- 已经安装并完成认证的本机 `codex` CLI
- 如需使用 SQLite 原生模块，Linux 环境应能正常构建/加载 `better-sqlite3`

安装并启动：

```bash
npm install
npm start
```

`npm start` 会先重新构建前端，再启动服务：

```text
http://0.0.0.0:9100
```

浏览器打开 `http://<服务器地址>:9100`。数据库首次启动时自动创建在：

```text
data/cloudagents.db
```

### 开发模式

```bash
npm run dev
```

开发模式并行运行：

- Fastify：`127.0.0.1:9100`
- Vite：`127.0.0.1:5173`
- Vite 会把 `/api` 请求代理到 Fastify，SSE 也通过同一代理转发。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `9100` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `LOG_LEVEL` | `info` | Fastify 日志级别 |
| `NODE_ENV` | 未设置 | 设为 `production` 时使用结构化日志 |

## 架构

```text
Browser (React)
   │
   ├── REST API ─────────────┐
   └── SSE event stream ─────┤
                             ▼
                       Fastify :9100
                         │       │
             better-sqlite3     Croner
                SQLite              │
                                   ▼
                            Automation run
                                   │
                                   ▼
                    spawn: codex exec --json
                      stdout JSONL parser
                                   │
                                   ▼
                    run_events + SSE fan-out
```

### 关键目录

```text
server/
  index.js          Fastify API、SSE、SPA fallback
  db.js             SQLite schema 与行映射
  repos.js          /www、/root 目录发现与路径校验
  run-manager.js    Codex 进程、JSONL、session、停止与工具执行
  scheduler.js      Croner 调度与 automation run 创建
  config.js         模型、effort、时区与默认配置
web/
  src/pages/        Agents、New Agent、Runs、Run Detail、Automations
  src/components/   Shell、表单基础组件、实时事件时间线
  src/styles.css    响应式深色界面与动效
data/
  cloudagents.db    SQLite 数据库（运行时生成）
```

### Codex 调用

普通 run：

```bash
codex exec --json \
  --dangerously-bypass-approvals-and-sandbox \
  -C /path/to/repo \
  -m deepseek-flash \
  -c model_reasoning_effort="low" \
  "任务说明"
```

Follow-up：

```bash
codex exec --json \
  --dangerously-bypass-approvals-and-sandbox \
  -C /path/to/repo \
  -m deepseek-flash \
  -c model_reasoning_effort="low" \
  resume <session-id> "继续说明"
```

进程启动时会确保 PATH 中包含：

```text
/root/.nvm/versions/node/v24.5.0/bin
```

每一行 stdout 都会尝试按 JSON 解析并写入 `run_events`。无法解析的行以 `codex.stdout` 保存；stderr 以 `codex.stderr` 保存。session ID 从 `thread_id`、`session_id` 或 `conversation_id` 自动提取。

### 状态

| 状态 | 含义 |
| --- | --- |
| `queued` | 已创建，进程尚未启动 |
| `running` | codex 正在执行 |
| `succeeded` | codex 退出码为 0，且启用的 post-run 工具成功 |
| `failed` | 启动失败、非零退出码或 post-run 工具失败 |
| `stopped` | 用户主动停止 |
| `skipped` | automation 已禁用，或同一 automation 已有活动 run |

服务器重启时，遗留的 `queued`/`running` run 会被标记为 `failed`，避免出现永久挂起状态。

## Cron 语法

Cron 使用 `croner` 的表达式解析器。

标准 5 段格式：

```text
分钟 小时 日 月 星期
```

带秒的 6 段格式：

```text
秒 分钟 小时 日 月 星期
```

示例：

| 表达式 | 含义 |
| --- | --- |
| `*/10 * * * *` | 每 10 分钟 |
| `0 * * * *` | 每小时整点 |
| `0 9 * * *` | 每天 09:00 |
| `0 9 * * 1` | 每周一 09:00 |
| `*/30 * * * * *` | 每 30 秒 |
| `15 8 * * 1-5` | 工作日 08:15 |

每个 cron trigger 都有独立 timezone。编辑器会调用预览 API，显示人类可读描述、校验结果与接下来 5 次运行时间。

调度策略：

1. 服务启动时，为所有已启用 automation 的 cron trigger 注册 Croner job。
2. 触发时检查 automation 是否仍启用。
3. 如果同 automation 已有 `queued` 或 `running` run，则创建 `skipped` 记录。
4. 否则创建 run，并立即启动 codex。
5. 不扫描历史错过时间，因此服务器重启后不会补跑。

## API

### 系统与仓库

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查与活动 run 数 |
| `GET` | `/api/config` | 模型、effort、时区、cron presets |
| `GET` | `/api/repos` | 发现 `/www`、`/root` 下的目录 |
| `GET` | `/api/agents` | 仓库摘要、最近 run、全局计数 |
| `GET` | `/api/overview` | 全局 run 与 automation 统计 |

### Runs

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/runs` | 创建并启动手动 Codex run |
| `GET` | `/api/runs` | run 列表，支持 `status`、`q`、`repo_dir`、`automation_id`、`limit` |
| `GET` | `/api/runs/:id` | run 详情 |
| `GET` | `/api/runs/:id/events` | 已持久化事件，支持 `after` |
| `GET` | `/api/runs/:id/events/stream` | SSE 实时事件流 |
| `POST` | `/api/runs/:id/follow-up` | 恢复 Codex session |
| `POST` | `/api/runs/:id/stop` | 终止 run 进程树 |

创建 run 示例：

```bash
curl -X POST http://127.0.0.1:9100/api/runs \
  -H 'content-type: application/json' \
  -d '{
    "repoDir": "/www/my-app",
    "prompt": "Run the tests and fix any failures.",
    "model": "deepseek-flash",
    "effort": "high",
    "bypassSandbox": true,
    "skipGitRepoCheck": false
  }'
```

### Automations

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/automations` | 全部 automation，含 triggers、next run、stats |
| `POST` | `/api/automations` | 创建 automation |
| `GET` | `/api/automations/:id` | automation 详情 |
| `PUT` | `/api/automations/:id` | 更新 automation 与全部 triggers |
| `DELETE` | `/api/automations/:id` | 删除 automation |
| `POST` | `/api/automations/:id/run` | 立即运行 |
| `GET` | `/api/automations/:id/runs` | 运行历史与 24h/7d 统计 |
| `GET` | `/api/cron/preview` | cron 校验、描述与未来运行时间 |

创建 automation 示例：

```bash
curl -X POST http://127.0.0.1:9100/api/automations \
  -H 'content-type: application/json' \
  -d '{
    "name": "Nightly quality pass",
    "repoDir": "/www/my-app",
    "instructions": "Run tests, fix regressions, and summarize the result.",
    "model": "deepseek-flash",
    "effort": "high",
    "enabled": true,
    "tool_push_branch": false,
    "memories_enabled": true,
    "memory_notes": "Use the staging test environment.",
    "triggers": [
      {
        "type": "cron",
        "expression": "0 2 * * *",
        "timezone": "Asia/Shanghai",
        "enabled": true
      },
      {
        "type": "manual",
        "timezone": "Asia/Shanghai",
        "enabled": true
      }
    ]
  }'
```

## Tools 与 Memories

### Push branch

界面中标记为 “Open Pull Request”，实际实现保持简单：成功 run 结束后在仓库目录执行：

```bash
git push
```

设置了 `GIT_TERMINAL_PROMPT=0`，不会在服务进程中等待交互式认证。命令超时为 30 秒。如果 push 失败，本次 automation run 标记为 `failed`。

### Memories

开启 Memories 后，automation 的 Persistent context 会附加在 instructions 后面。它不是跨运行自动学习的向量记忆，而是由用户维护、每次自动运行都会注入的稳定上下文。这样实现可预测、容易审计。

## 部署

最简部署：

```bash
cd /www/CloudAgents
npm install
npm start
```

使用 systemd 的示例：

```ini
[Unit]
Description=CloudAgents
After=network.target

[Service]
Type=simple
WorkingDirectory=/www/CloudAgents
Environment=NODE_ENV=production
ExecStart=/root/.nvm/versions/node/v24.5.0/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

可选的 Nginx 配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:9100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

SSE 响应已设置 `X-Accel-Buffering: no`。如果外层反向代理有额外缓冲，需要为该路由关闭 buffering。

## 安全说明

此应用按“可信的本地控制台”设计，没有内置登录与权限系统。请勿直接把 `:9100` 暴露到不可信公网。

- Codex 默认使用 `--dangerously-bypass-approvals-and-sandbox`，命令可读写主机资源，风险极高。
- 仓库路径被限制在 `/www` 或 `/root` 下，并通过真实路径校验。
- 如果必须公网访问，请在前面增加认证、TLS、访问控制和网络隔离。
- API 能启动 codex、执行 `git push` 和终止进程，应视为高权限管理接口。

## 验证

```bash
npm run build
npm start

curl http://127.0.0.1:9100/api/health
curl 'http://127.0.0.1:9100/api/cron/preview?expression=*/10%20*%20*%20*%20*&timezone=UTC'
```

本项目未执行 `git commit` 或 `git push`。
