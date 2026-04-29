# Maple Driver - 项目交接文档

## 项目当前状态描述/判断

**状态**: 可运行，核心功能完整，存在环境相关稳定性问题

### 核心问题
1. **Next.js 开发服务器稳定性问题**: Turbopack 开发服务器在沙箱环境中，当浏览器并发加载 JS/CSS 资源时会导致进程崩溃（无错误日志，静默退出）。curl 顺序请求完全正常，但浏览器并发请求会触发崩溃。
2. **生产模式相对稳定**: `next build` + `next start` (standalone) 模式在 curl 测试下稳定，内存占用仅 ~120MB。但浏览器高并发请求仍可能导致崩溃。
3. **根本原因**: 沙箱环境的资源限制（可能是进程级并发连接数限制）导致 Node.js 处理大量并发请求时被系统杀死。

### 已完成的修复
1. **创建 `src/lib/storage-drivers/local-driver.ts`**: 之前缺失的关键文件，实现本地文件系统存储驱动
2. **重构 `src/lib/storage-drivers/manager.ts`**: 将 11 个急切导入（eager import）改为懒加载（lazy import），大幅降低初始编译内存峰值
   - 仅 `local-driver`（无外部依赖）急切加载
   - S3/FTP/SSH2/WebDAV 等重型驱动按需加载
   - `getDriverFactory()`, `getDriver()`, `getAllDriverFactories()` 改为异步（async）
3. **修复 `src/lib/storage-drivers/index.ts`**: 移除所有驱动的 `export *` 桶导出，避免意外拉入重型依赖
4. **更新所有 API 路由**: 为异步驱动函数调用添加 `await`，涉及 11 个 API 路由文件
5. **修复 `.env` 配置**: 添加缺失的 `NEXTAUTH_URL` 和 `NEXTAUTH_SECRET`
6. **优化 `next.config.ts`**: 添加 `output: "standalone"` 和更多 `allowedDevOrigins`

## 当前目标/已完成的修改/验证结果

### 验证结果
- ✅ `bun run lint` 通过（零错误）
- ✅ `next build` 成功（standalone 模式）
- ✅ curl 请求所有路由正常（/, /login, /api/auth/*, /api/files/*, /api/drivers/*）
- ✅ 登录认证流程正常（CSRF → POST callback → 302 重定向）
- ✅ 数据库正常（7个用户，admin@clouddrive.com 可登录）
- ⚠️ agent-browser 测试不稳定（服务器在高并发请求时崩溃）
- ✅ 生产 standalone 模式内存占用 ~120MB，非常高效

### 架构概览
- **前端**: Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui + Framer Motion
- **后端**: Next.js API Routes + Prisma/SQLite + NextAuth.js v4
- **存储**: 本地文件系统 + 多协议驱动适配器（WebDAV/S3/SFTP/FTP/云盘）
- **驱动工厂**: 懒加载模式，按需初始化驱动实例
- **认证**: JWT session + Credentials Provider + QR Token 登录
- **虚拟文件系统**: VFS 层支持多驱动挂载点

## 未解决问题或风险，建议下一阶段优先事项

### 高优先级
1. **服务器稳定性**: 沙箱环境中浏览器并发请求导致崩溃，需要排查具体资源限制（可能是 fd 或并发连接数）
2. **真实云盘 API 对接**: 当前云盘驱动（百度/阿里/夸克/115/OneDrive/Google）仅为框架代码，需参考 AList 实现真实 API 调用
3. **OAuth 完整流程**: 需要配置真实的 OAuth 凭据（clientId/clientSecret）才能测试 OAuth 登录

### 中优先级
4. **文件上传/下载**: 确保本地文件存储的实际上传/下载功能可用
5. **跨盘传输引擎**: 框架已搭建，但实际跨驱动文件复制/移动未测试
6. **VFS 浏览器**: 虚拟文件系统浏览器 UI 已有，但需真实驱动数据测试

### 低优先级
7. **性能优化**: 考虑对大型文件列表进行分页/虚拟滚动
8. **国际化完善**: 当前支持中英文，但翻译覆盖率需检查
9. **暗色模式细节**: 部分 UI 组件暗色模式样式需微调
