# Maple Driver - 项目交接文档

## 项目当前状态描述/判断

**状态**: 核心云盘API对接已完成，可运行

### 本轮完成的核心工作

1. **夸克网盘驱动重写**: 移除不存在的公开登录API，改用Cookie注入+二维码扫描认证方式（参考AList实现）
2. **115网盘驱动重写**: 同样改用Cookie注入+二维码扫描认证
3. **阿里云盘驱动改进**: 修正API域名(alipan.com→open.alipan.com)，添加biz_type参数，修复refresh_token轮换，支持直接输入refresh_token
4. **百度网盘驱动改进**: 修复access_token查询参数传递，修复dlink下载链接，支持直接输入refresh_token
5. **管理员云服务商配置**: 新建API和UI组件，支持OAuth凭据(Client ID/Secret)全局管理
6. **驱动授权UI**: 新建DriverAuthorizationDialog组件，支持OAuth跳转/Cookie输入/二维码登录三种认证流程
7. **VFS浏览器集成**: 新建vfs.ts模块，实现虚拟路径到真实云盘驱动的映射，支持文件列表浏览
8. **QR登录API**: 新建/api/drivers/[id]/qr-login路由，支持夸克和115的二维码登录流程

### 架构概览
- **前端**: Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui + Framer Motion
- **后端**: Next.js API Routes + Prisma/SQLite + NextAuth.js v4
- **云盘驱动架构**:
  - CloudDriverBase (OAuth驱动基类) → 百度/阿里/OneDrive/Google
  - CookieAuthDriver (Cookie驱动基类) → 夸克/115
  - 两种认证流程: OAuth2跳转 + Cookie注入/QR扫码
- **VFS**: 虚拟文件系统层，将多个云盘挂载点映射为统一路径
- **驱动管理**: 懒加载模式，按需初始化驱动实例

## 当前目标/已完成的修改/验证结果

### 验证结果
- ✅ `bun run lint` 通过（零错误）
- ✅ 开发服务器正常运行
- ✅ 代码已推送到GitHub (commit 5594f91)

### 已完成的模块
| 模块 | 状态 | 说明 |
|------|------|------|
| 夸克网盘驱动 | ✅ | Cookie认证+QR扫码，真实API端点 |
| 115网盘驱动 | ✅ | Cookie认证+QR扫码，真实API端点 |
| 阿里云盘驱动 | ✅ | OAuth2+refresh_token，真实OpenAPI端点 |
| 百度网盘驱动 | ✅ | OAuth2+access_token参数，真实PCS端点 |
| OneDrive驱动 | ✅ | Microsoft Graph API，已实现 |
| Google Drive驱动 | ✅ | Google Drive API v3，已实现 |
| 管理员云服务商配置 | ✅ | API + UI组件 |
| 驱动授权UI | ✅ | OAuth/Cookie/QR三种流程 |
| VFS浏览器 | ✅ | 虚拟路径映射+文件列表浏览 |

## 未解决问题或风险，建议下一阶段优先事项

### 高优先级
1. **OneDrive/Google Drive驱动改进**: 当前使用标准OAuth2，但需要添加healthCheck的实际API调用验证
2. **端到端测试**: 需要用真实OAuth凭据和Cookie测试完整认证流程
3. **文件上传/下载**: 云盘驱动的上传/下载功能需要真实环境测试
4. **Token自动刷新**: 确保token过期时能自动刷新并更新数据库

### 中优先级
5. **跨盘传输引擎**: 框架已搭建，需要真实驱动测试
6. **VFS性能优化**: 大型目录的分页和虚拟滚动
7. **Cookie过期检测**: 定期检查Cookie有效性，提醒用户重新授权
8. **QR码生成优化**: 当前依赖外部URL，可以改为本地生成QR码图片

### 低优先级
9. **暗色模式细节**: 部分新增组件的暗色模式样式需微调
10. **国际化**: 部分新增中文文案需要英文翻译支持
11. **错误恢复**: 网络错误时的自动重试机制

---

## 详细工作记录

### Task ID: 2 - 夸克网盘驱动改进
- 移除假的登录API（/account/login, /account/sms/send, /account/sms/verify）
- 改用Cookie注入+QR码扫描认证
- 新增requestQrCode()和checkQrCodeStatus()方法
- 添加正确的请求头（User-Agent, Referer, Origin）
- 修正listDir排序参数
- 移除phone/password/smsCode配置字段，改为仅cookies

### Task ID: 3 - 115网盘驱动改进
- 移除不可靠的username/password登录
- 改用Cookie注入+QR码扫描认证
- 新增requestQrCode()和checkQrCodeStatus()方法
- 添加115专用请求头
- 修正文件列表API参数（snap=0, natsort=1, format=json）
- 移除username/password配置字段，改为仅cookies

### Task ID: 4-a - 阿里云盘/百度网盘驱动改进
**阿里云盘**:
- API域名更新: openapi.alipan.com → open.alipan.com
- OAuth添加biz_type: "openspace"参数
- 重写refreshAccessToken()，支持refresh_token轮换
- 覆写ensureValidToken()，支持直接输入refresh_token
- 新增getFileInfo()方法
- 新增handleApiError()中文错误处理
- 改进healthCheck()，实际调用getDriveInfo验证token

**百度网盘**:
- 覆写apiRequest()，自动附加access_token查询参数
- 重写refreshAccessToken()，支持grant_type=refresh_token
- 覆写ensureValidToken()，支持直接输入refresh_token
- 修复getDownloadLink()的dlink处理
- 新增getFileInfo()方法
- 新增handleApiError()中文错误处理
- 改进healthCheck()，实际调用用户信息API

### Task ID: 7+8 - 管理员云服务商配置+驱动授权UI
- 新建/api/admin/cloud-providers API路由
- 新建CloudProvidersSection组件
- 新建DriverAuthorizationDialog组件（OAuth/Cookie/QR三种流程）
- 更新admin-drivers-tab.tsx添加云服务商配置
- 更新my-drives-panel.tsx集成授权对话框

### Task ID: 9 - VFS浏览器集成
- 新建/src/lib/vfs.ts模块（之前缺失）
- 实现虚拟路径到驱动实例的映射
- 30秒TTL缓存
- 认证状态检查和友好错误提示
- 更新VFS API路由
- 更新VFS浏览器组件，添加驱动状态徽章和中文名称
