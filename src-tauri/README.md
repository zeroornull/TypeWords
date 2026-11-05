# TypeWords Windows 桌面开发与本地预览

更新：2026-11-05。本文是当前 Tauri 桌面的开发入口与唯一验收状态来源；历史迁移日志不再承担执行指令。桌面复用 Nuxt/Vue、Pinia、IndexedDB 与 ZIP 格式，由 Tauri 2 内嵌静态 SPA，生产运行不需要 Node.js 或常驻 Nuxt 服务。

## 当前范围

D10（2026-11-05）确定交付未签名 Windows x64 本地预览：开发机安装、随包单词/文章练习、切换设置后继续、正常重启保留数据、原生保存 ZIP、拒绝损坏 ZIP 且原数据不变、白名单外链进入系统浏览器、未授权访问被拒绝。桌面云同步按 D09 关闭，旧配置保留但不得触发请求。

这条交付线适用于 `src-tauri/`，实验性 `desktop-native/` Go 窗口是另一条开发线。当前预览不等于正式公开发布。使用前先导出备份，不要将唯一真实学习数据放入测试 profile；测试使用隔离 profile 与合成数据。

## 环境与应用身份

- 构建环境：Windows x64、Node 24、pnpm、Rust MSVC、C++ Build Tools；运行需要 WebView2。
- 本机验收系统为 Windows 11；Windows 10 22H2 是兼容目标，尚无本轮实机通过结论。
- 应用版本 `0.1.3`，identifier 为 `io.github.zyronon.typewords`。
- 生产来源 `http://tauri.localhost`，`useHttpsScheme: false`；正式配置不指定自定义 `dataDirectory`。
- 开发来源 `http://127.0.0.1:5567` 与生产存储分离。使用 ZIP 迁移，不能以开发数据未出现在生产窗口判断持久化失败。

## 开发与构建

从仓库根目录的 Windows shell 执行。依赖须由本机 pnpm 安装，不能复用 WSL 的 Linux 原生依赖。

```powershell
pnpm install --frozen-lockfile
pnpm run desktop:dev
```

`desktop:dev` 是长驻交互服务，自动启动桌面前端。Web 开发仍使用 `pnpm run dev`。

提交候选前使用现有本地门禁：

```powershell
pnpm run test
pnpm run typecheck
pnpm run desktop:check-resources
node node_modules/prettier/bin/prettier.cjs --check src-tauri/README.md AGENTS.md
```

格式命令的明确文件列表应随实际改动调整。没有 `pnpm lint`。独立真实 IndexedDB 测试入口为 `pnpm run test:desktop:idb`，需要外部可解析的 Playwright 与 Edge；它与默认 Node 回归、原生 WebView 验收分别报告。

Web 与 Desktop 共用 `.nuxt` / `.output`，构建必须串行：

```powershell
pnpm run generate
pnpm run desktop:bundle:internal
```

`desktop:bundle:internal` 使用 Windows 原生工具链，重建桌面静态资源、运行资源审计并生成未签名 NSIS。只需 EXE 时使用 `pnpm run desktop:build`。输出路径以实际日志为准；显式 target 构建通常位于 `src-tauri/target/x86_64-pc-windows-msvc/release/`。

Rust 检查可单独执行，列出命令不表示最新候选已逐项重跑：

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## 安装与数据保护

安装/升级走仓库包装脚本，先正常退出正在运行的 TypeWords。NSIS 按进程名关闭宿主，另选安装目录也不能保留另一个运行中的实例。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-setup.ps1 -Setup "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TypeWords_0.1.3_x64-setup.exe" -Dest "$env:LOCALAPPDATA\Programs\TypeWords-preview"
```

`-Dest` 应选择明确的预览安装目录；安装目录与 WebView 数据 profile 是不同概念。包装脚本根据登记的 `DisplayVersion` 拒跑旧安装包；直接调用旧 NSIS 仍可能覆盖较新版本。需要快捷方式时显式加 `-WithShortcuts`。

安装包为 `currentUser`，WebView2 策略是 `downloadBootstrapper`，不是完整离线运行时安装包。开发机已有 WebView2 的安装成功不证明缺运行时或干净机可安装。不要删除默认 identifier 数据目录来“修复”验收失败。

原生保存取消或写入失败不得报告成功；损坏 ZIP 必须在写入前拒绝并保留原数据。

## 当前验收状态

**D10 本地预览：10 / 10，已完成本轮验收。** 状态按本轮已安装候选的实际证据更新；正式公开发布仍未完成，完整发布矩阵不作为本轮退出条件。

| ID    | D10 验收内容                  | 状态   | 已观察到的结果                                                                           |
| ----- | ----------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| P0-01 | 平台、架构与应用身份          | 已完成 | Windows x64；固定 identifier 与生产来源                                                  |
| P0-02 | 本地类型与基线                | 已完成 | 执行方报告 typecheck exit 0；日志无 TS 错误输出                                          |
| P0-03 | 可运行的本地回归              | 已完成 | 815/815；失败、跳过、取消均为 0                                                          |
| P1-01 | 串行 Web/Desktop 构建         | 已完成 | Web generate 与内部桌面打包 exit 0                                                       |
| P1-02 | 资源审计与随包内容            | 已完成 | 审计无错误；实际加载 CET4 2607 词、NCE1 5 篇                                             |
| P2-01 | 已安装生产宿主                | 已完成 | 安装 exit 0，版本 0.1.3；隔离 profile 下运行于 tauri.localhost                           |
| P2-02 | 练习、设置与正常重启持久化    | 已完成 | 随包 20 词/NCE1 5 句及设置切换；重启前后 IndexedDB 与内存状态一致                        |
| P3-01 | 原生保存、拒坏 ZIP 与数据保护 | 已完成 | 真实原生 ZIP 保存与 CRC/内容校验通过；损坏 ZIP 被拒绝，五键及内存状态不变                |
| P3-02 | 外链、最小权限与云同步关闭    | 已完成 | GitHub 外链进入系统 Chrome；主窗口保持本地；ACL 拒绝未授权访问；同步标签关闭且无同步请求 |
| P4-01 | 未签名 NSIS 开发机安装        | 已完成 | 当前安装包安装与启动成功，安装产物哈希已关联                                             |

P2-02 的重启报告记录 PID 变化后 CET4 `lastLearnIndex=20`、错词数 34、音量 37 的内存与持久化值相同；旧同步配置仍存在但无同步请求。P3-02 的安全报告记录 9 类未授权 IPC 被拒绝、远程导航和新窗口未取代本地主文档。本机 HTTP 导航探测收到一次请求，因此不声称“零网络请求”。

本轮修复了直接练习路由加载官方内容后被清空的问题：`changeDict` / `changeBook` 释放其他官方数组时跳过传入的同一对象。reactive store 行为回归覆盖选中内容、进度/统计、自定义数据保留及其他官方数据释放。收藏选择器的词书 ID 同时规范为字符串；原生练习 runner 以实际 DOM 转换推进，并禁止自定义文章回退代替 NCE1。

## 当前候选与证据索引

以下链接是本地验收产物，位于 Git 忽略的 `docs/plans/evidence/tauri2-install-lifecycle/`，干净检出不会带这些日志、报告或二进制。上表保留观察结论；重新验收应生成新报告，不能把缺失本地报告视为可重放证据。

- [构建与安装包身份](../docs/plans/evidence/tauri2-install-lifecycle/build-114.json)：`TypeWords_0.1.3_x64-setup.exe`，11,736,670 字节，SHA256 `92dc9f8812571535c85e8eb8f53c8cfbf80a739ec5b9293ae1052248a3a3aa30`。
- [实际安装 EXE 身份](../docs/plans/evidence/tauri2-install-lifecycle/installed-exe-114.json)：20,149,248 字节，SHA256 `fce567bc14917a389def7697dfef3cd7c14f6e48e5636635ac0cdcc127434399`。NSIS 元数据修补可使安装 EXE 与打包前 EXE 不同，原生报告绑定实际安装哈希。
- [本轮汇总与边界](../docs/plans/evidence/tauri2-install-lifecycle/VERIFICATION-114-final.txt)记录 D10 本地预览验收完成，并保留正式发布边界。
- 本地门禁：[最后一次完整回归](../docs/plans/evidence/tauri2-install-lifecycle/tests-114-final-harness.log)在最终 harness 修改后 815/815、exit 0；[类型](../docs/plans/evidence/tauri2-install-lifecycle/typecheck-114.log)、[资源](../docs/plans/evidence/tauri2-install-lifecycle/resources-114.log)；构建退出码见构建身份报告。
- 安装与运行：[安装](../docs/plans/evidence/tauri2-install-lifecycle/install-114.json)、[启动](../docs/plans/evidence/tauri2-install-lifecycle/launch.json)、[20 词与设置切换](../docs/plans/evidence/tauri2-install-lifecycle/native-local-practice-matrix-114.json)、[正常重启](../docs/plans/evidence/tauri2-install-lifecycle/restart-114.json)。词矩阵中的文章字符串有截断，不用于完整 NCE1 五句验收。
- 文章验收单独见 [NCE1 原生逐词/DOM 证明](../docs/plans/evidence/tauri2-install-lifecycle/native-nce1-114.json)及[完整五句结果](../docs/plans/evidence/tauri2-install-lifecycle/native-nce1-114-clean.log)：与随包源句一致，实际完成 5 句，错误输入与运行错误均为 0。
- 桌面边界：[同步关闭](../docs/plans/evidence/tauri2-install-lifecycle/sync-tab-114.json)、[权限与导航](../docs/plans/evidence/tauri2-install-lifecycle/native-security-114.json)、[系统浏览器外链](../docs/plans/evidence/tauri2-install-lifecycle/native-external-open-114.json)。
- 数据保护：[真实原生保存与拒坏 ZIP](../docs/plans/evidence/tauri2-install-lifecycle/corrupt-zip-114-headed-final.json)、[物理输入授权与 C-ABI 操作](../docs/plans/evidence/tauri2-install-lifecycle/native-save-headed-driver-114.json)、[ZIP 内容与对话框关闭](../docs/plans/evidence/tauri2-install-lifecycle/native-export-content-114.json)。真实导出文件为 71,511 字节，包含 `data.json` 和测试音频；导出及拒坏 ZIP 后五个持久化键与内存状态均保持不变。

## 后续发布

正式公开发布另需定义并验证签名、干净机/WebView2、Windows 10、性能预算、分发与升级策略。物理 IME、人耳听感、网卡断开冷启动、真实配额、真实云同步、GitHub-hosted Actions、更新器及其他 OS 均未由本轮预览证明。云同步恢复必须由用户明确重新授权，不能按旧日志自动恢复接线。

## 历史记录

旧迁移计划、OSS 验收条、完整正式验收矩阵与逐批记录已移至本地[计划归档](../docs/plans/archive/tauri2-desktop-migration-plan.md)及[实施日志归档](../docs/plans/archive/tauri2-desktop-migration-progress.md)。归档保留当时判断和指令供溯源，不是当前任务规范；历史计数与旧产物不得覆盖本文状态。归档同样不随干净检出分发。
